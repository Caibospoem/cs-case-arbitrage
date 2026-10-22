'use client'

import { useMemo, useState } from 'react'
import { RefreshCw, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RatioDirection, SourceStatus } from '@/lib/types'
import { CasesTable } from './cases-table'
import { CaseCompare, HistoryLine, PriceScatter, RatioBars } from './charts'
import { SettingsDialog, type SettingsState } from './settings-dialog'
import { DIRECTIONS, DIRECTION_MAP, fmtPrice, fmtRatio, fmtTime, ratioColor } from './shared'
import { usePrices, useHistory } from './use-api'
import { TrendPanel } from './trend-panel'

type MainView = 'arbitrage' | 'trend'

const STATUS_META: Record<SourceStatus['state'], { label: string; cls: string }> = {
  ok: { label: '实时', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  degraded: { label: '降级', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  error: { label: '异常', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  unconfigured: { label: '未配置', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
}

export default function Dashboard() {
  const { data, error, loading, refresh } = usePrices(60_000)
  const [view, setView] = useState<MainView>('arbitrage')
  const [direction, setDirection] = useState<RatioDirection>('buffToSteam')
  const [selected, setSelected] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsState | null>(null)
  const history = useHistory(selected)

  const cases = data?.cases ?? []
  const selectedCase = useMemo(
    () => cases.find((c) => c.hashName === selected) ?? null,
    [cases, selected],
  )

  const kpi = useMemo(() => {
    const withBest = cases.filter((c) => c.bestRatio !== null)
    const best = withBest[0] ?? null
    const avg =
      withBest.length > 0
        ? withBest.reduce((s, c) => s + (c.bestRatio ?? 0), 0) / withBest.length
        : null
    const okSources = (data?.statuses ?? []).filter((s) => s.state === 'ok').length
    return { best, avg, okSources, total: data?.statuses.length ?? 4 }
  }, [cases, data])

  const openSettings = async () => {
    setSettingsOpen(true)
    if (!settings) {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' })
        const json = await res.json()
        setSettings(json as SettingsState)
      } catch {
        /* 打开设置时读取失败则用默认值 */
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* 顶栏 */}
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <span className="inline-block h-6 w-1.5 rounded bg-amber-500" />
              CS 武器箱跨平台差价分析
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Steam · 网易BUFF · IGXE 实时价格对比与收益率可视化
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as MainView)}>
              <TabsList className="bg-zinc-900">
                <TabsTrigger
                  value="arbitrage"
                  className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950"
                >
                  差价分析
                </TabsTrigger>
                <TabsTrigger
                  value="trend"
                  className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950"
                >
                  历史走势
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {(data?.statuses ?? []).map((s) => (
              <Badge
                key={s.name}
                variant="outline"
                className={`border ${STATUS_META[s.state].cls} cursor-help`}
                title={s.message ?? `${s.name} 正常（${s.itemCount ?? 0} 项）`}
              >
                {s.name.toUpperCase()} · {STATUS_META[s.state].label}
              </Badge>
            ))}
            <span className="hidden text-xs text-zinc-500 sm:inline">
              更新于 {fmtTime(data?.updatedAt)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh(true)}
              disabled={loading}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openSettings}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              <Settings2 className="h-4 w-4" />
              设置
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-5 sm:px-6">
        {view === 'trend' ? (
          <TrendPanel cases={cases.map((c) => ({ hashName: c.hashName, nameCn: c.nameCn }))} />
        ) : (
          <>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            数据加载失败：{error}
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard title="追踪武器箱" value={String(cases.length || '—')} sub="按 IGXE / BUFF 在售武器箱聚合" loading={!data && loading} />
          <KpiCard
            title="数据源状态"
            value={`${kpi.okSources}/${kpi.total}`}
            sub={kpi.okSources < kpi.total ? '部分数据源未启用，见顶栏提示' : '全部正常'}
            loading={!data && loading}
          />
          <KpiCard
            title="当前最优机会"
            value={kpi.best ? fmtRatio(kpi.best.bestRatio) : '—'}
            sub={
              kpi.best
                ? `${kpi.best.nameCn} · ${DIRECTION_MAP[kpi.best.bestDirection as RatioDirection]?.short ?? ''}`
                : '需至少两个平台价格'
            }
            accent={kpi.best?.bestRatio != null ? ratioColor(kpi.best.bestRatio) : undefined}
            loading={!data && loading}
          />
          <KpiCard
            title="平均最佳收益率"
            value={fmtRatio(kpi.avg)}
            sub="所有武器箱最佳方向的均值"
            accent={kpi.avg !== null ? ratioColor(kpi.avg) : undefined}
            loading={!data && loading}
          />
        </div>

        {/* 收益率条形图 */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">差价收益比率排行</CardTitle>
                <CardDescription className="text-xs">
                  {DIRECTION_MAP[direction].desc}
                </CardDescription>
              </div>
              <Tabs value={direction} onValueChange={(v) => setDirection(v as RatioDirection)}>
                <TabsList className="flex h-auto flex-wrap gap-1 bg-zinc-900">
                  {DIRECTIONS.map((d) => (
                    <TabsTrigger
                      key={d.key}
                      value={d.key}
                      className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950"
                    >
                      {d.short}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <RatioBars cases={cases} direction={direction} />
          </CardContent>
        </Card>

        {/* 散点 + 选中箱详情 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">价格 × 收益率分布</CardTitle>
              <CardDescription className="text-xs">
                横轴为参考价（对数刻度），纵轴为该箱最佳收益率，气泡越大价差越大
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PriceScatter cases={cases} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selectedCase ? selectedCase.nameCn : '箱体详情'}
                {selectedCase && (
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {selectedCase.nameEn}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedCase
                  ? '三平台价格对比 + 收益率历史快照（每 5 分钟记录）'
                  : '在下方表格中点击任意武器箱查看详情'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedCase ? (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {DIRECTIONS.map((d) => {
                      const v = selectedCase[d.key]
                      if (v === null || v === undefined) return null
                      return (
                        <span
                          key={d.key}
                          className={`rounded border border-zinc-800 bg-zinc-950 px-2 py-1 ${ratioColor(v)}`}
                        >
                          {d.short} <b>{fmtRatio(v)}</b>
                        </span>
                      )
                    })}
                  </div>
                  <CaseCompare c={selectedCase} />
                  <HistoryLine points={history} />
                </>
              ) : (
                <div className="flex h-[220px] items-center justify-center text-sm text-zinc-600">
                  未选择武器箱
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 明细表 */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="pt-5">
            <CasesTable
              cases={cases}
              loading={loading}
              selected={selected}
              onSelect={(h) => setSelected(h === selected ? null : h)}
            />
          </CardContent>
        </Card>

        {/* 说明 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">计算口径</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs leading-relaxed text-zinc-400">
              <p>
                <b className="text-zinc-200">买入价</b>
                ：取各平台「最低挂刀价」；「收刀」为平台求购（收刀）最高价。
              </p>
              <p>
                <b className="text-zinc-200">卖出净得</b>
                ：Steam 卖出按 (1 − 15%) 计；BUFF / IGXE 挂刀卖出按 (1 − 2.5%) 计，均可在设置中调整。
              </p>
              <p>
                <b className="text-zinc-200">收益率</b> = (卖出净得 − 买入价) ÷ 买入价。「最佳收益」取全部方向中的最大值。
              </p>
              <p>
                <b className="text-zinc-200">IGXE 内部差价</b> = 挂刀价买入 → 求购价卖出的套利空间，仅依赖单一平台数据。
              </p>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">数据源说明与风险提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs leading-relaxed text-zinc-400">
              <p>
                <b className="text-emerald-400">IGXE</b>：通过官方页面 SSR 数据解析，无需配置，实时可用。
              </p>
              <p>
                <b className="text-amber-400">BUFF</b>：官方接口需登录 Cookie（设置中粘贴即可启用）。
              </p>
              <p>
                <b className="text-zinc-200">Steam</b>：官方接口在大陆网络受限，可在设置中配置镜像/代理；配置 BUFF
                后亦可使用 BUFF 记录的 Steam 参考价。
              </p>
              <p className="text-amber-500/90">
                风险提示：Steam 市场余额不可提现；饰品价格波动剧烈，且跨平台转移有到账周期与封号风险。本工具仅作价格对比参考，不构成任何交易建议。
              </p>
            </CardContent>
          </Card>
        </div>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
        CS 武器箱跨平台差价分析 · 数据来源 Steam Community Market / 网易 BUFF / IGXE ·
        仅供学习研究
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initial={settings}
        onSaved={() => {
          void refresh(true)
          // 重新拉取设置（Cookie 可能已更新）
          void fetch('/api/settings', { cache: 'no-store' })
            .then((r) => r.json())
            .then((j) => setSettings(j as SettingsState))
            .catch(() => undefined)
        }}
      />
    </div>
  )
}

function KpiCard({
  title,
  value,
  sub,
  accent,
  loading,
}: {
  title: string
  value: string
  sub: string
  accent?: string
  loading?: boolean
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardContent className="p-4">
        <div className="text-xs text-zinc-500">{title}</div>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-20 bg-zinc-800" />
        ) : (
          <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-zinc-100'}`}>{value}</div>
        )}
        <div className="mt-1 line-clamp-1 text-[11px] text-zinc-500">{sub}</div>
      </CardContent>
    </Card>
  )
}
