/** 垃圾清理引擎：按规则扫描统计，按选择清理（普通项 Node 删，管理员项提权删） */
import { promises as fs } from 'fs'
import { JUNK_RULES, JunkRule } from './junkRules'
import { deletePath, resolveGlob, walkFiles, runElevated, runPowerShell, formatBytes } from './utils'
import { ScanItem, CleanResult } from '../../shared/types'

/** 回收站特殊项：用 PowerShell COM 扫描、Clear-RecycleBin 清空 */
const RECYCLE_ID = 'recyclebin'

/** 扫描指定规则 id（不传则全量），返回每个规则的空间占用 */
export async function scanJunk(
  ids: string[] | null,
  onProgress?: (p: { current: string; done: number; total: number }) => void
): Promise<ScanItem[]> {
  const rules = ids?.length ? JUNK_RULES.filter((r) => ids.includes(r.id)) : JUNK_RULES
  const total = rules.length + 1
  let done = 0
  const items: ScanItem[] = []
  for (const rule of rules) {
    onProgress?.({ current: rule.name, done, total })
    const item = await scanRule(rule)
    items.push(item)
    done++
  }
  onProgress?.({ current: '回收站', done, total })
  items.push(await scanRecycleBin())
  done++
  onProgress?.({ current: '完成', done, total })
  return items
}

async function scanRule(rule: JunkRule): Promise<ScanItem> {
  let files = 0
  let bytes = 0
  const samples: string[] = []
  for (const t of rule.targets) {
    const roots = resolveGlob(t)
    for (const root of roots) {
      if (samples.length < 3) samples.push(root)
      const st = await fs.stat(root).catch(() => null)
      if (st?.isFile()) {
        files++
        bytes += st.size
        if (samples.length < 3) samples.push(root)
        continue
      }
      await walkFiles(root, (_f, size) => {
        files++
        bytes += size
      })
    }
  }
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    admin: !!rule.admin,
    files,
    bytes,
    samples
  }
}

/** 清理选中规则；管理员规则合并成一次 UAC 提权 */
export async function cleanJunk(ids: string[]): Promise<CleanResult> {
  const rules = JUNK_RULES.filter((r) => ids.includes(r.id))
  const result: CleanResult = { files: 0, bytes: 0, errors: [] }
  const adminDirs: string[] = []
  for (const rule of rules) {
    for (const t of rule.targets) {
      if (rule.admin) adminDirs.push(...resolveGlob(t))
      else {
        for (const root of resolveGlob(t)) {
          const r = await deletePath(root, rule.id === 'thumbnail' ? undefined : root)
          result.files += r.files
          result.bytes += r.bytes
          result.errors.push(...r.errors)
        }
      }
    }
  }
  if (adminDirs.length) {
    // 提权脚本：只删文件内容，保留目录本身
    const lines = adminDirs.map((d) => `Remove-Item -LiteralPath '${d.replace(/'/g, "''")}'\\* -Recurse -Force -ErrorAction SilentlyContinue`)
    const script = lines.join('\r\n')
    try {
      const before = await statDirs(adminDirs)
      await runElevated(script)
      const after = await statDirs(adminDirs)
      result.bytes += Math.max(0, before - after)
      result.files += Math.max(0, before - after > 0 ? 1 : 0)
    } catch (e) {
      result.errors.push(`管理员清理: ${(e as Error).message}`)
    }
  }
  if (ids.includes(RECYCLE_ID)) {
    try {
      await runPowerShell('Clear-RecycleBin -Force -ErrorAction Stop')
    } catch (e) {
      result.errors.push(`回收站: ${(e as Error).message}`)
    }
  }
  return result
}

async function statDirs(dirs: string[]): Promise<number> {
  let total = 0
  for (const d of dirs) {
    await walkFiles(d, (_f, size) => {
      total += size
    })
  }
  return total
}

async function scanRecycleBin(): Promise<ScanItem> {
  let files = 0
  let bytes = 0
  try {
    const out = await runPowerShell(
      `$s=(New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | ForEach-Object { $_.ExtendedProperty('System.Size') }; $s | Measure-Object -Sum -Maximum | ForEach-Object { "{0}|{1}" -f $s.Count, $_.Sum }`,
      30000
    )
    const [cnt, sum] = out.trim().split('|')
    files = parseInt(cnt || '0', 10) || 0
    bytes = parseInt(sum || '0', 10) || 0
  } catch {
    /* 回收站不可用时按 0 处理 */
  }
  return { id: RECYCLE_ID, name: '回收站', category: '系统', admin: false, files, bytes, samples: [] }
}

export const JUNK_IDS = [...JUNK_RULES.map((r) => r.id), RECYCLE_ID]
export { formatBytes }
