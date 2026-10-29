import { db } from '@/lib/db'
import type { AppSettings } from '@/lib/types'

export const DEFAULT_SETTINGS: AppSettings = {
  steamFeePct: 15,
  buffFeePct: 2.5,
  igxeFeePct: 2.5,
  buffCookie: '',
  steamMirrors: '',
  preferDirect: false,
  itadKey: '',
}

const KEY = 'app-settings'

export async function getSettings(): Promise<AppSettings> {
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } })
    if (!row) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(row.value) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // 数字字段兜底
      steamFeePct: Number(parsed.steamFeePct ?? DEFAULT_SETTINGS.steamFeePct),
      buffFeePct: Number(parsed.buffFeePct ?? DEFAULT_SETTINGS.buffFeePct),
      igxeFeePct: Number(parsed.igxeFeePct ?? DEFAULT_SETTINGS.igxeFeePct),
      preferDirect: parsed.preferDirect === true,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next: AppSettings = { ...current, ...patch }
  // 简单校验
  next.steamFeePct = Math.min(50, Math.max(0, Number(next.steamFeePct) || 0))
  next.buffFeePct = Math.min(50, Math.max(0, Number(next.buffFeePct) || 0))
  next.igxeFeePct = Math.min(50, Math.max(0, Number(next.igxeFeePct) || 0))
  next.buffCookie = String(next.buffCookie || '').trim()
  next.steamMirrors = String(next.steamMirrors || '').trim()
  next.preferDirect = next.preferDirect === true
  next.itadKey = String(next.itadKey || '').trim()
  const value = JSON.stringify(next)
  await db.setting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  })
  return next
}
