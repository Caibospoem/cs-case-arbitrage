import { NextRequest, NextResponse } from 'next/server'
import { aggregate } from '@/lib/aggregator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1'
  try {
    const data = await aggregate({ force })
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '聚合失败' },
      { status: 500 },
    )
  }
}
