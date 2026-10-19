/**
 * SteamDT 数据源（https://www.steamdt.com，国内可直连）。
 *
 * 借鉴开源项目 AetherSwap (github.com/VexedWilosn/AetherSwap) 的接口研究：
 * POST /api/user/ranking/v1/hanging-knife 一次返回一批商品的
 * BUFF / 悠悠有品(YOUPIN) / C5 / STEAM 四平台价格与求购价（biddingPrice）。
 *
 * 关键点：
 *  - 时间戳校验：13 位毫秒时间戳截取前 12 位，末位 = 各位数字之和 % 10
 *  - platformList 仅支持 BUFF/YOUPIN/C5 等枚举（指定"主平台"），
 *    响应每行恒带全部四平台详情
 *  - 临时性错误 errorCode 100/108 需退避重试
 *  - 排行榜仅覆盖活跃商品：用 minTransactionCount=1000 后数据集仅约 40 行，
 *    其中 26 款为武器箱（现代主流箱子全覆盖；冷门老箱由 IGXE 源补位）
 */

const API_URL = 'https://www.steamdt.com/api/user/ranking/v1/hanging-knife'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.97 Safari/537.36'

const CACHE_TTL_MS = 4 * 60 * 1000
const FETCH_TIMEOUT_MS = 12_000
const RETRYABLE_CODES = new Set([100, 108])
const PAGE_SIZE = 200
const MAX_PAGES = 3
const MIN_TRANSACTION_COUNT = '1000'

export interface SteamDTPlatformEntry {
  platformEnum: string
  platformName: string
  price: number | null
  sellNum: number | null
  biddingPrice: number | null
  biddingCount: number | null
}

export interface SteamDTCaseRow {
  hashName: string
  nameCn: string
  transactionCount: number
  /** 平台明细，键为 platformEnum：BUFF / YOUPIN / C5 / STEAM */
  platforms: Record<string, SteamDTPlatformEntry>
  /** Steam 价格（元）与更新时间 */
  steamPrice: number | null
  steamUpdateTime: number | null
  updateTime: number | null
}

let cache: { at: number; rows: Map<string, SteamDTCaseRow> } | null = null
let inflight: Promise<Map<string, SteamDTCaseRow>> | null = null

function makeTimestamp(): string {
  const raw = String(Date.now())
  const truncated = raw.slice(0, 12)
  const check = String(
    truncated.split('').reduce((acc, ch) => acc + Number(ch), 0) % 10,
  )
  return truncated + check
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

async function postOnce(page: number): Promise<Record<string, unknown>> {
  const ts = makeTimestamp()
  const payload = {
    page,
    pageSize: PAGE_SIZE,
    type: 'swap',
    wantToGet: 'STEAM_BALANCE',
    purchasePlan: '',
    salePlan: 'STEAM_SELL_PRICE',
    minSellPrice: '0.1',
    maxSellPrice: 5000,
    minTransactionCount: MIN_TRANSACTION_COUNT,
    platformList: ['BUFF'],
    currency: 'CNY',
    language: 'zh_CN',
    timestamp: ts,
  }
  const res = await fetch(`${API_URL}?timestamp=${ts}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Language: 'zh_CN',
      'X-App-Version': '1.0.0',
      'X-Currency': 'CNY',
      'X-Device': '1',
      Origin: 'https://www.steamdt.com',
      Referer: 'https://www.steamdt.com/hanging',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': BROWSER_UA,
      'Access-Token': 'undefined',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

async function postWithRetry(page: number): Promise<Record<string, unknown>[]> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await postOnce(page)
      if (result.success === true && Array.isArray(result.data)) {
        return result.data as Record<string, unknown>[]
      }
      const code = Number(result.errorCode)
      lastError = new Error(
        `SteamDT errorCode=${result.errorCode} ${String(result.errorMsg ?? '').slice(0, 60)}`,
      )
      if (!RETRYABLE_CODES.has(code)) break
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 600 * attempt + Math.random() * 300))
    }
  }
  throw lastError ?? new Error('SteamDT 请求失败')
}

function mapRows(rows: Record<string, unknown>[], out: Map<string, SteamDTCaseRow>) {
  for (const it of rows) {
    const hashName = typeof it.marketHashName === 'string' ? it.marketHashName : ''
    if (!hashName || !/Case$/i.test(hashName)) continue
    const platforms: Record<string, SteamDTPlatformEntry> = {}
    const list = Array.isArray(it.platformList) ? it.platformList : []
    for (const p of list) {
      const pe = p as Record<string, unknown>
      const en = typeof pe.platformEnum === 'string' ? pe.platformEnum : ''
      if (!en) continue
      platforms[en] = {
        platformEnum: en,
        platformName: String(pe.platformName ?? en),
        price: num(pe.price),
        sellNum: typeof pe.sellNum === 'number' ? pe.sellNum : null,
        biddingPrice: num(pe.biddingPrice),
        biddingCount: typeof pe.biddingCount === 'number' ? pe.biddingCount : null,
      }
    }
    out.set(hashName, {
      hashName,
      nameCn: String(it.name ?? hashName),
      transactionCount: Number(it.transactionCount ?? 0) || 0,
      platforms,
      steamPrice: num(it.steamPrice),
      steamUpdateTime:
        typeof it.steamUpdateTime === 'number' ? it.steamUpdateTime * 1000 : null,
      updateTime: typeof it.updateTime === 'number' ? Number(it.updateTime) * 1000 : null,
    })
  }
}

export async function fetchSteamDTCases(force = false): Promise<Map<string, SteamDTCaseRow>> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows
  if (inflight) return inflight
  inflight = (async () => {
    const out = new Map<string, SteamDTCaseRow>()
    let lastError: unknown = null
    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const rows = await postWithRetry(page)
        mapRows(rows, out)
        if (rows.length < PAGE_SIZE) break
      } catch (e) {
        lastError = e
        break
      }
    }
    if (out.size === 0) {
      throw new Error(
        `SteamDT 数据为空${lastError instanceof Error ? `：${lastError.message}` : ''}`,
      )
    }
    cache = { at: Date.now(), rows: out }
    return out
  })().finally(() => {
    inflight = null
  })
  return inflight
}

/** 快照描述（用于状态提示） */
export function steamdtCacheAge(): number | null {
  return cache ? Date.now() - cache.at : null
}
