/** 软件卸载与残留清理：读注册表 Uninstall 键、调用卸载命令、扫描并清理残留 */
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { deletePath, expand, runElevated, runPowerShell, walkFiles, matchSimple } from './utils'
import { UninstallItem, LeftoverItem, LeftoverReport } from '../../shared/types'

const REG_ROOTS = [
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
]

interface RawApp {
  id?: string
  DisplayName?: string
  DisplayVersion?: string
  Publisher?: string
  InstallLocation?: string
  UninstallString?: string
  QuietUninstallString?: string
  EstimatedSize?: number
  InstallDate?: string
  PSPath?: string
}

/** 读取已安装软件列表（按名称排序、去重） */
export async function listApps(): Promise<UninstallItem[]> {
  const lines = REG_ROOTS.map((r) => `$r += Get-ItemProperty -Path '${r}' -ErrorAction SilentlyContinue`).join('\n')
  const script = `$ErrorActionPreference='SilentlyContinue'
$r = @()
${lines}
$r | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } |
  Select-Object PSChildName, PSPath, DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString, QuietUninstallString, EstimatedSize, InstallDate |
  ConvertTo-Json -Compress -Depth 3`
  const out = await runPowerShell(script, 120000)
  const text = out.trim()
  if (!text || text === 'null') return []
  let raw: RawApp[]
  try {
    const parsed = JSON.parse(text)
    raw = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
  const seen = new Set<string>()
  const apps: UninstallItem[] = []
  for (const a of raw) {
    const name = (a.DisplayName || '').trim()
    if (!name) continue
    const key = `${name}|${a.DisplayVersion || ''}|${a.InstallLocation || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    apps.push({
      id: cleanRegPath(a.PSPath),
      name,
      version: a.DisplayVersion || '',
      publisher: a.Publisher || '',
      installLocation: a.InstallLocation || '',
      uninstall: (a.UninstallString || '').trim(),
      quietUninstall: (a.QuietUninstallString || '').trim(),
      sizeKB: a.EstimatedSize || 0,
      date: a.InstallDate || ''
    })
  }
  apps.sort((x, y) => x.name.localeCompare(y.name, 'zh-CN'))
  return apps
}

/** 注册表 PSPath（Microsoft.PowerShell.Core\Registry::HKLM\...）转 PowerShell 可删路径 */
function cleanRegPath(psPath?: string): string {
  if (!psPath) return ''
  return psPath.replace(/^Microsoft\.PowerShell\.Core\\Registry::/, '')
}

/** 卸载：MSI 走静默参数，其余调用原始卸载命令（均提权执行） */
export async function uninstallApp(app: UninstallItem): Promise<{ ok: boolean; message: string }> {
  const cmd = app.quietUninstall || app.uninstall
  if (!cmd) return { ok: false, message: '该软件未登记卸载命令，请到「设置 → 应用」中卸载' }
  try {
    const isMsi = /msi(exec)?\.exe/i.test(cmd)
    const guid = cmd.match(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/)?.[0]
    if (isMsi && guid) {
      await runElevated(
        `$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList '/x','${guid}','/qn','/norestart' -Verb RunAs -Wait -PassThru; exit $p.ExitCode`,
        600000
      )
      return { ok: true, message: `${app.name} 已卸载` }
    }
    await runElevated(
      `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','${esc(cmd)}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode`,
      600000
    )
    return { ok: true, message: `${app.name} 卸载结束（如仍有窗口请按提示操作）` }
  } catch (e) {
    return { ok: false, message: `${app.name} 卸载失败：${(e as Error).message}` }
  }
}

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

/** 软件注册表键是否仍存在（存在即仍处于安装状态） */
async function isInstalled(app: UninstallItem): Promise<boolean> {
  if (!app.id) return false
  try {
    const out = await runPowerShell(`Test-Path -LiteralPath 'Registry::${esc(app.id)}'`, 30000)
    return out.trim().toLowerCase() === 'true'
  } catch {
    return false
  }
}

/** 扫描卸载残留：注册表键、安装/数据目录、开始菜单快捷方式 */
export async function scanLeftovers(app: UninstallItem): Promise<LeftoverReport> {
  const installed = await isInstalled(app)
  const names = [app.name, app.name.replace(/^Microsoft /i, '')]
  const found: LeftoverItem[] = []

  // 注册表查询与目录扫描并行，缩短等待
  const regTask = collectRegLeftovers(app, names)

  // 1. 目录残留
  const dirCandidates: string[] = []
  if (app.installLocation && existsSync(expand(app.installLocation))) {
    dirCandidates.push(expand(app.installLocation))
  }
  const dataRoots = [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    expand('%ProgramData%'),
    expand('%LOCALAPPDATA%'),
    expand('%APPDATA%'),
    path.join(os.homedir(), 'Documents')
  ]
  for (const root of dataRoots) {
    if (!root || !existsSync(root)) continue
    let entries: string[] = []
    try {
      entries = await fs.readdir(root)
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(root, e)
      if (dirCandidates.some((d) => d.toLowerCase() === full.toLowerCase())) continue
      if (!nameMatches(e, names)) continue
      const st = await fs.stat(full).catch(() => null)
      if (!st?.isDirectory()) continue
      dirCandidates.push(full)
    }
  }
  const dirItems = await Promise.all(
    dirCandidates.map(async (dir) => ({
      id: `dir:${dir}`,
      kind: 'dir' as const,
      path: dir,
      desc: '残留目录',
      bytes: await quickSize(dir)
    }))
  )
  found.push(...dirItems, ...(await regTask))

  // 2. 开始菜单快捷方式
  const menuRoots = [
    expand('%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs'),
    expand('%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs')
  ]
  for (const root of menuRoots) {
    if (!root || !existsSync(root)) continue
    const lnks = await collectLnk(root)
    for (const lnk of lnks) {
      if (nameMatches(path.basename(lnk, '.lnk'), names)) {
        found.push({ id: `lnk:${lnk}`, kind: 'shortcut', path: lnk, desc: '快捷方式残留', bytes: 0 })
      }
    }
  }
  return { installed, items: found }
}

/** 注册表残留：同名软件键（排除当前软件自己的键） */
async function collectRegLeftovers(app: UninstallItem, names: string[]): Promise<LeftoverItem[]> {
  const out: LeftoverItem[] = []
  const regScript = `$ErrorActionPreference='SilentlyContinue'
$r = @()
${REG_ROOTS.map((r) => `$r += Get-ItemProperty -Path '${r}'`).join('\n')}
$r | Where-Object { $_.DisplayName } | Select-Object PSChildName, PSPath, DisplayName |
  ConvertTo-Json -Compress -Depth 3`
  try {
    const text = (await runPowerShell(regScript, 120000)).trim()
    if (!text || text === 'null') return out
    const parsed = JSON.parse(text)
    const list: RawApp[] = Array.isArray(parsed) ? parsed : [parsed]
    for (const r of list) {
      const dn = (r.DisplayName || '').trim()
      if (!dn || !nameMatches(dn, names)) continue
      const regPath = cleanRegPath(r.PSPath)
      if (!regPath || regPath === app.id) continue
      out.push({ id: `reg:${regPath}`, kind: 'registry', path: regPath, desc: `注册表残留：${dn}`, bytes: 0 })
    }
  } catch {
    /* 注册表读取失败时忽略 */
  }
  return out
}

/** 快速估算目录大小：最多统计 3000 个文件，避免大目录卡住界面 */
async function quickSize(dir: string): Promise<number> {
  let bytes = 0
  let files = 0
  await walkFiles(dir, (_f, size) => {
    bytes += size
    if (++files >= 3000) return false
  })
  return bytes
}

async function collectLnk(root: string): Promise<string[]> {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (matchSimple('*.lnk', e.name)) out.push(full)
    }
  }
  return out
}

/** 应用名/目录名是否匹配（忽略大小写、空格、括号与版本词） */
function nameMatches(target: string, names: string[]): boolean {
  const t = normalize(target)
  if (!t) return false
  return names.some((n) => {
    const a = normalize(n)
    if (!a || a.length < 2) return false
    if (a === t) return true
    const core = a.replace(/(x64|x86|64bit|32bit|version|setup|installer|portable|beta|正式版|官方版|中文版|免费版|客户端)/g, '')
    return core.length >= 4 && (core === t || t === core)
  })
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

/** 清理勾选的残留 */
export async function cleanLeftovers(items: LeftoverItem[]): Promise<{ ok: number; bytes: number; errors: string[] }> {
  const res = { ok: 0, bytes: 0, errors: [] as string[] }
  const regPaths: string[] = []
  for (const it of items) {
    if (it.kind === 'registry') {
      regPaths.push(it.path)
      continue
    }
    const r = await deletePath(it.path, it.kind === 'dir' ? it.path : path.dirname(it.path))
    res.bytes += r.bytes
    if (r.errors.length === 0) res.ok++
    else res.errors.push(...r.errors)
  }
  if (regPaths.length) {
    const script = regPaths.map((p) => `Remove-Item -LiteralPath '${esc(p)}' -Recurse -Force -ErrorAction Stop`).join('\r\n')
    try {
      await runElevated(script, 120000)
      res.ok += regPaths.length
    } catch (e) {
      res.errors.push(`注册表残留：${(e as Error).message}`)
    }
  }
  return res
}
