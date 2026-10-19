/**
 * IGXE 数据源：通过 SSR 页面（Nuxt）抓取武器箱列表。
 * 页面 https://www.igxe.cn/market/csgo?keyword=武器箱&page_no=N&page_size=50
 * 内嵌 window.__NUXT__ 状态，包含 dataList（含中文名、market_hash_name、
 * min_price 最低挂刀价[元]、purchase_max_price 求购最高价[元] 等）。
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const MAX_PAGES = 3

export interface IgxeItem {
  id: number
  title: string
  hashName: string
  /** 最低挂刀价（元） */
  minPrice: number | null
  /** 求购最高价（元） */
  buyOrder: number | null
  saleCount: number
}

type NuxtValue = unknown

let cache: { at: number; items: IgxeItem[] } | null = null
let inflight: Promise<IgxeItem[]> | null = null

function extractNuxtPayload(html: string): NuxtValue | null {
  const start = html.indexOf('window.__NUXT__=')
  if (start < 0) return null
  const end = html.indexOf('</script>', start)
  if (end < 0) return null
  let expr = html.slice(start + 'window.__NUXT__='.length, end).trim()
  while (expr.endsWith(';')) expr = expr.slice(0, -1)
  if (!expr) return null
  try {
    // IGXE 是可信源（网易系站点），此处仅解析其自嵌的 Nuxt 状态数据
    const fn = new Function(`return (${expr})`)
    return fn() as NuxtValue
  } catch {
    return null
  }
}

function pickDataList(payload: NuxtValue): Record<string, unknown>[] {
  try {
    const data = (payload as { data?: Record<string, unknown> }).data
    if (!data) return []
    const first = data['0'] as { dataList?: Record<string, unknown>[] } | undefined
    return Array.isArray(first?.dataList) ? first.dataList : []
  } catch {
    return []
  }
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizePrice(minPrice: number | null, reference: number | null): number | null {
  // 绝大多数条目 min_price 单位为「元」。个别条目可能为「分」，
  // 用 reference_price（恒为元）做交叉校验归一化。
  if (minPrice === null) return null
  if (reference !== null && reference > 0) {
    const driftAbs = Math.abs(minPrice - reference) / reference
    const driftScaled = Math.abs(minPrice / 100 - reference) / reference
    if (driftAbs > 0.5 && driftScaled < 0.3) return minPrice / 100
  }
  return minPrice
}

async function fetchPage(pageNo: number): Promise<Record<string, unknown>[]> {
  const url =
    'https://www.igxe.cn/market/csgo?keyword=' +
    encodeURIComponent('武器箱') +
    `&page_no=${pageNo}&page_size=50`
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`IGXE 响应异常 HTTP ${res.status}`)
  const html = await res.text()
  const payload = extractNuxtPayload(html)
  if (!payload) throw new Error('IGXE 页面解析失败（未找到内嵌数据）')
  return pickDataList(payload)
}

function mapItems(rows: Record<string, unknown>[]): IgxeItem[] {
  const out: IgxeItem[] = []
  for (const r of rows) {
    const hashName = typeof r.market_hash_name === 'string' ? r.market_hash_name : ''
    const title = typeof r.title === 'string' ? r.title : ''
    if (!hashName) continue
    const isCase = /武器箱\s*$/.test(title) || /(^|\s)case$/i.test(hashName.trim())
    if (!isCase) continue
    const rawMin = num(r.min_price)
    const ref = num(r.reference_price)
    out.push({
      id: typeof r.id === 'number' ? r.id : 0,
      title,
      hashName,
      minPrice: normalizePrice(rawMin, ref),
      buyOrder: num(r.purchase_max_price),
      saleCount: typeof r.sale_count === 'number' ? r.sale_count : 0,
    })
  }
  return out
}

export async function fetchIgxeCases(force = false): Promise<IgxeItem[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items
  if (inflight) return inflight
  inflight = (async () => {
    const merged = new Map<string, IgxeItem>()
    let lastError: unknown = null
    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const rows = await fetchPage(page)
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
        `IGXE 数据为空${lastError instanceof Error ? `：${lastError.message}` : ''}`,
      )
    }
    const items = Array.from(merged.values())
    cache = { at: Date.now(), items }
    return items
  })().finally(() => {
    inflight = null
  })
  return inflight
}
