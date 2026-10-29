'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { DiscountItem, SourceState } from '@/lib/types'
import { fmtPrice } from './shared'
import { useDiscounts } from './use-api'

type SortKey = 'discount' | 'price' | 'score' | 'count' | 'lowRatio' | 'release' | 'name'

const SORTERS: Record<SortKey, { label: string; value: (d: DiscountItem) => number | string; ascDefault: boolean }> = {
  discount: { label: '折扣力度', value: (d) => d.discountPct, ascDefault: false },
  price: { label: '现价', value: (d) => d.price, ascDefault: true },
  score: { label: '好评率', value: (d) => d.reviewScore ?? -1, ascDefault: false },
  count: { label: '评测数', value: (d) => d.reviewCount, ascDefault: false },
  lowRatio: { label: '距史低', value: (d) => (d.low && d.low.price > 0 ? d.price / d.low.price : Infinity), ascDefault: true },
  release: { label: '发布日期', value: (d) => d.releaseTs ?? 0, ascDefault: false },
  name: { label: '名称', value: (d) => d.name.toLowerCase(), ascDefault: true },
}

const MAX_RENDER = 300
const LIMIT_OPTIONS = [250, 500, 1000]

function stateColor(state: SourceState): string {
  switch (state) {
    case 'ok':
      return 'border-emerald-900 bg-emerald-950/40 text-emerald-400'
    case 'degraded':
      return 'border-amber-900 bg-amber-950/40 text-amber-400'
    case 'error':
      return 'border-red-900 bg-red-950/40 text-red-400'
    default:
      return 'border-zinc-800 bg-zinc-900 text-zinc-500'
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-500'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-lime-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function fmtCount(n: number): string {
  if (n >= 100_000) return `${(n / 10_000).toFixed(0)}万`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString('en-US')
}

function isAtLow(d: DiscountItem): boolean {
  return !!d.low && d.low.price > 0 && d.price <= d.low.price * 1.005
}

export function DiscountPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [limit, setLimit] = useState(500)
  const { data, error, loading, refresh } = useDiscounts(limit)

  const [sortKey, setSortKey] = useState<SortKey>('discount')
  const [sortAsc, setSortAsc] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [minDiscount, setMinDiscount] = useState(0)
  const [minScore, setMinScore] = useState(0)
  const [minCount, setMinCount] = useState(0)
  const [onlyLow, setOnlyLow] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(key)
      setSortAsc(SORTERS[key].ascDefault)
    }
  }

  const filtered = useMemo(() => {
    const list = (data?.items ?? []).filter((d) => {
      if (keyword && !d.name.toLowerCase().includes(keyword.toLowerCase())) return false
      if (d.discountPct < minDiscount) return false
      if ((d.reviewScore ?? 0) < minScore) return false
      if (d.reviewCount < minCount) return false
      if (onlyLow && !isAtLow(d)) return false
      return true
    })
    const s = SORTERS[sortKey]
    list.sort((a, b) => {
      const va = s.value(a)
      const vb = s.value(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [data, keyword, minDiscount, minScore, minCount, onlyLow, sortKey, sortAsc])

  const shown = filtered.slice(0, MAX_RENDER)
  const items = data?.items ?? []
  const lowHits = items.filter(isAtLow).length
  const maxDiscount = items.reduce((m, d) => Math.max(m, d.discountPct), 0)
  const avgDiscount = items.length ? items.reduce((s, d) => s + d.discountPct, 0) / items.length : 0
  const highScore = items.filter((d) => (d.reviewScore ?? 0) >= 90).length

  const itadStatus = data?.statuses.find((s) => s.name === 'itad')
  const steamStatus = data?.statuses.find((s) => s.name === 'steamstore')

  return (
    <div className="space-y-4">
      {/* 控制行 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Label className="text-xs text-zinc-400">抓取规模</Label>
          {LIMIT_OPTIONS.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={limit === n ? 'default' : 'outline'}
              className={`h-7 px-2.5 text-xs ${limit === n ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400' : 'border-zinc-800 bg-zinc-950'}`}
              onClick={() => setLimit(n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <Button size="sm" className="h-7 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" onClick={() => void refresh(true)} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '拉取中…' : '刷新'}
        </Button>
        {data && (
          <Badge variant="outline" className={stateColor(steamStatus?.state ?? 'ok')} title={steamStatus?.message}>
            Steam 商店 {steamStatus?.state === 'ok' ? '正常' : steamStatus?.state === 'degraded' ? '部分成功' : '异常'}
          </Badge>
        )}
        {data && (
          <Badge
            variant="outline"
            className={stateColor(itadStatus?.state ?? 'unconfigured')}
            title={itadStatus?.message}
          >
            ITAD 史低{' '}
            {itadStatus?.state === 'ok' ? `${itadStatus.itemCount ?? 0} 款` : itadStatus?.state === 'unconfigured' ? '未配置' : '异常'}
          </Badge>
        )}
        {data && (
          <span className="text-[11px] text-zinc-500">
            Steam 在折约 {data.totalAvailable?.toLocaleString('en-US') ?? '—'} 款 · 按评测数已抓 {data.fetchedCount} 款 · 服务端 10 分钟缓存
          </span>
        )}
      </div>

      {error && (
        <Card className="border-red-900 bg-red-950/30">
          <CardContent className="p-3 text-xs text-red-300">
            折扣数据获取失败：{error}
            <br />
            <span className="text-red-400/80">
              本机通常可直连 Steam 商店；若部署在无直连环境，请在设置中配置镜像/代理后重试。
            </span>
          </CardContent>
        </Card>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">平均折扣</div>
            {loading && !data ? <Skeleton className="mt-1.5 h-7 w-16 bg-zinc-800" /> : <div className="mt-1 text-2xl font-bold text-emerald-400">-{avgDiscount.toFixed(0)}%</div>}
            <div className="mt-1 text-[11px] text-zinc-500">最高 -{maxDiscount}%</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">史低达成</div>
            {loading && !data ? <Skeleton className="mt-1.5 h-7 w-16 bg-zinc-800" /> : <div className="mt-1 text-2xl font-bold text-amber-400">{lowHits}</div>}
            <div className="mt-1 text-[11px] text-zinc-500">现价 = ITAD 史低</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">好评 ≥ 90%</div>
            {loading && !data ? <Skeleton className="mt-1.5 h-7 w-16 bg-zinc-800" /> : <div className="mt-1 text-2xl font-bold text-emerald-400">{highScore}</div>}
            <div className="mt-1 text-[11px] text-zinc-500">款在抓取范围内</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">当前筛选结果</div>
            {loading && !data ? <Skeleton className="mt-1.5 h-7 w-16 bg-zinc-800" /> : <div className="mt-1 text-2xl font-bold text-zinc-100">{filtered.length}</div>}
            <div className="mt-1 text-[11px] text-zinc-500">款（表头点击排序）</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选行 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索游戏名…"
          className="h-8 w-44 bg-zinc-950 text-xs"
        />
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-zinc-400">折扣 ≥</Label>
          {[0, 30, 50, 70, 90].map((n) => (
            <Button key={n} size="sm" variant="outline" className={`h-7 px-2 text-xs ${minDiscount === n ? 'border-amber-500 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`} onClick={() => setMinDiscount(n)}>
              {n === 0 ? '全部' : `-${n}%`}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-zinc-400">好评率 ≥</Label>
          {[0, 60, 80, 90].map((n) => (
            <Button key={n} size="sm" variant="outline" className={`h-7 px-2 text-xs ${minScore === n ? 'border-amber-500 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`} onClick={() => setMinScore(n)}>
              {n === 0 ? '全部' : `${n}%`}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-zinc-400">评测数 ≥</Label>
          {[0, 100, 1000, 10000].map((n) => (
            <Button key={n} size="sm" variant="outline" className={`h-7 px-2 text-xs ${minCount === n ? 'border-amber-500 text-amber-400' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`} onClick={() => setMinCount(n)}>
              {n === 0 ? '不限' : fmtCount(n)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="onlyLow" checked={onlyLow} onCheckedChange={setOnlyLow} className="data-[state=checked]:bg-amber-500" />
          <Label htmlFor="onlyLow" className="text-xs text-zinc-300">
            仅看史低
          </Label>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-xs text-zinc-400">
              {(
                [
                  ['name', '游戏'],
                  ['discount', '折扣'],
                  ['price', '现价'],
                  [null, '原价'],
                  ['score', '好评率'],
                  ['count', '评测数'],
                  ['lowRatio', '史低价'],
                  ['release', '发布'],
                  [null, ''],
                ] as [SortKey | null, string][]
              ).map(([key, label], i) =>
                key === null ? (
                  <th key={i} className="px-3 py-2.5 font-medium">
                    {label}
                  </th>
                ) : (
                  <th key={key} className="cursor-pointer select-none px-3 py-2.5 font-medium hover:text-zinc-200" onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortKey === key &&
                        (sortAsc ? <ArrowUp className="h-3 w-3 text-amber-400" /> : <ArrowDown className="h-3 w-3 text-amber-400" />)}
                    </span>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-zinc-800/60">
                  <td colSpan={9} className="px-3 py-2.5">
                    <Skeleton className="h-8 w-full bg-zinc-800/70" />
                  </td>
                </tr>
              ))
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-xs text-zinc-500">
                  {items.length === 0 ? '暂无数据' : '没有符合筛选条件的游戏'}
                </td>
              </tr>
            ) : (
              shown.map((d) => (
                <tr key={d.appid} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                  <td className="max-w-[300px] px-3 py-2">
                    <a
                      href={`https://store.steampowered.com/app/${d.appid}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5"
                      title={d.reviewLabel ? `${d.reviewLabel} · ${d.releaseDate ?? ''}` : d.releaseDate ?? ''}
                    >
                      {d.capsule ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.capsule} alt="" loading="lazy" className="h-9 w-[70px] shrink-0 rounded-sm object-cover" />
                      ) : (
                        <div className="h-9 w-[70px] shrink-0 rounded-sm bg-zinc-800" />
                      )}
                      <span className="truncate text-[13px] text-zinc-200 hover:text-amber-400">{d.name}</span>
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded-sm bg-emerald-700/80 px-1.5 py-0.5 text-xs font-bold text-white">-{d.discountPct}%</span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-zinc-100">{fmtPrice(d.price)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500 line-through">{fmtPrice(d.originalPrice)}</td>
                  <td className={`px-3 py-2 text-[13px] font-semibold ${scoreColor(d.reviewScore)}`}>
                    {d.reviewScore === null ? '—' : `${d.reviewScore}%`}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{d.reviewCount > 0 ? fmtCount(d.reviewCount) : '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.low ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={isAtLow(d) ? 'font-bold text-amber-400' : 'text-zinc-300'}>{fmtPrice(d.low.price)}</span>
                        {isAtLow(d) && (
                          <Badge className="border-amber-800 bg-amber-950/60 px-1.5 text-[10px] text-amber-400" variant="outline">
                            史低
                          </Badge>
                        )}
                        <span className="text-zinc-600" title={`${d.low.shop} · -${d.low.cut}%`}>
                          {d.low.at ? new Date(d.low.at).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </span>
                    ) : itadStatus?.state === 'unconfigured' ? (
                      <button className="text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline" onClick={onOpenSettings}>
                        配置 Key
                      </button>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{d.releaseDate ?? '—'}</td>
                  <td className="px-3 py-2">
                    <a
                      href={`https://store.steampowered.com/app/${d.appid}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-500 hover:text-amber-400"
                      title="打开 Steam 商店页面"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > MAX_RENDER && (
        <div className="text-center text-[11px] text-zinc-500">已按当前排序显示前 {MAX_RENDER} 条（共 {filtered.length} 条），调整排序或筛选查看其余</div>
      )}
      {itadStatus?.state === 'unconfigured' && items.length > 0 && (
        <div className="text-[11px] text-zinc-500">
          「史低价」来自 IsThereAnyDeal（含非 Steam 商店的史低记录，人民币计价）。
          <button className="ml-1 text-amber-500/90 hover:underline" onClick={onOpenSettings}>
            配置免费 API Key
          </button>{' '}
          后启用该列排序。
        </div>
      )}
    </div>
  )
}
