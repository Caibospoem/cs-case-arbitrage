import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { HistoryPoint } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
    const points: HistoryPoint[] = rows
      .slice()
      .reverse()
      .map((r) => ({
        t: r.createdAt.getTime(),
        steamPrice: r.steamPrice,
        buffPrice: r.buffPrice,
        igxePrice: r.igxePrice,
        buffToSteam: r.buffToSteamRatio,
        igxeToSteam: r.igxeToSteamRatio,
        igxeToBuff: r.igxeToBuffRatio,
      }))
    return NextResponse.json({ points }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '历史查询失败', points: [] },
      { status: 500 },
    )
  }
}
