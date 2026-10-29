import { NextRequest, NextResponse } from 'next/server'
import { fetchSteamDiscounts } from '@/lib/sources/steamDiscounts'
import { fetchItadLows } from '@/lib/sources/itad'
import { getSettings } from '@/lib/settings'
import type { DiscountItem, DiscountsResponse, SourceStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VIA_LABEL: Record<string, string> = {
  direct: '直连',
  mirror: '镜像/代理',
  proxy: '内置公共代理',
}

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit')) || 500
  const force = req.nextUrl.searchParams.get('force') === '1'
  try {
    const settings = await getSettings()
    const mirrors = settings.steamMirrors
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const steam = await fetchSteamDiscounts(limit, mirrors, force)
    const items: DiscountItem[] = steam.items.map((r) => ({ ...r, low: null }))
    const statuses: SourceStatus[] = []

    statuses.push({
      name: 'steamstore',
      state: steam.note ? 'degraded' : 'ok',
      message:
        `Steam 官方 specials 搜索（${VIA_LABEL[steam.via]}），已加载 ${items.length} 款` +
        (steam.totalAvailable !== null ? ` / 全站共 ${steam.totalAvailable} 款折扣中` : '') +
        (steam.note ? `；${steam.note}` : ''),
      itemCount: items.length,
      lastSuccess: Date.now(),
    })

    // ITAD 史低（可选）
    if (settings.itadKey) {
      try {
        const { lows, missing } = await fetchItadLows(
          items.map((i) => i.appid),
          settings.itadKey,
        )
        for (const item of items) {
          const low = lows.get(item.appid)
          if (low) item.low = low
        }
        const hit = items.filter((i) => i.low).length
        statuses.push({
          name: 'itad',
          state: 'ok',
          message: `ITAD 史低（region CN）：${hit} 款有史低记录${missing > 0 ? `，${missing} 款未收录` : ''}`,
          itemCount: hit,
          lastSuccess: Date.now(),
        })
      } catch (e) {
        statuses.push({
          name: 'itad',
          state: 'error',
          message: e instanceof Error ? e.message : 'ITAD 查询失败',
          lastSuccess: null,
        })
      }
    } else {
      statuses.push({
        name: 'itad',
        state: 'unconfigured',
        message: '未配置 ITAD API Key，史低价列不可用（设置 → IsThereAnyDeal API Key）',
        lastSuccess: null,
      })
    }

    const data: DiscountsResponse = {
      updatedAt: Date.now(),
      items,
      totalAvailable: steam.totalAvailable,
      fetchedCount: items.length,
      statuses,
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '折扣数据获取失败' },
      { status: 502 },
    )
  }
}
