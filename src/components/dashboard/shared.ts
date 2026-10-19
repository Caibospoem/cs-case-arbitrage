import type { RatioDirection } from '@/lib/types'

export const DIRECTIONS: { key: RatioDirection; label: string; short: string; desc: string }[] = [
  {
    key: 'buffToSteam',
    label: 'BUFF 买 → Steam 卖',
    short: 'BUFF→Steam',
    desc: '在网易 BUFF 按最低挂刀价买入，在 Steam 市场卖出（Steam 收取约 15% 手续费）',
  },
  {
    key: 'igxeToSteam',
    label: 'IGXE 买 → Steam 卖',
    short: 'IGXE→Steam',
    desc: '在 IGXE 按最低挂刀价买入，在 Steam 市场卖出（Steam 收取约 15% 手续费）',
  },
  {
    key: 'steamToBuff',
    label: 'Steam 买 → BUFF 卖',
    short: 'Steam→BUFF',
    desc: '在 Steam 市场买入，在 BUFF 挂刀卖出（BUFF 收取约 2.5% 手续费）',
  },
  {
    key: 'steamToIgxe',
    label: 'Steam 买 → IGXE 卖',
    short: 'Steam→IGXE',
    desc: '在 Steam 市场买入，在 IGXE 挂刀卖出（IGXE 收取约 2.5% 手续费）',
  },
  {
    key: 'igxeToBuff',
    label: 'IGXE 买 → BUFF 卖',
    short: 'IGXE→BUFF',
    desc: '国内跨平台：在 IGXE 按最低挂刀价买入，在 BUFF 挂刀卖出',
  },
  {
    key: 'buffToIgxe',
    label: 'BUFF 买 → IGXE 卖',
    short: 'BUFF→IGXE',
    desc: '国内跨平台：在 BUFF 按最低挂刀价买入，在 IGXE 挂刀卖出',
  },
  {
    key: 'igxeSpread',
    label: 'IGXE 内部差价',
    short: 'IGXE 内部',
    desc: '在 IGXE 按最低挂刀价买入，直接卖给 IGXE 求购单（吃单价差，扣手续费）',
  },
]

export const DIRECTION_MAP: Record<RatioDirection, (typeof DIRECTIONS)[number]> =
  Object.fromEntries(DIRECTIONS.map((d) => [d.key, d])) as Record<
    RatioDirection,
    (typeof DIRECTIONS)[number]
  >

export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (v >= 1000) return `¥${v.toFixed(0)}`
  if (v >= 100) return `¥${v.toFixed(1)}`
  return `¥${v.toFixed(2)}`
}

export function fmtRatio(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const pct = v * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export function ratioColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'text-zinc-500'
  return v > 0.0001 ? 'text-emerald-400' : v < -0.0001 ? 'text-red-400' : 'text-zinc-400'
}

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}
