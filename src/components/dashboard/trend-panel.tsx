'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface TrendPoint {
  t: number
  price: number
  volume: number
}

interface TrendResponse {
  hashName: string
  source: string
  via: 'direct' | 'mirror' | 'proxy' | null
  cached: boolean
  fetchedAt: number
  points: TrendPoint[]
  note: string
}

export interface CaseOption {
  hashName: string
  nameCn: string
}

const VIA_META: Record<string, { label: string; cls: string }> = {
  direct: { label: 'Steam 直连', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  mirror: { label: '镜像', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  proxy: { label: '公共代理', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
}

const RANGES = [
  { key: '30', label: '30天', days: 30 },
  { key: '90', label: '90天', days: 90 },
  { key: 'all', label: '全部', days: 0 },
] as const

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function TrendPanel({ cases }: { cases: CaseOption[] }) {
  const [hashName, setHashName] = useState<string | null>(null)
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('90')
  const [data, setData] = useState<TrendResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // 默认选中第一箱
  useEffect(() => {
    if (!hashName && cases.length > 0) setHashName(cases[0].hashName)
  }, [cases, hashName])

  useEffect(() => {
    if (!hashName) return
    const ctrl = new AbortController()
    setLoading(true)
    fetch(`/api/trend?hashName=${encodeURIComponent(hashName)}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json: TrendResponse) => setData(json))
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [hashName])

  const chartData = useMemo(() => {
    if (!data?.points?.length) return []
    const days = RANGES.find((r) => r.key === range)?.days ?? 0
    const cutoff = days > 0 ? Date.now() - days * 86400_000 : 0
    return data.points
      .filter((p) => p.t >= cutoff)
      .map((p) => ({ ...p, date: fmtDate(p.t) }))
  }, [data, range])

  const viaMeta = data?.via ? VIA_META[data.via] : null
  const cacheAgeMin = data?.fetchedAt ? Math.round((Date.now() - data.fetchedAt) / 60_000) : null

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              平台历史成交走势
              {viaMeta && (
                <Badge variant="outline" className={`border ${viaMeta.cls}`}>
                  Steam 官方成交 · {viaMeta.label}
                </Badge>
              )}
              {data?.cached && cacheAgeMin !== null && (
                <span className="text-xs font-normal text-zinc-500">缓存 {cacheAgeMin} 分钟前</span>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Steam 官方市场成交历史（中位成交价 + 销量，约一年）。BUFF / IGXE 历史成交需登录
              Cookie，暂未接入。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={hashName ?? undefined} onValueChange={setHashName}>
              <SelectTrigger className="w-[200px] border-zinc-700 bg-zinc-900 text-sm">
                <SelectValue placeholder="选择武器箱" />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-zinc-700 bg-zinc-900">
                {cases.map((c) => (
                  <SelectItem key={c.hashName} value={c.hashName} className="text-sm">
                    {c.nameCn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
              <TabsList className="bg-zinc-900">
                {RANGES.map((r) => (
                  <TabsTrigger
                    key={r.key}
                    value={r.key}
                    className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950"
                  >
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[320px] w-full bg-zinc-800" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={11} minTickGap={40} />
              <YAxis
                yAxisId="price"
                stroke="#f59e0b"
                fontSize={11}
                tickFormatter={(v: number) => `¥${v.toFixed(1)}`}
                domain={['auto', 'auto']}
              />
              <YAxis yAxisId="vol" orientation="right" stroke="#71717a" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(value: number | string, name: string) =>
                  name === '中位成交价' ? [`¥${Number(value).toFixed(2)}`, name] : [value, name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="vol" dataKey="volume" name="成交量" fill="#3f3f46" opacity={0.7} />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="price"
                name="中位成交价"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-zinc-500">
            <p>{data?.note ?? '暂无数据'}</p>
            {data && !data.via && (
              <p className="text-xs text-zinc-600">
                提示：配置 Steam 镜像后重试（设置 → Steam 镜像/代理，支持 {'{url}'} 模板与前缀两种写法）。
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
