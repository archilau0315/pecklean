/** 垃圾清理引擎：按规则扫描统计，按选择清理（普通项 Node 删，管理员项提权删） */
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import { JUNK_RULES, JunkRule } from './junkRules'
import { deletePath, resolveGlob, walkFiles, runElevated, runPowerShell, formatBytes } from './utils'
import { ScanItem, CleanResult, ScanProgress } from '../../shared/types'

/** 回收站特殊项：直接操作 $Recycle.Bin，避免 Clear-RecycleBin 在大回收站上卡死 */
const RECYCLE_ID = 'recyclebin'

let sidCache = ''

/** 当前用户 SID（回收站按 SID 分目录存放） */
async function userSid(): Promise<string> {
  if (sidCache) return sidCache
  const out = await runPowerShell('([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value', 30000)
  sidCache = out.trim()
  return sidCache
}

/** 各磁盘上属于当前用户的回收站目录 */
async function recycleDirs(): Promise<string[]> {
  const sid = await userSid()
  if (!sid) return []
  const dirs: string[] = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const dir = `${letter}:\\$Recycle.Bin\\${sid}`
    if (existsSync(dir)) dirs.push(dir)
  }
  return dirs
}

/** 扫描指定规则 id（不传则全量），返回每个规则的空间占用 */
export async function scanJunk(
  ids: string[] | null,
  onProgress?: (p: ScanProgress) => void
): Promise<ScanItem[]> {
  const rules = ids?.length ? JUNK_RULES.filter((r) => ids.includes(r.id)) : JUNK_RULES
  const total = rules.length + 1
  let done = 0
  const items: ScanItem[] = []
  // 回收站文件多时统计较慢，提前并行开始，边扫其他规则边算
  const recycleTask = scanRecycleBin()
  for (const rule of rules) {
    onProgress?.({ current: rule.name, id: rule.id, done, total })
    const item = await scanRule(rule)
    items.push(item)
    done++
  }
  onProgress?.({ current: '回收站', id: RECYCLE_ID, done, total })
  items.push(await recycleTask)
  done++
  onProgress?.({ current: '完成', id: 'done', done, total })
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

/** 清理选中规则；管理员规则合并成一次 UAC 提权；每步通过 onProgress 反馈 */
export async function cleanJunk(
  ids: string[],
  onProgress?: (p: ScanProgress) => void
): Promise<CleanResult> {
  const rules = JUNK_RULES.filter((r) => ids.includes(r.id))
  const result: CleanResult = { files: 0, bytes: 0, errors: [] }
  const adminDirs: string[] = []
  const total = rules.length + (ids.includes(RECYCLE_ID) ? 1 : 0)
  let done = 0
  for (const rule of rules) {
    onProgress?.({ current: rule.name, id: rule.id, done, total })
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
    done++
  }
  if (adminDirs.length) {
    // 提权脚本：只删文件内容，保留目录本身
    onProgress?.({ current: '管理员项目', id: 'admin', done, total })
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
    const r = await cleanRecycleBin((m) =>
      onProgress?.({ current: '回收站', id: RECYCLE_ID, done, total, files: m.files, bytes: m.bytes })
    )
    result.files += r.files
    result.bytes += r.bytes
    result.errors.push(...r.errors)
    done++
  }
  onProgress?.({ current: '完成', id: 'done', done, total })
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

/** 统计回收站文件数与总大小：先用 robocopy 列表模式（几十万文件约 1 秒），失败回退 PowerShell */
async function measureRecycle(dirs: string[]): Promise<{ files: number; bytes: number }> {
  if (!dirs.length) return { files: 0, bytes: 0 }
  const fast = await robocopyMeasure(dirs)
  if (fast) return fast
  const list = dirs.map((d) => `'${d.replace(/'/g, "''")}'`).join(',')
  const out = await runPowerShell(
    `$c=0;$s=[int64]0; foreach($p in @(${list})){ Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $c++; $s += $_.Length } }; "{0}|{1}" -f $c,$s`,
    600000
  )
  const [c, s] = out.trim().split('|')
  return { files: parseInt(c || '0', 10) || 0, bytes: parseInt(s || '0', 10) || 0 }
}

/** robocopy /L 只统计不复制；/BYTES 输出精确字节 */
async function robocopyMeasure(dirs: string[]): Promise<{ files: number; bytes: number } | null> {
  const dummy = path.join(os.tmpdir(), 'pecklean-rc-empty')
  await fs.mkdir(dummy, { recursive: true }).catch(() => null)
  let files = 0
  let bytes = 0
  for (const dir of dirs) {
    const one = await robocopyCount(dir, dummy)
    if (!one) return null
    files += one.files
    bytes += one.bytes
  }
  return { files, bytes }
}

function robocopyCount(dir: string, dummy: string): Promise<{ files: number; bytes: number } | null> {
  return new Promise((resolveP) => {
    const proc = spawn(
      'robocopy.exe',
      [dir, dummy, '/L', '/E', '/BYTES', '/MT:32', '/NC', '/NFL', '/NDL', '/NP', '/R:0', '/W:0'],
      { windowsHide: true }
    )
    let out = ''
    const timer = setTimeout(() => proc.kill(), 120000)
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()))
    proc.on('close', () => {
      clearTimeout(timer)
      // 汇总表按行固定为「目录 / 文件 / 字节 / 时间」，不依赖本地化标签文字
      const rows: number[][] = []
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(
          /^[^:\r\n]*:[ \t]+([0-9,]+)[ \t]+([0-9,]+)[ \t]+([0-9,]+)[ \t]+([0-9,]+)[ \t]+([0-9,]+)[ \t]+([0-9,]+)/
        )
        if (m) rows.push(m.slice(1, 7).map((x) => parseInt(x.replace(/,/g, ''), 10) || 0))
      }
      if (rows.length < 3) return resolveP(null)
      resolveP({ files: rows[1][0], bytes: rows[2][0] })
    })
    proc.on('error', () => {
      clearTimeout(timer)
      resolveP(null)
    })
  })
}

