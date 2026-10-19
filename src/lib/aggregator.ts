/**
 * 聚合器：合并 IGXE / BUFF / Steam 三源数据，计算跨平台差价收益率。
 *
 * 收益率定义（小数，0.1 = +10%）：
 *  - buffToSteam : 在 BUFF 按最低挂刀价买入 → 在 Steam 卖出（扣 steam 手续费）
 *  - igxeToSteam : 在 IGXE 按最低挂刀价买入 → 在 Steam 卖出
 *  - steamToBuff : 在 Steam 买入 → 在 BUFF 挂刀卖出（扣 BUFF 手续费）
 *  - steamToIgxe : 在 Steam 买入 → 在 IGXE 卖出
 *  - igxeToBuff  : 在 IGXE 买入 → 在 BUFF 卖出（国内跨平台）
 *  - buffToIgxe  : 在 BUFF 买入 → 在 IGXE 卖出
 */

import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { fetchIgxeCases, type IgxeItem } from '@/lib/sources/igxe'
import { fetchBuffCases, type BuffItem } from '@/lib/sources/buff'
import { fetchSteamDTCases, type SteamDTCaseRow } from '@/lib/sources/steamdt'
import { getSteamPriceCny, enqueueSteamRefresh, steamCacheStats } from '@/lib/sources/steam'
import type { AppSettings, CasePrice, PricesResponse, SourceStatus } from '@/lib/types'

const globalStore = globalThis as unknown as {
  __aggLastSnapshotAt?: number
  __aggLastPruneAt?: number
}

function ratio(cost: number | null, proceeds: number | null): number | null {
  if (cost === null || proceeds === null || cost <= 0) return null
  return (proceeds - cost) / cost
}

function bestOf(ratios: { key: string; v: number | null }[]): {
  bestRatio: number | null
  bestDirection: string | null
} {
  let best: number | null = null
  let dir: string | null = null
  for (const { key, v } of ratios) {
    if (v !== null && (best === null || v > best)) {
      best = v
      dir = key
    }
  }
  return { bestRatio: best, bestDirection: dir }
}

async function saveSnapshots(cases: CasePrice[]) {
  const now = Date.now()
  if (globalStore.__aggLastSnapshotAt && now - globalStore.__aggLastSnapshotAt < 5 * 60 * 1000) {
    return
  }
  globalStore.__aggLastSnapshotAt = now
  try {
    const rows = cases
      .filter((c) => c.steam !== null || c.buff !== null || c.igxe !== null)
      .map((c) => ({
        hashName: c.hashName,
        nameCn: c.nameCn,
        steamPrice: c.steam,
        buffPrice: c.buff,
        igxePrice: c.igxe,
        buffToSteamRatio: c.buffToSteam,
        igxeToSteamRatio: c.igxeToSteam,
        igxeToBuffRatio: c.igxeToBuff,
      }))
    if (rows.length > 0) await db.snapshot.createMany({ data: rows })
    // 清理 48h 前的历史
    if (!globalStore.__aggLastPruneAt || now - globalStore.__aggLastPruneAt > 60 * 60 * 1000) {
      globalStore.__aggLastPruneAt = now
      await db.snapshot.deleteMany({
        where: { createdAt: { lt: new Date(now - 48 * 3600 * 1000) } },
      })
    }
  } catch {
    // 快照失败不影响主流程
  }
}

