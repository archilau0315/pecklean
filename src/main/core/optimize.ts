/** Windows 系统优化：注册表级可回滚优化项
 *
 * 设计原则：
 * 1. 每项优化 = 一组待修改的注册表路径 + 目标值
 * 2. 扫描阶段：读当前值，判断是否已应用
 * 3. 应用阶段：先把"原值"备份到 JSON，再写入目标值
 * 4. 还原阶段：从 JSON 读原值，写回原值；原值不存在 → 删值
 * 5. 全部零联网，所有路径都是安全区域（不碰 HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion 核心）
 */
import { app } from 'electron'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const pExec = promisify(exec)

/** 单条注册表修改项 */
export interface RegOp {
  /** "HKCU\..." 或 "HKLM\..." */
  key: string
  value: string
  /** REG_DWORD / REG_SZ / REG_EXPAND_SZ / REG_BINARY 等 */
  type: string
  /** 目标值（字符串或数字） */
  target: string | number
  /** 扫描阶段需要存在此键才判"已应用"；默认 false */
  mustExist?: boolean
}

/** 一个优化项 = 多组注册表修改 + 可选外部命令 */
export interface OptimizeItem {
  id: string
  /** 稳定分组 id，渲染层翻译 */
  group: string
  /** 执行完成后是否需要重启 Explorer */
  needRestartExplorer?: boolean
  /** 执行完成后是否需要重启资源管理器（旧名字，同上） */
  regs: RegOp[]
  /** 应用完成后的附加命令（可选） */
  applyCmd?: string
  /** 还原命令（可选） */
  undoCmd?: string
}

/** 14 组可回滚优化 */
export const OPTIMIZE_ITEMS: OptimizeItem[] = [
  // ═══════════ Privacy 隐私类 ═══════════
  {
    id: 'privacy.telemetry',
    group: 'privacy',
    regs: [
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', value: 'AllowTelemetry', type: 'REG_DWORD', target: 0 },
      { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Policies\\Microsoft\\Windows\\DataCollection', value: 'AllowTelemetry', type: 'REG_DWORD', target: 0 }
    ]
  },
  {
    id: 'privacy.diagnostics',
    group: 'privacy',
    regs: [
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', value: 'MaxTelemetryLevel', type: 'REG_DWORD', target: 0 },
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', value: 'AutoLogger', type: 'REG_DWORD', target: 0 }
    ]
  },
  {
    id: 'privacy.clipboardHistory',
    group: 'privacy',
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Clipboard', value: 'EnableClipboardHistory', type: 'REG_DWORD', target: 0 },
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', value: 'AllowClipboardHistory', type: 'REG_DWORD', target: 0 }
    ]
  },
  {
    id: 'privacy.activityHistory',
    group: 'privacy',
    regs: [
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', value: 'EnableActivityFeed', type: 'REG_DWORD', target: 0 },
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', value: 'PublishUserActivities', type: 'REG_DWORD', target: 0 }
    ]
  },

  // ═══════════ Performance 性能类 ═══════════
  {
    id: 'perf.visualEffects',
    group: 'perf',
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', value: 'VisualFXSetting', type: 'REG_DWORD', target: 2 }
    ]
  },
  {
    id: 'perf.animation',
    group: 'perf',
    regs: [
      { key: 'HKCU\\Control Panel\\Desktop\\WindowMetrics', value: 'MinAnimate', type: 'REG_SZ', target: '0' },
      { key: 'HKCU\\Control Panel\\Desktop', value: 'MenuShowDelay', type: 'REG_SZ', target: '0' },
      { key: 'HKCU\\Control Panel\\Desktop', value: 'WaitToKillAppTimeout', type: 'REG_SZ', target: '2000' },
      { key: 'HKCU\\Control Panel\\Mouse', value: 'MouseHoverTime', type: 'REG_SZ', target: '200' }
    ]
  },
  {
    id: 'perf.backgroundApps',
    group: 'perf',
    regs: [
      { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy', value: 'LetWindowsAppsRunInBackground', type: 'REG_DWORD', target: 2 }
    ]
  },

  // ═══════════ Explorer 资源管理器 ═══════════
  {
    id: 'explorer.hideExtensions',
    group: 'explorer',
    needRestartExplorer: true,
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', value: 'HideFileExt', type: 'REG_DWORD', target: 0 }
    ]
  },
  {
    id: 'explorer.hideProtected',
    group: 'explorer',
    needRestartExplorer: true,
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', value: 'ShowSuperHidden', type: 'REG_DWORD', target: 1 }
    ]
  },
  {
    id: 'explorer.quickAccess',
    group: 'explorer',
    needRestartExplorer: true,
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer', value: 'ShowFrequent', type: 'REG_DWORD', target: 0 },
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer', value: 'ShowRecent', type: 'REG_DWORD', target: 0 }
    ]
  },

  // ═══════════ Desktop 桌面 ═══════════
  {
    id: 'desktop.shake',
    group: 'desktop',
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', value: 'EnableShakingWindow', type: 'REG_DWORD', target: 0 }
    ]
  },
  {
    id: 'desktop.snap',
    group: 'desktop',
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', value: 'EnableSnap', type: 'REG_DWORD', target: 0 }
    ]
  },

  // ═══════════ Taskbar 任务栏 ═══════════
  {
    id: 'taskbar.combineIcons',
    group: 'taskbar',
    needRestartExplorer: true,
    regs: [
      { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', value: 'TaskbarGlomLevel', type: 'REG_DWORD', target: 2 }
    ]
  },

  // ═══════════ USB 设备安全 ═══════════
  {
    id: 'usb.writeCache',
    group: 'usb',
    regs: [
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{36FC9E60-C465-11CF-8056-444553540000}\\0000', value: 'DeviceParameters', type: 'REG_DWORD', target: 0, mustExist: false }
    ]
  }
]

