/**
 * Steam 商店折扣数据源：官方搜索接口 specials=1（当前打折游戏）。
 * 返回 results_html 片段，按行解析（appid / 名称 / 折扣 / 价格 / 评测 / 发布日期）。
 *
 * 访问链路（与饰品价一致的降级策略）：
 *   1. 直连 store.steampowered.com（大陆网络通常可达；Watt Toolkit hosts 加速更稳）
 *   2. 用户在设置中配置的镜像/代理（{url} 模板或前缀拼接形式，通用）
 *   3. 内置公共代理（限流，尽力而为）
 *
 * 抓取顺序 sort_by=Reviews_DESC（评测数优先），保证有限条数内覆盖知名游戏。
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const PAGE_SIZE = 50
const MAX_PAGES = 40
const FETCH_TIMEOUT_MS = 15_000
const PAGE_GAP_MS = 250
const TOTAL_BUDGET_MS = 90_000
const CACHE_TTL_MS = 10 * 60 * 1000

/** 内置公共代理（无直连且未配置镜像时的兜底，限流明显） */
const BUILTIN_PROXIES = [
  (target: string) => `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
]

export type FetchVia = 'direct' | 'mirror' | 'proxy'

export interface SteamDiscountRow {
  appid: number
  name: string
  discountPct: number
  price: number
  originalPrice: number
  reviewScore: number | null
  reviewCount: number
  reviewLabel: string | null
  releaseDate: string | null
  releaseTs: number | null
  capsule: string | null
}

export interface SteamDiscountsResult {
  items: SteamDiscountRow[]
  totalAvailable: number | null
  via: FetchVia
  /** 部分页失败等情况下给出说明 */
  note: string | null
}

interface CacheEntry {
  at: number
  limit: number
  result: SteamDiscountsResult
}

let cache: CacheEntry | null = null
let inflight: { limit: number; promise: Promise<SteamDiscountsResult> } | null = null

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseCny(s: string | undefined | null): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/[¥￥$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 解析发布日期文本 → epoch ms（如「2026 年 10 月 28 日」；无法解析返回 null） */
function parseReleaseTs(s: string | null): number | null {
  if (!s) return null
  const m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (m) {
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isFinite(ts) ? ts : null
  }
  // 纯数字年份（如 "2018"）
  const y = s.match(/^(\d{4})$/)
  if (y) return Date.UTC(Number(y[1]), 0, 1)
  return null
}

/** 解析评测 tooltip：好评如潮<br>此游戏的 1,559 篇用户评测中有 96% 为好评。 */
function parseReviewTooltip(raw: string): {
  label: string | null
  score: number | null
  count: number
} {
  const decoded = decodeEntities(raw)
  const label = decoded.split('<')[0]?.trim() || null
  const m = decoded.match(/([\d,]+)\s*篇用户评测中有\s*([\d.]+)%\s*为好评/)
  if (!m) return { label, score: null, count: 0 }
  const count = Number(m[1].replace(/,/g, ''))
  const score = Number(m[2])
  return {
    label,
    score: Number.isFinite(score) ? score : null,
    count: Number.isFinite(count) ? count : 0,
  }
}

/** 解析搜索接口 results_html（纯函数，便于测试） */
export function parseSearchResults(html: string): SteamDiscountRow[] {
  const out: SteamDiscountRow[] = []
  const seen = new Set<number>()
  // 每行以商店链接开头；bundle/sub 行不以此形式出现，自动跳过
  const chunks = html.split('<a href="https://store.steampowered.com/app/')
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i]
    const appid = Number(c.match(/^(\d+)\//)?.[1] ?? NaN)
    if (!Number.isFinite(appid) || seen.has(appid)) continue
    const name = decodeEntities(c.match(/<span class="title">([^<]*)<\/span>/)?.[1] ?? '').trim()
    if (!name) continue

    const discountPct = Number(c.match(/data-discount="(\d+)"/)?.[1] ?? NaN)
    const finalCents = Number(c.match(/data-price-final="(\d+)"/)?.[1] ?? NaN)
    const finalDisplay = parseCny(c.match(/discount_final_price">([^<]*)</)?.[1])
    const price =
      Number.isFinite(finalCents) && finalCents > 0
        ? finalCents / 100
        : (finalDisplay ?? NaN)
    if (!Number.isFinite(price) || price <= 0) continue

    const originalDisplay = parseCny(c.match(/discount_original_price">([^<]*)</)?.[1])
    const originalPrice =
      originalDisplay ??
      (Number.isFinite(discountPct) && discountPct > 0 && discountPct < 100
        ? price / (1 - discountPct / 100)
        : price)
    if (!Number.isFinite(discountPct)) continue

    const tooltip = c.match(
      /<span class="search_review_summary[^"]*" data-tooltip-html="([^"]*)"/,
    )?.[1]
    const review = tooltip
      ? parseReviewTooltip(tooltip)
      : { label: null, score: null, count: 0 }

    const releaseDate =
      c.match(/class="search_released[^"]*">\s*([^<]*?)\s*</)?.[1]?.trim() || null

    seen.add(appid)
    out.push({
      appid,
      name,
      discountPct,
      price,
      originalPrice,
      reviewScore: review.score,
      reviewCount: review.count,
      reviewLabel: review.label,
      releaseDate,
      releaseTs: parseReleaseTs(releaseDate),
      capsule: c.match(/<img src="([^"]+)"/)?.[1] ?? null,
    })
  }
  return out
}

function buildAttempts(target: string, mirrors: string[]): { url: string; via: FetchVia }[] {
  const attempts: { url: string; via: FetchVia }[] = [{ url: target, via: 'direct' }]
  for (const raw of mirrors) {
    const m = raw.trim()
    if (!m) continue
    if (m.includes('{url}')) {
      attempts.push({ url: m.replace('{url}', encodeURIComponent(target)), via: 'mirror' })
    } else {
      attempts.push({ url: m.replace(/\/$/, '') + '/' + encodeURIComponent(target), via: 'mirror' })
    }
  }
  for (const p of BUILTIN_PROXIES) attempts.push({ url: p(target), via: 'proxy' })
  return attempts
}

interface SearchPageResult {
  html: string
  totalCount: number | null
  via: FetchVia
}

/** 单次抓取会话状态：直连一旦失败，后续页跳过直连（避免反复等超时） */
interface FetchSession {
  directDead: boolean
}

async function fetchSearchPage(
  start: number,
  mirrors: string[],
  session: FetchSession,
): Promise<SearchPageResult> {
  const target =
    'https://store.steampowered.com/search/results/?query' +
    `&start=${start}&count=${PAGE_SIZE}&dynamic_data=&sort_by=Reviews_DESC` +
    '&snr=1_7_7000_discounts_7001&specials=1&infinite=1&category1=998&cc=cn&l=schinese'
  let lastErr: unknown = null
  for (const { url, via } of buildAttempts(target, mirrors)) {
    if (via === 'direct' && session.directDead) continue
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
      })
      if (res.status === 429) {
        lastErr = new Error('公共代理限流（429）')
        continue
      }
      const json = (await res.json().catch(() => null)) as
        | { success?: number; results_html?: string; total_count?: number }
        | null
      if (!json || json.success !== 1 || typeof json.results_html !== 'string') {
        lastErr = new Error(`Steam 搜索接口响应异常 HTTP ${res.status}`)
        continue
      }
      return {
        html: json.results_html,
        totalCount: typeof json.total_count === 'number' ? json.total_count : null,
        via,
      }
    } catch (e) {
      lastErr = e
      if (via === 'direct') session.directDead = true
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Steam 搜索请求失败')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 批量拉取当前折扣游戏（按评测数降序取前 limit 款）。
 * 页级失败自动降级为部分结果（带 note），全失败抛错。
 */
export async function fetchSteamDiscounts(
  limit: number,
  mirrors: string[],
  force = false,
): Promise<SteamDiscountsResult> {
  const capped = Math.min(2000, Math.max(50, Math.floor(limit / PAGE_SIZE) * PAGE_SIZE))
  if (!force && cache && cache.limit === capped && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.result
  }
  if (inflight && inflight.limit === capped) return inflight.promise
  const promise = (async () => {
    const merged = new Map<number, SteamDiscountRow>()
    const session: FetchSession = { directDead: false }
    let totalAvailable: number | null = null
    let via: FetchVia = 'direct'
    let firstErr: unknown = null
    const deadline = Date.now() + TOTAL_BUDGET_MS
    for (let page = 0; page < MAX_PAGES; page++) {
      if (merged.size >= capped) break
      if (Date.now() > deadline) break
      const start = page * PAGE_SIZE
      try {
        const r = await fetchSearchPage(start, mirrors, session)
        if (totalAvailable === null) totalAvailable = r.totalCount
        via = r.via
        const rows = parseSearchResults(r.html)
        for (const row of rows) {
          if (!merged.has(row.appid)) merged.set(row.appid, row)
        }
        if (rows.length === 0) break
      } catch (e) {
        if (firstErr === null) firstErr = e
        break
      }
      await sleep(PAGE_GAP_MS)
    }
    if (merged.size === 0) {
      throw firstErr instanceof Error ? firstErr : new Error('Steam 折扣数据为空')
    }
    const note =
      firstErr && merged.size < capped
        ? `部分页抓取失败（${firstErr instanceof Error ? firstErr.message : '未知错误'}），已返回 ${merged.size} 款`
        : null
    const result: SteamDiscountsResult = {
      items: Array.from(merged.values()),
      totalAvailable,
      via,
      note,
    }
    cache = { at: Date.now(), limit: capped, result }
    return result
  })().finally(() => {
    if (inflight?.limit === capped) inflight = null
  })
  inflight = { limit: capped, promise }
  return promise
}
