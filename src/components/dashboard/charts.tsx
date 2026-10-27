'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { CasePrice, HistoryPoint } from '@/lib/types'
import { DIRECTION_MAP, fmtPrice, fmtRatio, fmtTime } from './shared'

const AXIS = { stroke: '#52525b', fontSize: 11, tickFill: '#a1a1aa' }
const GRID = '#27272a'
const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  color: '#e4e4e7',
  fontSize: 12,
}
/** 默认 Tooltip 的条目色：recharts 对无系列色的值兜底 #000，深色背景下不可读，需显式覆盖 */
const TOOLTIP_ITEM_STYLE = { color: '#e4e4e7' }

/** 各方向收益率横向条形图（top N） */
export function RatioBars({ cases, direction }: { cases: CasePrice[]; direction: string }) {
  const key = direction as keyof CasePrice
  const data = cases
    .filter((c) => typeof c[key] === 'number')
    .slice(0, 15)
    .map((c) => ({
      name: c.nameCn.length > 9 ? c.nameCn.slice(0, 9) + '…' : c.nameCn,
      value: Number(((c[key] as number) * 100).toFixed(2)),
      full: c.nameCn,
    }))
    .sort((a, b) => b.value - a.value)

  if (data.length === 0) {
    return (
      <div className="flex h-[380px] items-center justify-center text-sm text-zinc-500">
        暂无可计算的收益率数据（该方向需要两个平台的价格）
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 26 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: AXIS.tickFill, fontSize: 11 }}
          stroke={AXIS.stroke}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tick={{ fill: AXIS.tickFill, fontSize: 11 }}
          stroke={AXIS.stroke}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(v: number) => [fmtRatio(v / 100), '收益率']}
          labelFormatter={(_, p) => (p && p[0] ? String(p[0].payload.full) : '')}
          cursor={{ fill: '#27272a55' }}
        />
        <ReferenceLine x={0} stroke="#71717a" />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? '#34d399' : '#f87171'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** 价格 vs 收益率 散点图 */
export function PriceScatter({ cases }: { cases: CasePrice[] }) {
  const data = cases
    .filter(
      (c) =>
        c.bestRatio !== null &&
        (c.steam !== null || c.buff !== null || c.igxe !== null),
    )
    .map((c) => ({
      x: (c.steam ?? c.buff ?? c.igxe)!,
      y: Number(((c.bestRatio ?? 0) * 100).toFixed(2)),
      z: Math.abs((c.steam ?? 0) - (c.buff ?? c.igxe ?? 0)),
      name: c.nameCn,
      dir: c.bestDirection,
    }))

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-zinc-500">
        暂无数据（需要至少两个平台的价格）
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          type="number"
          dataKey="x"
          scale="log"
          domain={['auto', 'auto']}
          allowDataOverflow
          tick={{ fill: AXIS.tickFill, fontSize: 11 }}
          stroke={AXIS.stroke}
          tickFormatter={(v: number) => `¥${v}`}
          name="参考价"
        />
        <YAxis
          type="number"
          dataKey="y"
          tick={{ fill: AXIS.tickFill, fontSize: 11 }}
          stroke={AXIS.stroke}
          tickFormatter={(v: number) => `${v}%`}
          name="最佳收益率"
        />
        <ZAxis type="number" dataKey="z" range={[40, 260]} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, n: string) =>
            n === 'y' ? [fmtRatio(v / 100), '最佳收益率'] : [`¥${Number(v).toFixed(2)}`, '参考价']
          }
          labelFormatter={() => ''}
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <div style={TOOLTIP_STYLE} className="px-3 py-2">
                <div className="font-medium">{p.name}</div>
                <div className="text-zinc-400">参考价 ¥{Number(p.x).toFixed(2)}</div>
                <div className="text-emerald-400">
                  最佳 {fmtRatio(p.y / 100)}（{p.dir ? DIRECTION_MAP[p.dir as keyof typeof DIRECTION_MAP]?.short ?? p.dir : '—'}）
                </div>
              </div>
            )
          }}
        />
        <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" />
        <Scatter data={data} fill="#fbbf24" fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

/** 选中箱子的三平台价格对比 */
export function CaseCompare({ c }: { c: CasePrice }) {
  const data = [
    { name: 'Steam 最低', 价格: c.steam },
    { name: 'BUFF 挂刀', 价格: c.buff },
    { name: 'IGXE 挂刀', 价格: c.igxe },
  ].map((d) => ({ ...d, 价格: d.价格 === null ? 0 : Number(d.价格.toFixed(2)) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: AXIS.tickFill, fontSize: 11 }} stroke={AXIS.stroke} />
        <YAxis
          tick={{ fill: AXIS.tickFill, fontSize: 11 }}
          stroke={AXIS.stroke}
          tickFormatter={(v: number) => `¥${v}`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(v: number) => (v > 0 ? [`¥${v.toFixed(2)}`, '价格'] : ['无数据', '价格'])}
          cursor={{ fill: '#27272a55' }}
        />
        <Bar dataKey="价格" radius={[4, 4, 0, 0]} barSize={36}>
          <Cell fill="#a1a1aa" />
          <Cell fill="#fbbf24" />
          <Cell fill="#34d399" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** 选中箱子收益率历史 */
export function HistoryLine({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500">
        历史数据积累中（每 5 分钟记录一次快照，运行越久曲线越完整）
      </div>
    )
  }
  const data = points.map((p) => ({
    t: p.t,
    'BUFF→Steam': p.buffToSteam === null ? null : Number((p.buffToSteam * 100).toFixed(2)),
    'IGXE→Steam': p.igxeToSteam === null ? null : Number((p.igxeToSteam * 100).toFixed(2)),
    'IGXE→BUFF': p.igxeToBuff === null ? null : Number((p.igxeToBuff * 100).toFixed(2)),
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tick={{ fill: AXIS.tickFill, fontSize: 10 }}
          stroke={AXIS.stroke}
          tickFormatter={fmtTime}
          minTickGap={72}
        />
        <YAxis
          tick={{ fill: AXIS.tickFill, fontSize: 10 }}
          stroke={AXIS.stroke}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(t) => fmtTime(Number(t))}
          formatter={(v: number, n: string) => [fmtRatio(v / 100), String(n)]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
        <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="BUFF→Steam" stroke="#fbbf24" dot={false} strokeWidth={2} connectNulls />
        <Line type="monotone" dataKey="IGXE→Steam" stroke="#34d399" dot={false} strokeWidth={2} connectNulls />
        <Line type="monotone" dataKey="IGXE→BUFF" stroke="#e879f9" dot={false} strokeWidth={2} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}
