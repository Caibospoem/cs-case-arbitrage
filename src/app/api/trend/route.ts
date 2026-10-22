import { NextRequest, NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Steam 官方成交历史走势（免登录）。
 *
 * 原理：steamcommunity 市场列表页 HTML 服务端内嵌了 `var line1=[[时间,价格,销量],...]`
 * 的历史成交快照（中位成交价 + 日/周销量，约一年）。无需任何 Cookie。
 *
 * 抓取顺序：直连 → 用户配置镜像(steamMirrors) → 内置公共代理。
 * 结果缓存 1 小时。
 */

const FETCH_TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 60 * 60 * 1000

/** 内置公共代理候选（可能被限流，失败自动跳过） */
const BUILTIN_PROXIES = [
  (target: string) => `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
]

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface TrendPoint {
  t: number // 时间戳 ms
  price: number // 中位成交价（元）
  volume: number // 销量
}

interface TrendCacheEntry {
  points: TrendPoint[]
  via: 'direct' | 'mirror' | 'proxy'
  at: number
}

const globalStore = globalThis as unknown as { __trendCache?: Map<string, TrendCacheEntry> }
const cache = (globalStore.__trendCache ??= new Map<string, TrendCacheEntry>())

function buildTargets(hashName: string, mirrors: string): { url: string; via: 'direct' | 'mirror' | 'proxy' }[] {
  const target =
    'https://steamcommunity.com/market/listings/730/' + encodeURIComponent(hashName)
  const out: { url: string; via: 'direct' | 'mirror' | 'proxy' }[] = [{ url: target, via: 'direct' }]
  for (const raw of mirrors.split(/[\n,]/)) {
    const m = raw.trim()
    if (!m) continue
    if (m.includes('{url}')) {
      out.push({ url: m.replace('{url}', encodeURIComponent(target)), via: 'mirror' })
    } else if (m.endsWith('=')) {
      out.push({ url: m + encodeURIComponent(target), via: 'mirror' })
    } else if (m.endsWith('/')) {
      out.push({
        url: m + target.replace('https://steamcommunity.com', '').replace(/^\//, ''),
        via: 'mirror',
      })
    } else {
      out.push({ url: target.replace('https://steamcommunity.com', m.replace(/\/$/, '')), via: 'mirror' })
    }
  }
  for (const p of BUILTIN_PROXIES) out.push({ url: p(target), via: 'proxy' })
  return out
}

/** 从 listing 页 HTML 中提取内嵌历史快照 */
function extractLine1(html: string): TrendPoint[] {
  // HTML 中该行形如:  var line1=[ [1700000000, "1.23", "45"], ... ];
  const m = html.match(/var\s+line1\s*=\s*(\[\s*\[[\s\S]{10,}?\]\s*\])\s*;/)
  if (!m) return []
  let raw: unknown
  try {
    raw = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const points: TrendPoint[] = []
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 3) continue
    const [time, price, volume] = item as [string, string, string]
    const t = Date.parse(time) // "Mon Jan 01 2024 01:00:00 GMT+0000"
    const p = parseFloat(price)
    const v = parseInt(volume, 10)
    if (!Number.isFinite(t) || !Number.isFinite(p) || p <= 0) continue
    points.push({ t, price: p, volume: Number.isFinite(v) ? v : 0 })
  }
  return points.sort((a, b) => a.t - b.t)
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.includes('var line1') ? text : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  const hashName = (req.nextUrl.searchParams.get('hashName') ?? '').trim()
  if (!hashName) {
    return NextResponse.json({ error: '缺少 hashName 参数' }, { status: 400 })
  }

  // 命中缓存直接返回
  const hit = cache.get(hashName)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({
      hashName,
      source: 'steam-official-history',
      via: hit.via,
      cached: true,
      fetchedAt: hit.at,
      points: hit.points,
      note: 'Steam 官方市场成交历史（中位成交价，免登录页面内嵌数据）',
    })
  }

  const settings = await getSettings()
  for (const { url, via } of buildTargets(hashName, settings.steamMirrors)) {
    const html = await fetchHtml(url)
    if (!html) continue
    const points = extractLine1(html)
    if (points.length === 0) continue
    cache.set(hashName, { points, via, at: Date.now() })
    return NextResponse.json({
      hashName,
      source: 'steam-official-history',
      via,
      cached: false,
      fetchedAt: Date.now(),
      points,
      note: 'Steam 官方市场成交历史（中位成交价，免登录页面内嵌数据）',
    })
  }

  return NextResponse.json(
    {
      hashName,
      source: 'steam-official-history',
      via: null,
      points: [],
      note:
        '无法获取 Steam 成交历史：steamcommunity 不可达。国内网络需在「设置 → Steam 镜像」配置可用的 Steam 镜像或代理（模板含 {url} 或前缀形式）。',
    },
    { status: 200 },
  )
}
