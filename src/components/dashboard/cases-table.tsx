'use client'

import { useMemo, useState } from 'react'
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
                      <div className="font-medium leading-tight">{c.nameCn}</div>
                      <div className="text-[11px] leading-tight text-zinc-500">{c.nameEn}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {fmtPrice(c.steam)}
                      {c.steamVia === 'buff-reference' && (
                        <span className="ml-1 text-[10px] text-zinc-500">参考</span>
                      )}
                      {c.steamVia === 'steamdt' && (
                        <span className="ml-1 text-[10px] text-zinc-500" title="价格经 SteamDT 聚合源实时获取">
                          DT
                        </span>
                      )}
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
