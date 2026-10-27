/**
 * Steam 市场数据源：priceoverview 接口（CNY, currency=23）。
 *
 * 网络说明：steamcommunity.com 在大陆网络环境下通常被 DNS 污染无法直连。
 * 因此按以下顺序尝试，全部失败则返回 null（不阻塞 BUFF↔IGXE 分析）：
 *  1. 直连（若此前 10 分钟内失败则快速跳过）
 *  2. 用户在设置中配置的镜像/代理模板：
 *     - 含 {url}  →  {url} 替换为 encodeURIComponent(目标URL)
 *     - 以 / 结尾 →  前缀拼接 encodeURIComponent(目标URL)
 *     - 否则      →  视为反代域名，替换 https://steamcommunity.com
 *  3. 内置公共代理候选（失败自动跳过）
 *
 * Steam 接口有频率限制（约 20 次/分钟），因此：
 *  - 单品缓存 10 分钟
 *  - 每轮只刷新一小批（预算制），由聚合器循环调用逐步填满
 */

import { steamAppIdFor } from '@/lib/extra-items'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const ITEM_TTL_MS = 10 * 60 * 1000
export { ITEM_TTL_MS }
const FAIL_TTL_MS = 90 * 1000
const DIRECT_COOLDOWN_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 6_000
const REFRESH_INTERVAL_MS = 1200

/** 内置公共代理候选（可能被限流，失败自动跳过） */
const BUILTIN_PROXIES = [
  (target: string) => `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
]

export interface SteamPrice {
  price: number
  median: number | null
  via: 'direct' | 'mirror' | 'proxy'
  ts: number
}

interface CacheEntry {
  value: SteamPrice | null
  ts: number
}

const globalStore = globalThis as unknown as {
  __steamPriceCache?: Map<string, CacheEntry>
  __steamDirectDownUntil?: number
  __steamQueue?: string[]
  __steamRunning?: boolean
  __steamLoopStarted?: boolean
  __steamMirrors?: string[]
  __steamLastTick?: number
}

const cache = (globalStore.__steamPriceCache ??= new Map<string, CacheEntry>())

function buildTarget(hashName: string): string {
  return (
    `https://steamcommunity.com/market/priceoverview/?appid=${steamAppIdFor(hashName)}&currency=23&market_hash_name=` +
    encodeURIComponent(hashName)
  )
}

