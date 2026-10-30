/** 系统维护：磁盘碎片整理 + 内存加速
 *
 * 设计原则：
 * 1. defrag 用 Windows 自带命令（defrag C: /O），普通权限即可；管理员可获得更完整优化
 * 2. 内存加速用 EmptyWorkingSet（psapi.dll），把后台进程工作集刷到分页文件，不杀进程
 * 3. 全部零联网，只读盘 / 不碰注册表核心
 */
import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import { runPowerShell } from './utils'

const pExec = promisify(exec)

// ═══════════════════════════════════════════════════════════════════
// 磁盘碎片整理
// ═══════════════════════════════════════════════════════════════════

export interface DriveInfo {
  letter: string        // "C:"
  label: string         // 卷标
  fs: string            // 文件系统 NTFS/FAT32
  totalMB: number       // 总大小 MB
  freeMB: number        // 剩余 MB
  type: 'Fixed' | 'Removable' | 'Network' | 'Unknown'
  fragmented: number | null  // 碎片率 %（analyze 之后才有，未分析为 null）
  needsDefrag?: boolean
}

/** 列出所有物理盘（过滤光驱/网络盘） */
export async function listDrives(): Promise<DriveInfo[]> {
  const ps = `Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -in 2,3} | ForEach-Object {
    [PSCustomObject]@{
      Letter = $_.DeviceID
      Label  = $_.VolumeName
      FS     = $_.FileSystem
      TotalMB = [math]::Round($_.Size/1MB)
      FreeMB  = [math]::Round($_.FreeSpace/1MB)
      Type   = if ($_.DriveType -eq 2) {'Removable'} else {'Fixed'}
    }
  } | ConvertTo-Json -Compress`
  try {
    const out = await runPowerShell(ps, 15000)
    const arr = JSON.parse(out.trim()) as Record<string, unknown>[]
    // 可能单对象不是数组
    const list = Array.isArray(arr) ? arr : [arr]
    return list.map((d) => ({
      letter: String(d.Letter ?? ''),
      label: String(d.Label ?? ''),
      fs: String(d.FS ?? ''),
      totalMB: Number(d.TotalMB ?? 0),
      freeMB: Number(d.FreeMB ?? 0),
      type: (String(d.Type ?? 'Unknown') as DriveInfo['type']),
      fragmented: null
    }))
  } catch {
    return []
  }
}

/** 分析单个盘碎片率（defrag X: /A /V） */
export async function analyzeDefrag(drive: string): Promise<number | null> {
  const ps = `defrag ${drive} /A /V 2>&1 | Out-String`
  try {
    const out = await runPowerShell(ps, 120000)
    // Windows 10/11 输出： "Total fragmented space    = XX% (xxx bytes)"
    const m = out.match(/Total fragmented space\s*=\s*(\d+)%/i)
    if (m) return parseInt(m[1], 10)
    // 回退： "Analysis complete. (XX% fragmented)"
    const m2 = out.match(/Analysis complete\.\s*\((\d+)%\s*fragmented\)/i)
    if (m2) return parseInt(m2[1], 10)
    return null
  } catch {
    return null
  }
}

/** 执行磁盘优化（defrag X: /O，SSD→TRIM，HDD→碎片整理） */
export async function runDefrag(drive: string, onProgress?: (msg: string) => void): Promise<DefragResult> {
  onProgress?.(`Analyzing ${drive}...`)
  const pct = await analyzeDefrag(drive)
  if (pct !== null) onProgress?.(`Fragmentation: ${pct}%`)

  onProgress?.(`Optimizing ${drive}... (this may take a while)`)
  // defrag /O 会自动判断 SSD/HDD
  const ps = `defrag ${drive} /O 2>&1 | Out-String`
  try {
    const out = await runPowerShell(ps, 600000) // 10 分钟超时
    const m = out.match(/Total fragmented space\s*=\s*(\d+)%/i)
    const finalPct = m ? parseInt(m[1], 10) : pct
    onProgress?.(`Done. Final fragmentation: ${finalPct ?? '?'}%`)
    return { ok: true, drive, beforePct: pct, afterPct: finalPct }
  } catch (e) {
    const msg = (e as Error).message
    onProgress?.(`Failed: ${msg}`)
    return { ok: false, drive, beforePct: pct, afterPct: null, error: msg }
  }
}

export interface DefragResult {
  ok: boolean
  drive: string
  beforePct: number | null
  afterPct: number | null
  error?: string
}

// ═══════════════════════════════════════════════════════════════════
// 内存加速
// ═══════════════════════════════════════════════════════════════════

