import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '@/lib/db'
import type { HistoryPoint } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** JSONL 行结构（scripts/collect.ts 产出） */
interface JsonlBatch {
  t: number
  points: {
    hashName: string
    steamPrice: number | null
    buffPrice: number | null
    igxePrice: number | null
    buffToSteam: number | null
    igxeToSteam: number | null
    igxeToBuff: number | null
  }[]
}

/** 读取当月+上月的 JSONL 分片（GitHub Actions 定时采集的历史） */
function readJsonlPoints(hashName: string): HistoryPoint[] {
  const dir = resolve(process.cwd(), 'db/history')
  if (!existsSync(dir)) return []
  const now = new Date()
  const months = [0, 1].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const out: HistoryPoint[] = []
  for (const m of months) {
    const file = resolve(dir, `${m}.jsonl`)
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const batch = JSON.parse(line) as JsonlBatch
        if (!Array.isArray(batch.points) || !Number.isFinite(batch.t)) continue
        for (const p of batch.points) {
          if (p.hashName !== hashName) continue
          out.push({
            t: batch.t,
            steamPrice: p.steamPrice,
            buffPrice: p.buffPrice,
            igxePrice: p.igxePrice,
            buffToSteam: p.buffToSteam,
            igxeToSteam: p.igxeToSteam,
            igxeToBuff: p.igxeToBuff,
          })
        }
      } catch {
        // 跳过损坏行
      }
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  const hashName = req.nextUrl.searchParams.get('hashName') ?? ''
  const limit = Math.min(500, Math.max(10, Number(req.nextUrl.searchParams.get('limit') ?? 200)))
  if (!hashName) return NextResponse.json({ points: [] })
  try {
    const rows = await db.snapshot.findMany({
      where: { hashName },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    // SQLite（本机访问触发的快照）优先, JSONL（定时采集）补位; 分钟粒度去重
    const byKey = new Map<string, HistoryPoint>()
    for (const p of readJsonlPoints(hashName)) {
      byKey.set(`${Math.round(p.t / 60000)}|${hashName}`, p)
    }
    for (const r of rows.slice().reverse()) {
      const t = r.createdAt.getTime()
      byKey.set(`${Math.round(t / 60000)}|${hashName}`, {
        t,
        steamPrice: r.steamPrice,
        buffPrice: r.buffPrice,
        igxePrice: r.igxePrice,
        buffToSteam: r.buffToSteamRatio,
        igxeToSteam: r.igxeToSteamRatio,
        igxeToBuff: r.igxeToBuffRatio,
      })
    }
    const points = Array.from(byKey.values())
      .sort((a, b) => a.t - b.t)
      .slice(-limit)
    return NextResponse.json({ points }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '历史查询失败', points: [] },
      { status: 500 },
    )
  }
}
