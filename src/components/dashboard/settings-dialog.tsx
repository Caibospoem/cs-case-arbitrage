'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'

export interface SettingsState {
  steamFeePct: number
  buffFeePct: number
  igxeFeePct: number
  buffCookie: string
  steamMirrors: string
  preferDirect: boolean
}

export function SettingsDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: SettingsState | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<SettingsState>({
    steamFeePct: 15,
    buffFeePct: 2.5,
    igxeFeePct: 2.5,
    buffCookie: '',
    steamMirrors: '',
    preferDirect: false,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && initial) setForm({ ...initial })
  }, [open, initial])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '保存失败')
      toast({ title: '设置已保存', description: '将按新的费率与配置重新计算收益率' })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast({
        title: '保存失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>手续费率用于收益率计算，可按实际情况调整</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="steamFee" className="text-xs text-zinc-400">
                Steam 手续费 %
              </Label>
              <Input
                id="steamFee"
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={form.steamFeePct}
                onChange={(e) => setForm({ ...form, steamFeePct: Number(e.target.value) })}
                className="bg-zinc-950"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="buffFee" className="text-xs text-zinc-400">
                BUFF 手续费 %
              </Label>
              <Input
                id="buffFee"
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={form.buffFeePct}
                onChange={(e) => setForm({ ...form, buffFeePct: Number(e.target.value) })}
                className="bg-zinc-950"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="igxeFee" className="text-xs text-zinc-400">
                IGXE 手续费 %
              </Label>
              <Input
                id="igxeFee"
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={form.igxeFeePct}
                onChange={(e) => setForm({ ...form, igxeFeePct: Number(e.target.value) })}
                className="bg-zinc-950"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buffCookie" className="text-xs text-zinc-400">
              BUFF Cookie（用于获取 BUFF 实时价格）
            </Label>
            <Textarea
              id="buffCookie"
              value={form.buffCookie}
              onChange={(e) => setForm({ ...form, buffCookie: e.target.value })}
              placeholder={'登录 buff.163.com 后：F12 → 网络(Network) → 刷新页面 → 任一 api 请求 → 请求头 Cookie，整段复制粘贴到这里'}
              className="min-h-[72px] bg-zinc-950 font-mono text-xs"
            />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              仅保存在本机数据库中用于服务端请求。留空则无法获取 BUFF 数据。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="steamMirrors" className="text-xs text-zinc-400">
              Steam 镜像 / 代理（可选，每行一个）
            </Label>
            <Textarea
              id="steamMirrors"
              value={form.steamMirrors}
              onChange={(e) => setForm({ ...form, steamMirrors: e.target.value })}
              placeholder={
                '三种写法任选：\n1) https://my-proxy.example/?url={url}  （{url} 会被替换为目标地址）\n2) https://proxy.example/  （前缀拼接编码后的目标地址）\n3) https://steam-mirror.example  （反代域名，替换 steamcommunity.com）'
              }
              className="min-h-[72px] bg-zinc-950 font-mono text-xs"
            />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              当服务器无法直连 steamcommunity.com（大陆网络常见）时使用。任何能转发 Steam
              市场请求的反向代理均可。
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-zinc-800 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="preferDirect" className="text-xs text-zinc-300">
                Steam 价优先直连
              </Label>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                适合本机 hosts 加速（Watt Toolkit/Steam++ 等）可直连 Steam 的场景。开启后
                Steam 价走直连（近实时，10 分钟缓存），SteamDT 聚合降级为回退源；直连仍不可达的物品自动回落 SteamDT/参考价。
              </p>
            </div>
            <Switch
              id="preferDirect"
              checked={form.preferDirect}
              onCheckedChange={(v) => setForm({ ...form, preferDirect: v })}
              className="data-[state=checked]:bg-amber-500"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={saving} className="bg-amber-500 text-zinc-950 hover:bg-amber-400">
            {saving ? '保存中…' : '保存设置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
