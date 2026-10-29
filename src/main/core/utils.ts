/** 主进程通用工具：大小格式化、安全删除、目录遍历、PowerShell 执行、提权 */
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** 环境变量路径展开 */
export function expand(p: string): string {
  return p.replace(/%([^%]+)%/g, (_, k) => {
    const v =
      (
        {
          TEMP: os.tmpdir(),
          TMP: os.tmpdir(),
          USERPROFILE: os.homedir(),
          APPDATA: process.env.APPDATA,
          LOCALAPPDATA: process.env.LOCALAPPDATA,
          SystemRoot: process.env.SystemRoot || 'C:\\Windows',
          WINDIR: process.env.SystemRoot || 'C:\\Windows'
        } as Record<string, string | undefined>
      )[k] ?? process.env[k]
    return v || ''
  })
}

/** 展开规则里的通配路径（支持 ** 递归与 * 通配），返回存在的绝对目录/文件列表 */
export function resolveGlob(pattern: string): string[] {
  const abs = expand(pattern)
  const out: string[] = []
  const walk = (idx: number, cur: string): void => {
    const parts = abs.split(/[\\/]+/)
    if (idx === parts.length) {
      if (existsSync(cur)) out.push(cur)
      return
    }
    const part = parts[idx]
    if (!part.includes('*')) {
      walk(idx + 1, path.join(cur, part))
      return
    }
    const parent = cur
    if (!existsSync(parent)) return
    try {
      for (const name of require('fs').readdirSync(parent)) {
        if (name.startsWith('$')) continue
        if (matchSimple(part, name)) walk(idx + 1, path.join(parent, name))
      }
    } catch {
      /* 无权限跳过 */
    }
  }
  walk(0, '')
  return out
}

/** 简单通配匹配：* 任意字符，? 单字符，其余字面匹配（不区分大小写） */
export function matchSimple(pattern: string, name: string): boolean {
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i'
  )
  return re.test(name)
}

export interface DeleteResult {
  files: number
  bytes: number
  errors: string[]
}

const SKIP_DIRS = new Set(['system volume information', '$recycle.bin'])

/** 删除目录/文件（含通配），返回删除统计。root 之外的内容不会删 */
export async function deletePath(target: string, root?: string): Promise<DeleteResult> {
  const res: DeleteResult = { files: 0, bytes: 0, errors: [] }
  const abs = expand(target)
  if (root) {
    const normRoot = path.resolve(expand(root)).toLowerCase()
    const normTarget = path.resolve(abs).toLowerCase()
    if (!normTarget.startsWith(normRoot)) {
      res.errors.push(`越界跳过: ${abs}`)
      return res
    }
  }
  const st = await fs.lstat(abs).catch(() => null)
  if (!st) {
    res.errors.push(`不存在: ${abs}`)
    return res
  }
  if (st.isFile()) {
    const ok = await unlinkQuiet(abs)
    if (ok.ok) {
      res.files++
      res.bytes += ok.size
    } else res.errors.push(`${abs}: ${ok.err}`)
    return res
  }
  if (st.isSymbolicLink()) {
    const ok = await unlinkQuiet(abs)
    if (ok.ok) res.files++
    else res.errors.push(`${abs}: ${ok.err}`)
    return res
  }
  await deleteDir(abs, res)
  return res
}

async function deleteDir(dir: string, res: DeleteResult): Promise<void> {
  if (SKIP_DIRS.has(path.basename(dir).toLowerCase())) return
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (e) {
    res.errors.push(`${dir}: ${(e as Error).message}`)
    return
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await deleteDir(full, res)
      await fs.rmdir(full).catch(() => res.errors.push(`目录非空: ${full}`))
    } else {
      const ok = await unlinkQuiet(full)
      if (ok.ok) {
        res.files++
        res.bytes += ok.size
      } else if (!ok.locked) res.errors.push(`${full}: ${ok.err}`)
    }
  }
}

async function unlinkQuiet(
  p: string
): Promise<{ ok: boolean; size: number; err?: string; locked?: boolean }> {
  try {
    const size = (await fs.lstat(p)).size
    await fs.unlink(p)
    return { ok: true, size }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EBUSY') return { ok: false, size: 0, err: '文件被占用', locked: true }
    return { ok: false, size: 0, err: (e as Error).message }
  }
}

/** 遍历目录收集文件（并发安全、跳过无权限），onFile 返回 false 中止 */
export async function walkFiles(
  root: string,
  onFile: (full: string, size: number) => void | false,
  opts?: { followDirs?: (dir: string) => boolean }
): Promise<void> {
  const stack: string[] = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (!opts?.followDirs || opts.followDirs(full)) stack.push(full)
      } else if (ent.isFile()) {
        const size = await fs.stat(full).then((s) => s.size, () => 0)
        if (onFile(full, size) === false) return
      }
    }
  }
}

/** 执行 PowerShell 并返回 stdout（强制 UTF-8 输出，避免中文乱码） */
export function runPowerShell(script: string, timeoutMs = 60000): Promise<string> {
  const full = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n${script}`
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', full],
      { windowsHide: true }
    )
    let out = ''
    let err = ''
    const timer = setTimeout(() => proc.kill(), timeoutMs)
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()))
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()))
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolveP(out)
      else rejectP(new Error(err || `PowerShell 退出码 ${code}`))
    })
    proc.on('error', (e) => {
      clearTimeout(timer)
      rejectP(e)
    })
  })
}

/** 以管理员身份运行脚本（触发 UAC），返回退出码 */
export function runElevated(script: string, timeoutMs = 300000): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const file = path.join(os.tmpdir(), `surperclean-admin-${Date.now()}.ps1`)
    // 带 BOM 保存，PowerShell 才能正确识别中文路径
    require('fs').writeFileSync(file, '\ufeff' + script, 'utf8')
    const cmd = [
      'powershell.exe',
      '-NoProfile',
      '-Command',
      `$p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${file.replace(/'/g, "''")}'; exit $p.ExitCode`
    ]
    const proc = spawn(cmd[0], cmd.slice(1), { windowsHide: true })
    let err = ''
    const timer = setTimeout(() => proc.kill(), timeoutMs)
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()))
    proc.on('close', (code) => {
      clearTimeout(timer)
      require('fs').unlinkSync(file)
      if (code === 0 || code === 3010) resolveP(code)
      else rejectP(new Error(err || `提权执行退出码 ${code}`))
    })
    proc.on('error', (e) => {
      clearTimeout(timer)
      rejectP(e)
    })
  })
}

/** 文件全量 MD5（分块） */
export function md5File(file: string): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    const h = crypto.createHash('md5')
    const s = require('fs').createReadStream(file, { highWaterMark: 1 << 20 })
    s.on('data', (d: Buffer) => h.update(d))
    s.on('end', () => resolveP(h.digest('hex')))
    s.on('error', rejectP)
  })
}
