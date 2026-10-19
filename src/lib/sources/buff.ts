/**
 * 网易 BUFF 数据源：官方接口 /api/market/goods。
 * 匿名访问会被拒绝（Forbidden / 限制访问），需要用户在设置里粘贴
 * 登录后的 Cookie（至少包含 session 字段）。
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 12_000
const MAX_PAGES = 3

export interface BuffItem {
  hashName: string
  nameCn: string
  /** 最低挂刀价（元） */
  sellMinPrice: number | null
  /** 求购最高价（元） */
  buyMaxPrice: number | null
  /** BUFF 记录的 Steam 参考价（元） */
  steamPriceCny: number | null
}

let cache: { at: number; items: BuffItem[]; cookieKey: string } | null = null
let inflight: Promise<BuffItem[]> | null = null

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 直连被拒/失败时尝试的公共代理（可能限流，失败自动跳过） */
const BUILTIN_PROXIES = [
  (target: string) => `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
]

async function fetchJson(url: string, cookie: string, headersExtra?: Record<string, string>) {
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Referer: 'https://buff.163.com/market/csgo',
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    ...headersExtra,
  }
  if (cookie) headers.Cookie = cookie
  const attempts: string[] = [url, ...BUILTIN_PROXIES.map((p) => p(url))]
  let lastErr: unknown = null
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
      })
      const json = (await res.json().catch(() => null)) as
        | { code?: string; error?: string; data?: { items?: Record<string, unknown>[] } }
        | null
      if (!json) {
        lastErr = new Error(`BUFF 响应解析失败 HTTP ${res.status}`)
        continue
      }
      if (json.code && json.code !== 'OK') {
        lastErr = new Error(
          json.code === 'Forbidden'
            ? 'BUFF 拒绝访问：请在设置中配置已登录的 BUFF Cookie'
            : `BUFF 接口错误：${json.code} ${json.error ?? ''}`.trim(),
        )
        continue
      }
      return Array.isArray(json.data?.items) ? json.data.items : []
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('BUFF 请求失败')
}

async function fetchPage(pageNum: number, cookie: string): Promise<Record<string, unknown>[]> {
  const url =
    'https://buff.163.com/api/market/goods?game=csgo' +
    `&page_num=${pageNum}&page_size=50&search=` +
    encodeURIComponent('武器箱')
  return fetchJson(url, cookie)
}

function mapItems(rows: Record<string, unknown>[]): BuffItem[] {
  const out: BuffItem[] = []
  for (const r of rows) {
    const hashName = typeof r.market_hash_name === 'string' ? r.market_hash_name : ''
    if (!hashName) continue
    const nameCn = typeof r.name === 'string' ? r.name : hashName
    const goodsInfo = (r.goods_info ?? {}) as Record<string, unknown>
    out.push({
      hashName,
      nameCn,
      sellMinPrice: num(r.sell_min_price),
      buyMaxPrice: num(r.buy_max_price),
      steamPriceCny: num(goodsInfo.steam_price_cny),
    })
  }
  return out
}

export async function fetchBuffCases(cookie: string, force = false): Promise<BuffItem[]> {
  if (!cookie) throw new Error('未配置 BUFF Cookie')
  const cookieKey = cookie.slice(0, 32)
  if (!force && cache && cache.cookieKey === cookieKey && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.items
  }
  if (inflight) return inflight
  inflight = (async () => {
    const merged = new Map<string, BuffItem>()
    let lastError: unknown = null
    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const rows = await fetchPage(page, cookie)
        for (const item of mapItems(rows)) {
          if (!merged.has(item.hashName)) merged.set(item.hashName, item)
        }
        if (rows.length < 50) break
      } catch (e) {
        lastError = e
        break
      }
    }
    if (merged.size === 0) {
      throw new Error(
        `BUFF 数据为空${lastError instanceof Error ? `：${lastError.message}` : ''}`,
      )
    }
    const items = Array.from(merged.values())
    cache = { at: Date.now(), items, cookieKey }
    return items
  })().finally(() => {
    inflight = null
  })
  return inflight
}
