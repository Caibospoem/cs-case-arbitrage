/**
 * IsThereAnyDeal 史低价源（可选，需用户配置 API Key）。
 * 链路：
 *   1. POST /lookup/id/shop/61/v1  —— Steam appid → ITAD gameId（批量）
 *   2. POST /games/historylow/v1?country=CN —— gameId → 史低（批量，region 中国 / 人民币）
 *
 * Key 获取：https://isthereanydeal.com 免费注册 → 个人设置 Apps → 创建 API Key。
 * 文档：https://github.com/isthereanydeal/api
 */

import type { DiscountLow } from '@/lib/types'

const BASE = 'https://api.isthereanydeal.com'
const STEAM_SHOP_ID = 61
const LOOKUP_CHUNK = 100
const HISTORY_CHUNK = 200
const REQUEST_GAP_MS = 150
const FETCH_TIMEOUT_MS = 20_000

export interface ItadResult {
  /** appid → 史低 */
  lows: Map<number, DiscountLow>
  /** 未在 ITAD 收录的 appid 数量 */
  missing: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function itadPost<T>(path: string, key: string, body: unknown): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${BASE}${path}${sep}key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('ITAD API Key 无效或已过期，请到 isthereanydeal.com 重新生成')
  }
  if (!res.ok) {
    throw new Error(`ITAD 接口 HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

/** 批量查询 Steam appid 的 ITAD 史低（人民币） */
export async function fetchItadLows(appids: number[], key: string): Promise<ItadResult> {
  const lows = new Map<number, DiscountLow>()
  if (appids.length === 0) return { lows, missing: 0 }
  const keyTrimmed = key.trim()
  if (!keyTrimmed) throw new Error('未配置 ITAD API Key')

  // 1. appid → gid（跳过未收录）
  const gidToAppid = new Map<string, number>()
  const idList = appids.slice()
  for (let i = 0; i < idList.length; i += LOOKUP_CHUNK) {
    const chunk = idList.slice(i, i + LOOKUP_CHUNK)
    const resp = await itadPost<Record<string, string | null>>(
      `/lookup/id/shop/${STEAM_SHOP_ID}/v1`,
      keyTrimmed,
      chunk.map((id) => `app/${id}`),
    )
    for (const [shopIdKey, gid] of Object.entries(resp)) {
      const appid = Number(shopIdKey.split('/')[1])
      if (Number.isFinite(appid) && gid) gidToAppid.set(gid, appid)
    }
    if (i + LOOKUP_CHUNK < idList.length) await sleep(REQUEST_GAP_MS)
  }

  // 2. gid → 史低（country=CN → 人民币计价）
  const gids = Array.from(gidToAppid.keys())
  for (let i = 0; i < gids.length; i += HISTORY_CHUNK) {
    const chunk = gids.slice(i, i + HISTORY_CHUNK)
    const resp = await itadPost<
      { id: string; low: { shop: { name?: string }; price: { amount?: number }; cut?: number; timestamp?: string } | null }[]
    >('/games/historylow/v1?country=CN', keyTrimmed, chunk)
    for (const row of resp) {
      const appid = gidToAppid.get(row.id)
      if (!appid || !row.low) continue
      const amount = row.low.price?.amount
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) continue
      lows.set(appid, {
        price: amount,
        cut: row.low.cut ?? 0,
        at: row.low.timestamp ? Date.parse(row.low.timestamp) : 0,
        shop: row.low.shop?.name ?? '未知商店',
      })
    }
    if (i + HISTORY_CHUNK < gids.length) await sleep(REQUEST_GAP_MS)
  }

  return { lows, missing: appids.length - gids.length }
}