/** 备份 JSON 结构 */
interface BackupStore {
  /** 优化项 id → 数组（每项对应一条注册表操作的原值快照） */
  [itemId: string]: Array<{
    key: string
    value: string
    type: string
    /** 应用前读到的原始值；null 表示键不存在 */
    original: string | null
  }>
}

function backupPath(): string {
  return path.join(app.getPath('userData'), 'optimize_backup.json')
}

function loadBackup(): BackupStore {
  try {
    if (fs.existsSync(backupPath())) {
      return JSON.parse(fs.readFileSync(backupPath(), 'utf-8'))
    }
  } catch {}
  return {}
}

function saveBackup(data: BackupStore): void {
  try {
    fs.writeFileSync(backupPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch {}
}

/** 查询一条注册表值；返回 null 表示不存在或失败 */
function queryReg(key: string, valueName: string): string | null {
  try {
    const stdout = execSync(
      `reg query "${key}" /v "${valueName}"`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }
    )
    const m = stdout.match(new RegExp(`\\s${valueName}\\s+(REG_\\w+)\\s+(.+)$`, 'm'))
    if (m) return m[2].trim()
    return null
  } catch {
    return null
  }
}

function setReg(key: string, valueName: string, type: string, target: string | number): void {
  const t = type.replace('REG_', '').toLowerCase()
  const v = String(target)
  execSync(`reg add "${key}" /v "${valueName}" /t ${t} /d "${v}" /f`, {
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 5000
  })
}

function delReg(key: string, valueName: string): void {
  try {
    execSync(`reg delete "${key}" /v "${valueName}" /f`, {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 5000
    })
  } catch {
    // 键不存在 / 删除失败 — 静默
  }
}

/** 扫描：返回每项是否已应用 */
export interface OptimizeScanItem {
  id: string
  group: string
  applied: boolean
  /** 已应用数量 / 总数量 */
  detail: Array<{ key: string; value: string; applied: boolean }>
  needRestartExplorer?: boolean
}

export function scanOptimize(): OptimizeScanItem[] {
  return OPTIMIZE_ITEMS.map((item) => {
    const detail = item.regs.map((r) => {
      const cur = queryReg(r.key, r.value)
      const applied = cur !== null && compareValue(cur, r.target, r.type)
      return { key: r.key, value: r.value, applied }
    })
    const allApplied = detail.every((d) => d.applied)
    return {
      id: item.id,
      group: item.group,
      applied: allApplied,
      detail,
      needRestartExplorer: item.needRestartExplorer
    }
  })
}

function compareValue(current: string, target: string | number, type: string): boolean {
  if (type === 'REG_DWORD') {
    // reg query 输出十六进制：0x1 → 1
    const curNum = parseInt(current, 16)
    const tarNum = typeof target === 'number' ? target : parseInt(target, 10)
    return !isNaN(curNum) && curNum === tarNum
  }
  return current.toLowerCase() === String(target).toLowerCase()
}

/** 应用一组优化项（可回滚） */
export interface OptimizeApplyResult {
  itemId: string
  ok: boolean
  errors: string[]
  needRestartExplorer?: boolean
}

export function applyOptimize(itemIds: string[]): OptimizeApplyResult[] {
  const backup = loadBackup()
  const results: OptimizeApplyResult[] = []

  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    const errors: string[] = []
    const snapshots = backup[item.id] ?? []

    for (const r of item.regs) {
      try {
        const original = queryReg(r.key, r.value)
        snapshots.push({ key: r.key, value: r.value, type: r.type, original })
        setReg(r.key, r.value, r.type, r.target)
      } catch (e) {
        errors.push(`${r.key}\\${r.value}: ${(e as Error).message}`)
      }
    }

    backup[item.id] = snapshots
    results.push({
      itemId: item.id,
      ok: errors.length === 0,
      errors,
      needRestartExplorer: item.needRestartExplorer
    })
  }

  saveBackup(backup)
  return results
}

