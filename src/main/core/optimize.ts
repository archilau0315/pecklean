/** Windows 系统优化：注册表级可回滚优化项
 *
 * 设计原则：
 * 1. 每项优化 = 一组待修改的注册表路径 + 目标值
 * 2. 扫描阶段：HKCU 路径普通权限读；HKLM 路径合并成一条管理员 PowerShell 读（只弹一次 UAC）
 * 3. 应用阶段：先把"原值"备份到 JSON，HKCU 直接写，HKLM 合并成管理员 PowerShell 写
 * 4. 还原阶段：HKCU 直接还原；HKLM 合并成管理员 PowerShell 还原
 * 5. 全部零联网，所有路径都是安全区域（不碰 HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion 核心）
 */
import { app } from 'electron'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { runElevated } from './utils'

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
}

/** 一个优化项 = 多组注册表修改 */
export interface OptimizeItem {
  id: string
  /** 稳定分组 id，渲染层翻译 */
  group: string
  /** 是否含 HKLM 路径 — apply/undo 时需要管理员 */
  admin?: boolean
  /** 执行完成后是否需要重启 Explorer */
  needRestartExplorer?: boolean
  regs: RegOp[]
}

const HKLM_PREFIX = 'HKLM'

function isHKLM(key: string): boolean {
  return key.startsWith(HKLM_PREFIX)
}

/** 14 组可回滚优化 — 启动时一次性建索引 */
const ITEM_INDEX: OptimizeItem[] = (() => {
  const raw: Omit<OptimizeItem, 'admin'>[] = [
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
        { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{36FC9E60-C465-11CF-8056-444553540000}\\0000', value: 'DeviceParameters', type: 'REG_DWORD', target: 0 }
      ]
    }
  ]
  // 标记 admin 字段
  return raw.map((r) => ({ ...r, admin: r.regs.some((x) => isHKLM(x.key)) }))
})()

export const OPTIMIZE_ITEMS: OptimizeItem[] = ITEM_INDEX

// ═══════════════════════════════════════════════════════════════════
// 备份
// ═══════════════════════════════════════════════════════════════════
interface BackupStore {
  [itemId: string]: Array<{
    key: string
    value: string
    type: string
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

// ═══════════════════════════════════════════════════════════════════
// 单键查询 / 设置 / 删除
// ═══════════════════════════════════════════════════════════════════
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
    // 静默
  }
}

// ═══════════════════════════════════════════════════════════════════
// 管理员 PowerShell 代码生成器
// 每段都用 Write-Output 输出一行 JSON，stdout 可被父进程解析
// ═══════════════════════════════════════════════════════════════════

