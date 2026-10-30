/** 防误删白名单
 *
 * 格式：patterns 数组，每项支持两种写法
 *   1. 路径前缀："C:\Users\xxx\Documents\重要" — 匹配该目录及其子目录下所有文件
 *   2. 通配符："*.log" / "temp_*.bak" — glob 模式（仅支持 * 和 ?，不递归）
 *
 * 设计原则：白名单只排除文件，不禁用扫描规则；匹配到的文件直接从结果中剔除。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'

let cachedPatterns: string[] | null = null

function whitelistPath(): string {
  return path.join(app.getPath('userData'), 'whitelist.json')
}

/** 加载白名单，返回 pattern 数组（空数组 = 无白名单） */
export function loadWhitelist(): string[] {
  if (cachedPatterns !== null) return cachedPatterns
  try {
    const raw = fs.readFileSync(whitelistPath(), 'utf-8')
    const obj = JSON.parse(raw) as { patterns?: unknown[] }
    cachedPatterns = Array.isArray(obj.patterns)
      ? obj.patterns.map(String).filter(Boolean)
      : []
  } catch {
    cachedPatterns = []
  }
  return cachedPatterns
}

/** 保存白名单 */
export function saveWhitelist(patterns: string[]): void {
  fs.writeFileSync(whitelistPath(), JSON.stringify({ patterns }, null, 2), 'utf-8')
  cachedPatterns = null
}

/** 判断文件路径是否匹配白名单中的任一 pattern */
export function matchesWhitelist(filePath: string, patterns: string[]): boolean {
  if (!patterns.length) return false
  const normalized = filePath.replace(/[\\/]/g, path.sep)

  for (const p of patterns) {
    if (!p) continue

    // glob 模式：包含 * 或 ?
    if (p.includes('*') || p.includes('?')) {
      const basename = path.basename(normalized)
      if (globMatch(basename, p)) return true
      continue
    }

    // 路径前缀匹配（大小写不敏感，Windows 原生行为）
    const normPattern = p.replace(/[\\/]/g, path.sep).replace(/[\\/]$/, '')
    if (normalized.toLowerCase() === normPattern.toLowerCase()) return true
    if (normalized.toLowerCase().startsWith(normPattern.toLowerCase() + path.sep)) return true
  }
  return false
}

/** 极简 glob 匹配——只支持 * 和 ?，不支持嵌套 */
export function globMatch(name: string, pattern: string): boolean {
  let pi = 0
  let ni = 0
  let starPi = -1
  let starNi = -1
  while (ni < name.length) {
    if (pi < pattern.length && pattern[pi] === '?') {
      pi++
      ni++
    } else if (pi < pattern.length && pattern[pi] === '*') {
      starPi = pi
      starNi = ni
      pi++
    } else if (pi < pattern.length && pattern[pi] === name[ni]) {
      pi++
      ni++
    } else if (starPi !== -1) {
      pi = starPi + 1
      starNi++
      ni = starNi
    } else {
      return false
    }
  }
  while (pi < pattern.length && pattern[pi] === '*') pi++
  return pi === pattern.length
}

/** 过滤文件列表中的白名单项，返回干净的 + 被过滤数量 */
export function filterWhitelisted(
  files: string[],
  patterns: string[] = loadWhitelist()
): { kept: string[]; removed: number } {
  if (!patterns.length) return { kept: files, removed: 0 }
  const kept: string[] = []
  let removed = 0
  for (const f of files) {
    if (matchesWhitelist(f, patterns)) removed++
    else kept.push(f)
  }
  return { kept, removed }
}
