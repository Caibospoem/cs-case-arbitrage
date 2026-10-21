/**
 * 定时采集脚本（供 GitHub Actions / VPS cron 调用）：
 * 调用聚合器抓取三平台价格，把快照批次追加到 db/history/YYYY-MM.jsonl。
 * 每行一个批次：{"t":<epoch ms>,"points":[{hashName,steamPrice,...},...]}
 * 与 20 分钟内的上一批次重复时跳过（防 cron 抖动产生重复行）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { aggregate } from '../src/lib/aggregator'

const HISTORY_DIR = resolve(process.cwd(), 'db/history')
/** 批次最小间隔 */
const MIN_BATCH_GAP_MS = 20 * 60 * 1000

async function main() {
  // preferDirect: 采集端(GitHub Actions 在境外)直连 Steam 实时价, SteamDT 仅回退
  const res = await aggregate({ preferDirect: true })
  const t = res.updatedAt

  const points = res.cases
    .filter((c) => c.steam !== null || c.buff !== null || c.igxe !== null)
    .map((c) => ({
      hashName: c.hashName,
      nameCn: c.nameCn,
      steamPrice: c.steam,
      buffPrice: c.buff,
      igxePrice: c.igxe,
      buffToSteam: c.buffToSteam,
      igxeToSteam: c.igxeToSteam,
      igxeToBuff: c.igxeToBuff,
    }))
  if (points.length === 0) throw new Error('采集结果为空, 放弃落盘')

  const d = new Date(t)
  const file = resolve(
    HISTORY_DIR,
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`,
  )
  mkdirSync(HISTORY_DIR, { recursive: true })

  if (existsSync(file)) {
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
    const lastLine = lines[lines.length - 1]
    try {
      const lastT = JSON.parse(lastLine).t as number
      if (Number.isFinite(lastT) && t - lastT < MIN_BATCH_GAP_MS) {
        console.log(
          `[collect] 距上次快照仅 ${Math.round((t - lastT) / 60000)} 分钟, 跳过本批次`,
        )
        return
      }
    } catch {
      // 末行损坏则继续追加
    }
  }

  appendFileSync(file, JSON.stringify({ t, points }) + '\n')
  const via = res.statuses.find((s) => s.name === 'steam')?.message ?? ''
  console.log(`[collect] ✓ ${points.length} 箱 @ ${d.toISOString()} | ${via}`)
}

main().catch((e: unknown) => {
  console.error('[collect] 失败:', e instanceof Error ? e.message : e)
  process.exit(1)
})
