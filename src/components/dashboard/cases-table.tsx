'use client'

import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CasePrice } from '@/lib/types'
import { igxeGameFor, isExtraItem } from '@/lib/extra-items'
import { DIRECTION_MAP, fmtPrice, fmtRatio, ratioColor } from './shared'

type SortKey =
  | 'bestRatio'
  | 'steam'
  | 'buff'
  | 'igxe'
  | 'igxeSpread'
  | 'buffToSteam'
  | 'igxeToSteam'
  | 'igxeToBuff'

const COLUMNS: { key: SortKey; label: string; hint?: string }[] = [
  { key: 'steam', label: 'Steam' },
  { key: 'buff', label: 'BUFF 挂刀' },
  { key: 'igxe', label: 'IGXE 挂刀' },
  { key: 'igxeSpread', label: 'IGXE 内部' },
  { key: 'igxeToBuff', label: 'IGXE→BUFF' },
  { key: 'buffToSteam', label: 'BUFF→Steam' },
  { key: 'igxeToSteam', label: 'IGXE→Steam' },
  { key: 'bestRatio', label: '最佳收益', hint: '各方向中的最高收益率' },
]

export function CasesTable({
  cases,
  loading,
  selected,
  onSelect,
}: {
  cases: CasePrice[]
  loading: boolean
  selected: string | null
  onSelect: (hashName: string) => void
}) {
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('bestRatio')
  const [asc, setAsc] = useState(false)

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const filtered = kw
      ? cases.filter(
          (c) =>
            c.nameCn.toLowerCase().includes(kw) || c.nameEn.toLowerCase().includes(kw),
        )
      : cases
    const val = (c: CasePrice): number => {
      const v = c[sortKey]
      return typeof v === 'number' ? v : -Infinity
    }
    return filtered.slice().sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)))
  }, [cases, q, sortKey, asc])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">武器箱价格明细</h2>
          <p className="text-xs text-zinc-500">
            共 {cases.length} 个武器箱 · 点击表头排序 · 点击行查看图表联动
          </p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索武器箱名称…"
          className="h-9 w-full sm:w-64"
        />
      </div>

      <div className="max-h-[480px] overflow-auto rounded-lg border border-zinc-800">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-zinc-900">
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[170px]">武器箱</TableHead>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  title={col.hint}
                  className="cursor-pointer select-none whitespace-nowrap text-right hover:text-amber-400"
                  onClick={() => {
                    if (sortKey === col.key) setAsc(!asc)
                    else {
                      setSortKey(col.key)
                      setAsc(col.key === 'steam' || col.key === 'buff' || col.key === 'igxe')
                    }
                  }}
                >
                  {col.label}
                  {sortKey === col.key ? (asc ? ' ↑' : ' ↓') : ''}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && cases.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-6 w-full bg-zinc-800" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((c) => (
                  <TableRow
                    key={c.hashName}
                    onClick={() => onSelect(c.hashName)}
                    className={`cursor-pointer ${
                      selected === c.hashName ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium leading-tight">
                        {c.nameCn}
                        {isExtraItem(c.hashName) && (
                          <span
                            className="rounded border border-sky-800 px-1 text-[10px] font-normal text-sky-400"
                            title="非 CS2 物品（如 TF2），来自其他游戏市场分区"
                          >
                            TF2
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] leading-tight text-zinc-500">
                        <span>{c.nameEn}</span>
                        <a
                          href={`https://buff.163.com/market/goods?game=csgo&search_word=${encodeURIComponent(c.hashName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 rounded border border-zinc-700 px-1 py-px text-[10px] text-zinc-400 hover:border-amber-500/50 hover:text-amber-400"
                          title={`在 BUFF 搜索 ${c.nameCn}`}
                        >
                          BUFF
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                        <a
                          href={`https://www.igxe.cn/market/${igxeGameFor(c.hashName)}?keyword=${encodeURIComponent(c.hashName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 rounded border border-zinc-700 px-1 py-px text-[10px] text-zinc-400 hover:border-amber-500/50 hover:text-amber-400"
                          title={`在 IGXE 搜索 ${c.nameCn}`}
                        >
                          IGXE
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {fmtPrice(c.steam)}
                      {(c.steamVia === 'buff-reference' || c.steamVia === 'igxe-reference') && (
                        <span
                          className="ml-1 text-[10px] text-zinc-500"
                          title={
                            c.steamVia === 'buff-reference'
                              ? 'BUFF 官方数据中的 Steam 参考价'
                              : 'IGXE 页面记录的 Steam 参考价（非实时，可能与 Steam 市场当前价有偏差）'
                          }
                        >
                          参考
                        </span>
                      )}
                      {c.steamVia === 'steamdt' && <SteamAgeBadge c={c} />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {fmtPrice(c.buff)}
                      {c.buffVia === 'steamdt' && (
                        <span className="ml-1 text-[10px] text-zinc-500" title="BUFF 价格来自 SteamDT 聚合源，配置 Cookie 可升级为官方实时数据">
                          DT
                        </span>
                      )}
                      {c.buffBuyOrder !== null && (
                        <div className="text-[10px] leading-tight text-zinc-500">
                          收刀 {fmtPrice(c.buffBuyOrder)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {fmtPrice(c.igxe)}
                      {c.igxeBuyOrder !== null && (
                        <div className="text-[10px] leading-tight text-zinc-500">
                          收刀 {fmtPrice(c.igxeBuyOrder)}
                        </div>
                      )}
                    </TableCell>
                    <RatioCell value={c.igxeSpread} />
                    <RatioCell value={c.igxeToBuff} />
                    <RatioCell value={c.buffToSteam} />
                    <RatioCell value={c.igxeToSteam} />
                    <TableCell className="whitespace-nowrap text-right">
                      <span className={ratioColor(c.bestRatio)}>{fmtRatio(c.bestRatio)}</span>
                      {c.bestDirection && (
                        <div className="text-[10px] leading-tight text-zinc-500">
                          {DIRECTION_MAP[c.bestDirection as keyof typeof DIRECTION_MAP]?.short ??
                            c.bestDirection}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-zinc-500">
                  没有匹配的武器箱
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function RatioCell({ value }: { value: number | null }) {
  return (
    <TableCell className="whitespace-nowrap text-right">
      <span className={ratioColor(value)}>{fmtRatio(value)}</span>
    </TableCell>
  )
}

/** Steam 价格数据年龄徽标：SteamDT 上游对 Steam 平台为低频采样，延迟可达数小时 */
function SteamAgeBadge({ c }: { c: CasePrice }) {
  const ts = c.steamUpdatedAt
  const min = ts ? Math.max(0, Math.floor((Date.now() - ts) / 60000)) : null
  const label =
    min === null || min < 15 ? 'DT' : min < 90 ? `DT·${min}分` : `DT·${(min / 60).toFixed(1)}h`
  const color =
    min === null || min < 15 ? 'text-zinc-500' : min < 60 ? 'text-amber-400' : 'text-red-400'
  const when = ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }) : ''
  const title =
    min === null
      ? '价格来自 SteamDT 聚合源（采样时间未知），可能与 Steam 市场当前价有偏差'
      : `SteamDT 的 Steam 价格为上游低频采样：本次采样于 ${when}（约 ${min} 分钟前）。\n跨平台下单前请以 Steam 市场实际挂单价为准`
  return (
    <span className={`ml-1 whitespace-nowrap text-[10px] ${color}`} title={title}>
      {label}
    </span>
  )
}