export interface MemoryInfo {
  totalMB: number
  availableMB: number
  usedMB: number
  usedPct: number
  topProcesses: Array<{ name: string; pid: number; memMB: number }>
}

/** 当前内存使用 + Top 10 大进程 */
export async function memoryInfo(): Promise<MemoryInfo> {
  const ps = `$os = Get-CimInstance Win32_OperatingSystem
$total = [math]::Round($os.TotalVisibleMemorySize/1024)
$free  = [math]::Round($os.FreePhysicalMemory/1024)
$top   = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | ForEach-Object {
  [PSCustomObject]@{ Name=$_.ProcessName; PID=$_.Id; MemMB=[math]::Round($_.WorkingSet64/1MB) }
}
[PSCustomObject]@{
  TotalMB = $total
  FreeMB  = $free
  Top     = $top
} | ConvertTo-Json -Compress -Depth 3`
  try {
    const out = await runPowerShell(ps, 15000)
    const d = JSON.parse(out.trim()) as Record<string, unknown>
    const totalMB = Number(d.TotalMB ?? 0)
    const freeMB = Number(d.FreeMB ?? 0)
    const top = (d.Top as Record<string, unknown>[] | undefined) ?? []
    const usedMB = Math.max(0, totalMB - freeMB)
    return {
      totalMB,
      availableMB: freeMB,
      usedMB,
      usedPct: totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0,
      topProcesses: top.map((p) => ({
        name: String(p.Name ?? ''),
        pid: Number(p.PID ?? 0),
        memMB: Number(p.MemMB ?? 0)
      }))
    }
  } catch {
    return { totalMB: 0, availableMB: 0, usedMB: 0, usedPct: 0, topProcesses: [] }
  }
}

/** 内存加速：对工作集 > threshold 的进程调用 EmptyWorkingSet，把物理内存刷到分页文件 */
export async function memoryBoost(opts?: {
  thresholdMB?: number        // 只处理工作集超过这个值的进程
  excludeSystem?: boolean     // 排除 system / idle / registry 等关键进程
  onProgress?: (msg: string) => void
}): Promise<MemoryBoostResult> {
  const threshold = opts?.thresholdMB ?? 50
  const excludeSystem = opts?.excludeSystem !== false // 默认排除
  const onProgress = opts?.onProgress ?? (() => {})

  onProgress(`Before: ${formatMem(await memoryInfo())}`)

  // PowerShell：Add-Type psapi.dll EmptyWorkingSet → 遍历进程 → 调用
  const ps = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MemAPI {
  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr hProcess);
}
'@
$exclude = @('', 'System Idle Process', 'System', 'Registry', 'smss', 'csrss', 'wininit', 'services', 'lsass', 'winlogon', 'fontdrvhost', 'dwm', 'MemCompression')
$freed = 0
$count = 0
Get-Process | Where-Object {
  $_.WorkingSet64 -gt $threshold * 1MB
  $(if ($excludeSystem) { $_.ProcessName -notin $exclude } else { $true })
} | ForEach-Object {
  try {
    $before = $_.WorkingSet64
    [MemAPI]::EmptyWorkingSet($_.Handle) | Out-Null
    $_.MinWorkingSet = [intptr]::MinValue
    $after = (Get-Process -Id $_.Id -ErrorAction SilentlyContinue).WorkingSet64
    if ($after -lt $before) {
      $script:freed += ($before - $after)
    }
    $script:count++
  } catch {}
}
"FREED=$([math]::Round($freed/1MB))"
"COUNT=$count"
`.trim()

  try {
    const out = await runPowerShell(ps, 60000)
    let freedMB = 0
    let count = 0
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^FREED=(\d+)$/)
      if (m) freedMB = parseInt(m[1], 10)
      const m2 = line.match(/^COUNT=(\d+)$/)
      if (m2) count = parseInt(m2[1], 10)
    }
    const after = await memoryInfo()
    onProgress(`After: ${formatMem(after)}`)
    return { ok: true, freedMB, processedCount: count, after }
  } catch (e) {
    return { ok: false, freedMB: 0, processedCount: 0, after: null, error: (e as Error).message }
  }
}

export interface MemoryBoostResult {
  ok: boolean
  freedMB: number
  processedCount: number
  after: MemoryInfo | null
  error?: string
}

function formatMem(m: MemoryInfo): string {
  if (!m.totalMB) return 'mem unknown'
  return `${m.usedMB}/${m.totalMB}MB (${m.usedPct}%)`
}