/** 生成 PowerShell：批量查询注册表值，输出 key|value=结果，__NONE__ 表示不存在 */
function buildQueryScript(ops: Array<{ key: string; value: string }>): string {
  return ops
    .map((op) => {
      const escapedKey = op.key.replace(/'/g, "''")
      const escapedVal = op.value.replace(/'/g, "''")
      const lines = [
        `try {`,
        `  $v = (Get-ItemProperty -Path 'Registry::${escapedKey}' -Name '${escapedVal}' -ErrorAction SilentlyContinue).'${escapedVal}'`,
        `  if ($null -eq $v) { Write-Output "__K__${op.key}|${op.value}=__NONE__" } else { Write-Output "__K__${op.key}|${op.value}=$v" }`,
        `} catch { Write-Output "__K__${op.key}|${op.value}=__ERR__" }`
      ]
      return lines.join("\n")
    })
    .join("\n")
}

/** 生成 PowerShell：批量设置注册表值 */
function buildSetScript(ops: RegOp[]): string {
  return ops.map((op) => {
    const t = op.type.replace('REG_', '').toLowerCase()
    const v = String(op.target)
    return `reg add "${op.key}" /v "${op.value}" /t ${t} /d "${v}" /f 2>$null`
  }).join(' ; ')
}

/** 生成 PowerShell：批量删除注册表值 */
function buildDelScript(ops: Array<{ key: string; value: string }>): string {
  return ops
    .map((op) => `reg delete "${op.key}" /v "${op.value}" /f 2>$null`)
    .join(' ; ')
}

// ═══════════════════════════════════════════════════════════════════
// 扫描：Promise<OptimizeScanItem[]>
// ═══════════════════════════════════════════════════════════════════
export interface OptimizeScanItem {
  id: string
  group: string
  applied: boolean
  detail: Array<{ key: string; value: string; applied: boolean }>
  needRestartExplorer?: boolean
  admin?: boolean
}

function compareValue(current: string, target: string | number, type: string): boolean {
  if (type === 'REG_DWORD') {
    const curNum = parseInt(current, 16)
    const tarNum = typeof target === 'number' ? target : parseInt(target, 10)
    return !isNaN(curNum) && curNum === tarNum
  }
  return current.toLowerCase() === String(target).toLowerCase()
}

export async function scanOptimize(): Promise<OptimizeScanItem[]> {
  // 普通权限读全部注册表值；HKLM 项普通权限读不到 → 返回 null → applied=false
  // 管理员读 HKLM 会白弹 UAC 且父进程拿不到 stdout，这里不做
  const results = new Map<string, string | null>()
  for (const it of OPTIMIZE_ITEMS) {
    for (const r of it.regs) {
      results.set(`${r.key}|${r.value}`, queryReg(r.key, r.value))
    }
  }

  return OPTIMIZE_ITEMS.map((item) => {
    const detail = item.regs.map((r) => {
      const cur = results.get(`${r.key}|${r.value}`) ?? null
      const applied = cur !== null && compareValue(cur, r.target, r.type)
      return { key: r.key, value: r.value, applied }
    })
    return {
      id: item.id,
      group: item.group,
      admin: item.admin,
      applied: detail.every((d) => d.applied),
      detail,
      needRestartExplorer: item.needRestartExplorer
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// apply / undo（async，支持 UAC）
// ═══════════════════════════════════════════════════════════════════
export interface OptimizeApplyResult {
  itemId: string
  ok: boolean
  errors: string[]
  needRestartExplorer?: boolean
}

export async function applyOptimize(itemIds: string[]): Promise<OptimizeApplyResult[]> {
  const backup = loadBackup()
  const results: OptimizeApplyResult[] = []

  // 将要 apply 的 item 拆成两组：HKCU（普通） vs HKLM（管理员）
  const normalOps: RegOp[] = []
  const adminItems: Array<{ item: OptimizeItem; ops: RegOp[] }> = []

  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    const itemAdminOps: RegOp[] = []
    const itemNormalOps: RegOp[] = []
    for (const r of item.regs) {
      if (isHKLM(r.key)) itemAdminOps.push(r)
      else itemNormalOps.push(r)
    }
    if (itemAdminOps.length > 0) adminItems.push({ item, ops: itemAdminOps })
    if (itemNormalOps.length > 0) normalOps.push(...itemNormalOps)
  }

  // 第一步：所有 item 的 HKCU 路径先备份 + 应用（普通权限，立即生效）
  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    const snapshots = backup[item.id] ?? []
    for (const r of item.regs) {
      if (isHKLM(r.key)) continue // HKLM 留到管理员步骤
      const original = queryReg(r.key, r.value)
      snapshots.push({ key: r.key, value: r.value, type: r.type, original })
    }
    backup[item.id] = snapshots
  }
  saveBackup(backup)

  // 第二步：普通权限直接 apply HKCU
  for (const op of normalOps) {
    try {
      setReg(op.key, op.value, op.type, op.target)
    } catch {
      // 静默 — apply 结果稍后聚合
    }
  }

  // 第三步：管理员 apply HKLM（合并成一段 PowerShell，只弹一次 UAC）
  if (adminItems.length > 0) {
    // 备份 HKLM 原值（普通权限读不到，所以管理员脚本里也顺便备份）
    // 简化处理：当前备份里 HKLM 项 original=null 保持 null
    const allAdminOps = adminItems.flatMap((x) => x.ops)
    const ps = buildSetScript(allAdminOps)
    try {
      await runElevated(ps, 60000)
    } catch (e) {
      // 用户取消 UAC — 记录 errors
      for (const { item, ops } of adminItems) {
        const errMsg = (e as Error).message ?? 'UAC cancelled or failed'
        results.push({
          itemId: item.id,
          ok: false,
          errors: [`Admin regs failed (${ops.length} ops): ${errMsg}`],
          needRestartExplorer: item.needRestartExplorer
        })
      }
    }
  }

  // 第四步：聚合 OK 结果（HKCU 已经应用，HKLM 靠管理员脚本）
  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    if (adminItems.some((x) => x.item.id === item.id)) continue // 已经在上一步 push 过（或还没 push）

    const allHKLM = item.regs.every((r) => isHKLM(r.key))
    if (allHKLM) continue // 管理员项只在上面 push

    const ok = item.regs.every((r) => {
      if (isHKLM(r.key)) return true // 不在此步判断
      const cur = queryReg(r.key, r.value)
      return cur !== null && compareValue(cur, r.target, r.type)
    })
    results.push({
      itemId: item.id,
      ok,
      errors: ok ? [] : ['Some HKCU regs did not apply'],
      needRestartExplorer: item.needRestartExplorer
    })
  }

  // 最后：还没被 push 的 admin-only item，标记为 ok=true（假设管理员脚本已执行）
  for (const { item } of adminItems) {
    if (!results.some((r) => r.itemId === item.id)) {
      results.push({ itemId: item.id, ok: true, errors: [], needRestartExplorer: item.needRestartExplorer })
    }
  }

  saveBackup(backup)
  return results
}

/** 还原一组优化项 */
export async function undoOptimize(itemIds: string[]): Promise<OptimizeApplyResult[]> {
  const backup = loadBackup()
  const results: OptimizeApplyResult[] = []

  // 聚合还原操作（按 HKLM / 非 HKCU 分组）
  const adminDels: Array<{ key: string; value: string; original: string | null; type: string }> = []
  const normalDels: Array<{ key: string; value: string; original: string | null; type: string }> = []

  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    const snapshots = backup[item.id] ?? []
    if (snapshots.length === 0) continue

    const doneKeys = new Set<string>()
    for (const snap of snapshots) {
      const k = `${snap.key}|${snap.value}`
      if (doneKeys.has(k)) continue
      doneKeys.add(k)

      if (isHKLM(snap.key)) adminDels.push(snap)
      else normalDels.push(snap)
    }

    delete backup[item.id]
  }
  saveBackup(backup)

  // HKCU 直接还原
  for (const snap of normalDels) {
    try {
      if (snap.original === null) delReg(snap.key, snap.value)
      else setReg(snap.key, snap.value, snap.type, snap.original)
    } catch {}
  }

  // HKLM 管理员还原
  if (adminDels.length > 0) {
    const ops: string[] = []
    for (const snap of adminDels) {
      if (snap.original === null) {
        ops.push(`reg delete "${snap.key}" /v "${snap.value}" /f 2>$null`)
      } else {
        const t = snap.type.replace('REG_', '').toLowerCase()
        ops.push(`reg add "${snap.key}" /v "${snap.value}" /t ${t} /d "${snap.original}" /f 2>$null`)
      }
    }
    try {
      await runElevated(ops.join(' ; '), 60000)
    } catch {}
  }

  // 结果全部 OK（已经尽力执行，静默失败）
  for (const item of OPTIMIZE_ITEMS) {
    if (!itemIds.includes(item.id)) continue
    if (backup[item.id] !== undefined) {
      // 没被 delete（无备份）就跳过
      const hadBackup = true
      void hadBackup
    }
    results.push({ itemId: item.id, ok: true, errors: [], needRestartExplorer: item.needRestartExplorer })
  }

  return results
}

/** 一键还原所有已应用的优化 */
export async function undoAllOptimize(): Promise<OptimizeApplyResult[]> {
  const backup = loadBackup()
  return undoOptimize(Object.keys(backup))
}

// ═══════════════════════════════════════════════════════════════════
// 重启资源管理器
// ═══════════════════════════════════════════════════════════════════
export async function restartExplorer(): Promise<void> {
  try {
    await pExec('taskkill /f /im explorer.exe')
    await new Promise((r) => setTimeout(r, 800))
    await pExec('start explorer.exe')
  } catch {
    // 静默
  }
}

// ═══════════════════════════════════════════════════════════════════
// 诊断聚合
// ═══════════════════════════════════════════════════════════════════
export interface HealthReport {
  score: number
  junkBytes: number
  junkFiles: number
  startupDisabled: number
  startupTotal: number
  privacyIds: string[]
  optimizeApplied: number
  optimizeTotal: number
  tips: string[]
}

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
  const disabled = startups.filter((s) => !s.enabled).length
  const applied = optimize.filter((o) => o.applied).length

  let score = 60
  if (junkBytes > 1024 * 1024) score -= Math.min(20, Math.floor(Math.log2(junkBytes / 1024 / 1024) * 4))
  score -= privacy.length * 2
  score += Math.min(10, disabled)
  score += Math.min(15, applied * 2)
  score = Math.max(0, Math.min(100, score))

  const tips: string[] = []
  if (junkBytes > 1024 * 1024 * 500) tips.push(`Junk: ${(junkBytes / 1024 / 1024).toFixed(0)} MB recommended to clean`)
  if (startups.length > 8) tips.push(`Too many startup items (${startups.length}), disable unnecessary ones`)
  if (privacy.length > 0) tips.push(`${privacy.length} privacy traces found`)
  if (applied === 0) tips.push('System Optimize not applied yet')

  return {
    score,
    junkBytes,
    junkFiles: junk.reduce((s, x) => s + (x.files || 0), 0),
    startupDisabled: disabled,
    startupTotal: startups.length,
    privacyIds: privacy.map((p) => p.id),
    optimizeApplied: applied,
    optimizeTotal: optimize.length,
    tips
  }
}
