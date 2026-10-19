import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/settings'
import type { AppSettings } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const s = await getSettings()
  // Cookie 属于敏感信息，只返回是否已配置 + 尾部特征，便于前端展示
  return NextResponse.json({
    ...s,
    buffCookie: s.buffCookie ? `__SAVED__${s.buffCookie.slice(-6)}` : '',
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AppSettings>
    const patch: Partial<AppSettings> = {}
    if (body.steamFeePct !== undefined) patch.steamFeePct = Number(body.steamFeePct)
    if (body.buffFeePct !== undefined) patch.buffFeePct = Number(body.buffFeePct)
    if (body.igxeFeePct !== undefined) patch.igxeFeePct = Number(body.igxeFeePct)
    if (body.steamMirrors !== undefined) patch.steamMirrors = String(body.steamMirrors)
    if (body.buffCookie !== undefined) {
      const c = String(body.buffCookie).trim()
      // 前端会回显 __SAVED__xxx 占位符，提交时若仍是占位符则不覆盖
      if (c && !c.startsWith('__SAVED__')) patch.buffCookie = c
      if (!c) patch.buffCookie = ''
    }
    const saved = await saveSettings(patch)
    return NextResponse.json({
      ok: true,
      settings: { ...saved, buffCookie: saved.buffCookie ? `__SAVED__${saved.buffCookie.slice(-6)}` : '' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '保存失败' },
      { status: 400 },
    )
  }
}