async function scanRecycleBin(): Promise<ScanItem> {
  let files = 0
  let bytes = 0
  let dirs: string[] = []
  try {
    dirs = await recycleDirs()
    const m = await measureRecycle(dirs)
    files = m.files
    bytes = m.bytes
  } catch {
    /* 回收站不可用时按 0 处理 */
  }
  return { id: RECYCLE_ID, name: '回收站', category: '系统', admin: false, files, bytes, samples: dirs.slice(0, 3) }
}

/** 删除回收站条目：先普通权限逐项删，剩下清不掉的再提权删 */
async function cleanRecycleBin(
  onCount?: (m: { files: number; bytes: number }) => void
): Promise<{ files: number; bytes: number; errors: string[] }> {
  const res = { files: 0, bytes: 0, errors: [] as string[] }
  let dirs: string[] = []
  try {
    dirs = await recycleDirs()
  } catch (e) {
    res.errors.push(`回收站: ${(e as Error).message}`)
    return res
  }
  if (!dirs.length) return res
  const before = await measureRecycle(dirs)
  res.files = before.files
  res.bytes = before.bytes
  onCount?.(before)
  // 用 robocopy 空目录镜像删除：几十万小文件时比逐个删快得多
  for (const dir of dirs) {
    try {
      await mirrorEmpty(dir)
    } catch {
      /* 失败时走下面的提权兜底 */
    }
  }
  if (await hasEntries(dirs)) {
    const purgeScript = dirs
      .map(
        (d) =>
          `Get-ChildItem -LiteralPath '${d.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue`
      )
      .join('\r\n')
    try {
      await runElevated(purgeScript, 600000)
    } catch (e) {
      res.errors.push(`回收站提权清理: ${(e as Error).message}`)
    }
  }
  if (await hasEntries(dirs)) res.errors.push('部分回收站项目被占用，未能清除（可重启后再清理）')
  return res
}

/** 用空目录镜像清空目标目录（robocopy /MIR），返回是否执行成功 */
function mirrorEmpty(dir: string): Promise<boolean> {
  const empty = path.join(os.tmpdir(), 'sc-empty-mirror')
  return fs.mkdir(empty, { recursive: true }).then(
    () =>
      new Promise<boolean>((resolveP) => {
        const proc = spawn(
          'robocopy.exe',
          [empty, dir, '/MIR', '/MT:16', '/R:0', '/W:0', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP'],
          { windowsHide: true }
        )
        proc.on('close', (code) => resolveP((code ?? 16) < 8))
        proc.on('error', () => resolveP(false))
      })
  )
}

async function hasEntries(dirs: string[]): Promise<boolean> {
  for (const dir of dirs) {
    const names = await fs.readdir(dir).catch(() => [])
    if (names.length > 0) return true
  }
  return false
}

export const JUNK_IDS = [...JUNK_RULES.map((r) => r.id), RECYCLE_ID]
export { formatBytes }