function mirrorTargets(target: string, mirrors: string[]): { url: string; via: 'mirror' | 'proxy' }[] {
  const out: { url: string; via: 'mirror' | 'proxy' }[] = []
  for (const raw of mirrors) {
    const m = raw.trim()
    if (!m) continue
    if (m.includes('{url}')) {
      out.push({ url: m.replace('{url}', encodeURIComponent(target)), via: 'mirror' })
    } else if (m.endsWith('=')) {
      out.push({ url: m + encodeURIComponent(target), via: 'mirror' })
    } else if (m.endsWith('/')) {
      out.push({ url: m + target.replace('https://steamcommunity.com', '').replace(/^\//, ''), via: 'mirror' })
    } else {
      out.push({ url: target.replace('https://steamcommunity.com', m.replace(/\/$/, '')), via: 'mirror' })
    }
  }
  for (const p of BUILTIN_PROXIES) out.push({ url: p(target), via: 'proxy' })
  return out
}

function parsePriceOverview(json: Record<string, unknown>): SteamPrice | null {
  if (json.success !== true) return null
  const parse = (v: unknown): number | null => {
    if (typeof v !== 'string') return null
    const n = parseFloat(v.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const price = parse(json.lowest_price)
  if (price === null) return null
  return { price, median: parse(json.median_price), via: 'direct', ts: Date.now() }
}

async function tryFetch(url: string, via: 'direct' | 'mirror' | 'proxy'): Promise<SteamPrice | null> {
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/plain, */*',
  }
  if (via !== 'direct') headers.Referer = 'https://steamcommunity.com'
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as Record<string, unknown>
  const parsed = parsePriceOverview(json)
  if (!parsed) throw new Error('响应内容无效')
  return { ...parsed, via }
}

async function fetchOne(hashName: string, mirrors: string[]): Promise<SteamPrice | null> {
  const target = buildTarget(hashName)

  // 1) 直连
  const now = Date.now()
  if ((globalStore.__steamDirectDownUntil ?? 0) < now) {
    try {
      const p = await tryFetch(target, 'direct')
      globalStore.__steamDirectDownUntil = 0
      return p
    } catch {
      globalStore.__steamDirectDownUntil = Date.now() + DIRECT_COOLDOWN_MS
    }
  }

  // 2) 镜像 + 3) 内置代理
  for (const { url, via } of mirrorTargets(target, mirrors)) {
    try {
      return await tryFetch(url, via)
    } catch {
      // 尝试下一个
    }
  }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 立即取价（带缓存）；用于 API 请求路径 */
export async function getSteamPriceCny(hashName: string, mirrors: string[]): Promise<SteamPrice | null> {
  const hit = cache.get(hashName)
  const now = Date.now()
  if (hit) {
    if (hit.value && now - hit.ts < ITEM_TTL_MS) return hit.value
    if (!hit.value && now - hit.ts < FAIL_TTL_MS) return null
  }
  const value = await fetchOne(hashName, mirrors)
  cache.set(hashName, { value, ts: now })
  if (value) queueTick(mirrors)
  return value
}

/** 仅读缓存不发请求；maxAgeMs 限制新鲜度（超过视为 miss）。直连模式下用于请求路径组装 */
export function peekSteamPrice(hashName: string, maxAgeMs?: number): SteamPrice | null {
  const hit = cache.get(hashName)
  if (!hit?.value) return null
  if (maxAgeMs != null && Date.now() - hit.ts >= maxAgeMs) return null
  return hit.value
}

/** 将待刷新的 hashName 排入后台轮询队列 */
export function enqueueSteamRefresh(hashNames: string[], mirrors: string[]) {
  const q = (globalStore.__steamQueue ??= [])
  const known = new Set(q)
  for (const h of hashNames) {
    const hit = cache.get(h)
    if (hit && hit.value && Date.now() - hit.ts < ITEM_TTL_MS) continue
    if (!known.has(h)) q.push(h)
  }
  globalStore.__steamMirrors = mirrors
  startLoop()
}

function queueTick(mirrors?: string[]) {
  const q = globalStore.__steamQueue
  if (!q || q.length === 0) return
  const m = mirrors ?? globalStore.__steamMirrors ?? []
  if (globalStore.__steamRunning) return
  globalStore.__steamRunning = true
  ;(async () => {
    try {
      const deadline = Date.now() + 6000
      while (q.length > 0 && Date.now() < deadline) {
        const h = q.shift()!
        const p = await fetchOne(h, m)
        cache.set(h, { value: p, ts: Date.now() })
        await sleep(REFRESH_INTERVAL_MS)
      }
    } finally {
      globalStore.__steamRunning = false
    }
  })()
}

function startLoop() {
  if (globalStore.__steamLoopStarted) return
  globalStore.__steamLoopStarted = true
  const timer = setInterval(() => {
    const now = Date.now()
    if (now - (globalStore.__steamLastTick ?? 0) < 2500) return
    globalStore.__steamLastTick = now
    queueTick()
  }, 3000)
  // 不阻止进程退出
  if (typeof timer.unref === 'function') timer.unref()
}

export function steamCacheStats() {
  let fresh = 0
  let stale = 0
  const now = Date.now()
  for (const { value, ts } of cache.values()) {
    if (value && now - ts < ITEM_TTL_MS) fresh++
    else stale++
  }
  return { fresh, stale, pending: globalStore.__steamQueue?.length ?? 0 }
}