export async function aggregate(opts: { force?: boolean } = {}): Promise<PricesResponse> {
  const settings: AppSettings = await getSettings()
  const statuses: SourceStatus[] = []

  // ---- IGXE（无需鉴权，基础箱单来源）----
  let igxeItems: IgxeItem[] = []
  try {
    igxeItems = await fetchIgxeCases(opts.force)
    statuses.push({
      name: 'igxe',
      state: 'ok',
      itemCount: igxeItems.length,
      lastSuccess: Date.now(),
    })
  } catch (e) {
    statuses.push({
      name: 'igxe',
      state: 'error',
      message: e instanceof Error ? e.message : 'IGXE 获取失败',
    })
  }

  // ---- SteamDT（国内可直连的聚合源：一次请求带 BUFF/YOUPIN/C5/STEAM 四平台）----
  let steamdtRows = new Map<string, SteamDTCaseRow>()
  let steamdtAvailable = false
  try {
    steamdtRows = await fetchSteamDTCases(opts.force)
    steamdtAvailable = steamdtRows.size > 0
    statuses.push({
      name: 'steamdt',
      state: 'ok',
      itemCount: steamdtRows.size,
      lastSuccess: Date.now(),
      message: '国内可直连，聚合 BUFF/悠悠/C5/Steam 四平台',
    })
  } catch (e) {
    statuses.push({
      name: 'steamdt',
      state: 'error',
      message: `SteamDT：${e instanceof Error ? e.message : '获取失败'}`,
    })
  }

  // ---- 网易 BUFF（官方接口需要 Cookie；未配置时由 SteamDT 补位）----
  let buffItems: BuffItem[] = []
  let buffSteamRefAvailable = false
  if (!settings.buffCookie) {
    statuses.push({
      name: 'buff',
      state: steamdtAvailable ? 'degraded' : 'unconfigured',
      message: steamdtAvailable
        ? 'BUFF 数据来自 SteamDT 聚合源（在设置中粘贴 Cookie 可获取官方实时数据）'
        : '未配置 BUFF Cookie（在设置中粘贴后即可获取实时数据）',
    })
  } else {
    try {
      buffItems = await fetchBuffCases(settings.buffCookie, opts.force)
      buffSteamRefAvailable = buffItems.some((b) => b.steamPriceCny !== null)
      statuses.push({
        name: 'buff',
        state: 'ok',
        itemCount: buffItems.length,
        lastSuccess: Date.now(),
      })
    } catch (e) {
      statuses.push({
        name: 'buff',
        state: steamdtAvailable ? 'degraded' : 'error',
        message: steamdtAvailable
          ? `官方 BUFF 接口失败（${e instanceof Error ? e.message : '未知错误'}），已由 SteamDT 聚合源补位`
          : e instanceof Error
            ? e.message
            : 'BUFF 获取失败',
      })
    }
  }

  // ---- 合并箱单（以 market_hash_name 为主键）----
  const merged = new Map<
    string,
    {
      hashName: string
      nameCn: string
      igxeId?: number
      igxe: number | null
      igxeBuyOrder: number | null
      buff: number | null
      buffBuyOrder: number | null
      buffVia: 'official' | 'steamdt' | null
      buffSteamRef: number | null
    }
  >()

  for (const it of igxeItems) {
    merged.set(it.hashName, {
      hashName: it.hashName,
      nameCn: it.title || it.hashName,
      igxeId: it.id || undefined,
      igxe: it.minPrice,
      igxeBuyOrder: it.buyOrder,
      buff: null,
      buffBuyOrder: null,
      buffVia: null,
      buffSteamRef: null,
    })
  }
  for (const b of buffItems) {
    const exist = merged.get(b.hashName)
    if (exist) {
      exist.buff = b.sellMinPrice
      exist.buffBuyOrder = b.buyMaxPrice
      exist.buffVia = 'official'
      exist.buffSteamRef = b.steamPriceCny
      if (!exist.nameCn) exist.nameCn = b.nameCn
    } else {
      merged.set(b.hashName, {
        hashName: b.hashName,
        nameCn: b.nameCn,
        igxe: null,
        igxeBuyOrder: null,
        buff: b.sellMinPrice,
        buffBuyOrder: b.buyMaxPrice,
        buffVia: 'official',
        buffSteamRef: b.steamPriceCny,
      })
    }
  }
  // SteamDT 补位：未覆盖的箱子入表；已有官方 BUFF 数据的保持官方
  for (const [hash, row] of steamdtRows) {
    const exist = merged.get(hash)
    const dtBuff = row.platforms.BUFF?.price ?? null
    const dtBuffBid = row.platforms.BUFF?.biddingPrice ?? null
    if (!exist) {
      merged.set(hash, {
        hashName: hash,
        nameCn: row.nameCn || hash,
        igxe: null,
        igxeBuyOrder: null,
        buff: dtBuff,
        buffBuyOrder: dtBuffBid,
        buffVia: dtBuff !== null ? 'steamdt' : null,
        buffSteamRef: null,
      })
    } else {
      if (exist.buff === null && dtBuff !== null) {
        exist.buff = dtBuff
        exist.buffBuyOrder = dtBuffBid
        exist.buffVia = 'steamdt'
      }
      if (!exist.nameCn || exist.nameCn === exist.hashName) {
        exist.nameCn = row.nameCn || exist.nameCn
      }
    }
  }

  const all = Array.from(merged.values())
  const hashNames = all.map((c) => c.hashName)

  // ---- Steam 价格：SteamDT 聚合优先（国内直连稳定），未覆盖项回退直连/镜像，最后 BUFF 参考 ----
  const mirrors = parseMirrors(settings.steamMirrors)
  const steamCache = steamCacheStats()
  const covered = hashNames.filter((h) => {
    const dt = steamdtRows.get(h)
    return dt && (dt.platforms.STEAM?.price ?? dt.steamPrice) !== null
  })
  const uncovered = hashNames.filter((h) => !covered.includes(h))
  if (uncovered.length > 0) {
    // 请求路径内小批量取价（未覆盖项通常很少）
    let directCount = 0
    for (const h of uncovered) {
      if (directCount >= 4) break
      const p = await getSteamPriceCny(h, mirrors)
      if (p) directCount++
    }
    enqueueSteamRefresh(uncovered, mirrors)
  }

  const fees = {
    steam: settings.steamFeePct / 100,
    buff: settings.buffFeePct / 100,
    igxe: settings.igxeFeePct / 100,
  }

  // ---- 组装 + 计算收益率 ----
  let steamOk = 0
  let steamViaSteamdt = 0
  const cases: CasePrice[] = []
  for (const c of all) {
    const dt = steamdtRows.get(c.hashName)
    const dtSteamPrice = dt ? (dt.platforms.STEAM?.price ?? dt.steamPrice) : null
    let sp: Awaited<ReturnType<typeof getSteamPriceCny>> = null
    if (dtSteamPrice === null) {
      sp = await getSteamPriceCny(c.hashName, mirrors)
    }
    const useBuffRef =
      dtSteamPrice === null && sp === null && buffSteamRefAvailable && c.buffSteamRef !== null
    const steam = dtSteamPrice ?? (sp ? sp.price : useBuffRef ? c.buffSteamRef : null)
    if (steam !== null) {
      steamOk++
      if (dtSteamPrice !== null) steamViaSteamdt++
    }

    const steamNet = steam !== null ? steam * (1 - fees.steam) : null
    const buffNet = c.buff !== null ? c.buff * (1 - fees.buff) : null
    const igxeNet = c.igxe !== null ? c.igxe * (1 - fees.igxe) : null

    const r = {
      buffToSteam: ratio(c.buff, steamNet),
      igxeToSteam: ratio(c.igxe, steamNet),
      steamToBuff: ratio(steam, buffNet),
      steamToIgxe: ratio(steam, igxeNet),
      igxeToBuff: ratio(c.igxe, buffNet),
      buffToIgxe: ratio(c.buff, igxeNet),
      igxeSpread: ratio(
        c.igxe,
        c.igxeBuyOrder !== null ? c.igxeBuyOrder * (1 - fees.igxe) : null,
      ),
    }
    const best = bestOf([
      { key: 'buffToSteam', v: r.buffToSteam },
      { key: 'igxeToSteam', v: r.igxeToSteam },
      { key: 'steamToBuff', v: r.steamToBuff },
      { key: 'steamToIgxe', v: r.steamToIgxe },
      { key: 'igxeToBuff', v: r.igxeToBuff },
      { key: 'buffToIgxe', v: r.buffToIgxe },
      { key: 'igxeSpread', v: r.igxeSpread },
    ])

    cases.push({
      hashName: c.hashName,
      nameCn: c.nameCn,
      nameEn: c.hashName,
      igxeId: c.igxeId,
      steam,
      steamMedian: sp?.median ?? null,
      steamVia:
        dtSteamPrice !== null
          ? 'steamdt'
          : sp
            ? sp.via
            : useBuffRef
              ? 'buff-reference'
              : null,
      buff: c.buff,
      buffBuyOrder: c.buffBuyOrder,
      buffVia: c.buffVia,
      buffSteamRef: c.buffSteamRef,
      igxe: c.igxe,
      igxeBuyOrder: c.igxeBuyOrder,
      ...r,
      bestRatio: best.bestRatio,
      bestDirection: best.bestDirection,
    } satisfies CasePrice)
  }

  cases.sort((a, b) => (b.bestRatio ?? -9) - (a.bestRatio ?? -9))

  const steamStatus: SourceStatus =
    steamOk > 0 && steamViaSteamdt > 0
      ? {
          name: 'steam',
          state: 'ok',
          itemCount: steamOk,
          lastSuccess: Date.now(),
          message: `SteamDT 聚合源（${steamViaSteamdt} 项）${steamOk - steamViaSteamdt > 0 ? ' + 直连/镜像补位' : ''}`,
        }
      : steamOk > 0
        ? {
            name: 'steam',
            state: 'ok',
            itemCount: steamOk,
            lastSuccess: Date.now(),
            message: steamCache.pending > 0 ? `后台刷新中，剩余 ${steamCache.pending} 项` : undefined,
          }
        : {
            name: 'steam',
            state: 'error',
            message:
              '无法获取 Steam 价格（steamcommunity 不可达且 SteamDT 失败）。' +
              '可在设置中配置 Steam 镜像/代理；BUFF↔IGXE 分析不受影响。',
          }
  statuses.push(steamStatus)

  await saveSnapshots(cases)

  return {
    updatedAt: Date.now(),
    fees,
    cases,
    statuses,
    steamThrottled: steamCache.pending > 0,
  }
}

function parseMirrors(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
