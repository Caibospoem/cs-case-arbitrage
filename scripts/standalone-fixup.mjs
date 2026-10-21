/**
 * 跨平台 standalone 产物修补：把 static 与 public 复制进 .next/standalone。
 * 用于替代 `cp -r`（Windows cmd 无此命令）。CI 与本地均可运行。
 */
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const dest = resolve(root, '.next/standalone')

if (!existsSync(dest)) {
  console.log('[standalone-fixup] 未发现 standalone 输出，跳过')
  process.exit(0)
}

cpSync(resolve(root, '.next/static'), resolve(dest, '.next/static'), { recursive: true })
if (existsSync(resolve(root, 'public'))) {
  cpSync(resolve(root, 'public'), resolve(dest, 'public'), { recursive: true })
}
console.log('[standalone-fixup] static & public 已复制到 .next/standalone')