/** 还原一组优化项 */
export function undoOptimize(itemIds: string[]): OptimizeApplyResult[] {
  const backup = loadBackup()
  const results: OptimizeApplyResult[] = []

  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    const snapshots = backup[item.id] ?? []
    if (snapshots.length === 0) continue

    const errors: string[] = []
    const doneKeys = new Set<string>()

    for (const snap of snapshots) {
      const k = `${snap.key}|${snap.value}`
      if (doneKeys.has(k)) continue // 同一值只还原一次
      doneKeys.add(k)

      try {
        if (snap.original === null) {
          delReg(snap.key, snap.value)
        } else {
          setReg(snap.key, snap.value, snap.type, snap.original)
        }
      } catch (e) {
        errors.push(`${snap.key}\\${snap.value}: ${(e as Error).message}`)
      }
    }

    delete backup[item.id]
    results.push({
      itemId: item.id,
      ok: errors.length === 0,
      errors,
      needRestartExplorer: item.needRestartExplorer
    })
  }

  saveBackup(backup)
  return results
}

/** 一键还原所有已应用的优化 */
export function undoAllOptimize(): OptimizeApplyResult[] {
  const backup = loadBackup()
  return undoOptimize(Object.keys(backup))
}

/** 重启资源管理器（部分优化项需要） */
export async function restartExplorer(): Promise<void> {
  try {
    await pExec('taskkill /f /im explorer.exe')
    await new Promise((r) => setTimeout(r, 800))
    await pExec('start explorer.exe')
  } catch {
    // 静默
  }
}

/** 诊断聚合结果 */
export interface HealthReport {
  /** 健康分 0–100 */
  score: number
  junkBytes: number
  junkFiles: number
  startupDisabled: number
  startupTotal: number
  privacyIds: string[]
  optimizeApplied: number
  optimizeTotal: number
  /** 简要建议 */
  tips: string[]
}

/** 健康度分数聚合（轻量版，只跑 scan 不做真正清理） */
export async function runFullDiagnosis(): Promise<HealthReport> {
  const { scanJunk } = await import('./junk')
  const { listStartup } = await import('./startup')
  const { scanPrivacy } = await import('./privacy')

  const [junk, startups, privacy, optimize] = await Promise.all([
    scanJunk(null, () => {}),
    listStartup(),
    scanPrivacy(),
    scanOptimize()
  ])

  const junkBytes = junk.reduce((s, x) => s + (x.bytes || 0), 0)
  const junkFiles = junk.reduce((s, x) => s + (x.files || 0), 0)
  const disabled = startups.filter((s) => !s.enabled).length
  const applied = optimize.filter((o) => o.applied).length

  // 分数：基础 60，扣减 junk / privacy，加分 startup disabled / optimize
  let score = 60
  if (junkBytes > 1024 * 1024) score -= Math.min(20, Math.floor(Math.log2(junkBytes / 1024 / 1024) * 4))
  score -= privacy.length * 2
  score += Math.min(10, disabled)
  score += Math.min(15, applied * 2)
  score = Math.max(0, Math.min(100, score))

  const tips: string[] = []
  if (junkBytes > 1024 * 1024 * 500) tips.push(`检测到大量可清理垃圾（${(junkBytes / 1024 / 1024).toFixed(0)} MB），建议立即清理`)
  if (startups.length > 8) tips.push(`开机启动项偏多（${startups.length} 项），建议禁用不必要的`)
  if (privacy.length > 0) tips.push(`存在 ${privacy.length} 类隐私痕迹，建议清理`)
  if (applied === 0) tips.push(`系统优化未启用，可一键应用以提升隐私和性能`)

  return {
    score,
    junkBytes,
    junkFiles,
    startupDisabled: disabled,
    startupTotal: startups.length,
    privacyIds: privacy.map((p) => p.id),
    optimizeApplied: applied,
    optimizeTotal: optimize.length,
    tips
  }
}
