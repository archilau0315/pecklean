/** 电脑加速引擎：启动项管理（注册表 Run + 启动文件夹）与进程清理 */
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import path from 'path'
import { runPowerShell, runElevated } from './utils'
import { pick } from '../lang'
import { StartupItem, ProcessItem, Lang } from '../../shared/types'

const RUN = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_HKLM = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_HKLM_WOW = 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_DISABLED = 'SurperCleanDisabled'

interface RawEntry {
  hive: 'HKCU' | 'HKLM'
  key: string
  name: string
  command: string
}

async function readRunEntries(hive: 'HKCU' | 'HKLM', key: string): Promise<RawEntry[]> {
  try {
    const script = [
      `Get-Item '${key}' -ErrorAction Stop | Select-Object -ExpandProperty Property | ForEach-Object {`,
      `  $v = (Get-ItemProperty -Path '${key}' -Name $_ -ErrorAction SilentlyContinue).$_;`,
      `  "{0}||{1}||{2}" -f '${hive}', $_, $v }`
    ].join(' ')
    const out = await runPowerShell(script)
    return out
      .split(/\r?\n/)
      .filter((l) => l.includes('||'))
      .map((l) => {
        const [h, name, ...rest] = l.split('||')
        return { hive: h as 'HKCU' | 'HKLM', key, name: name.trim(), command: rest.join('||') }
      })
  } catch {
    return []
  }
}

async function readFolderEntries(): Promise<StartupItem[]> {
  const folders = [
    path.join(process.env.APPDATA!, 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'),
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp'
  ]
  const items: StartupItem[] = []
  for (const folder of folders) {
    if (!existsSync(folder)) continue
    const files = await fs.readdir(folder).catch(() => [])
    for (const f of files) {
      items.push({
        id: `folder|${folder}|${f}`,
        name: f.replace(/\.(lnk|bat|cmd|exe)$/i, ''),
        command: path.join(folder, f),
        location: '启动文件夹',
        hive: 'FOLDER',
        enabled: true
      })
    }
  }
  return items
}

export async function listStartup(): Promise<StartupItem[]> {
  const raws = [
    ...(await readRunEntries('HKCU', RUN)),
    ...(await readRunEntries('HKLM', RUN_HKLM)),
    ...(await readRunEntries('HKLM', RUN_HKLM_WOW))
  ]
  // 已禁用项
  const disabled = await listDisabled()
  const items: StartupItem[] = raws.map((r) => ({
    id: `${r.hive}|${r.key}|${r.name}`,
    name: r.name,
    command: r.command,
    location: r.hive === 'HKCU' ? '当前用户注册表' : '系统注册表(需管理员)',
    hive: r.hive,
    enabled: !disabled.some((d) => d.name === r.name && d.command === r.command)
  }))
  items.push(...(await readFolderEntries()))
  return items
}

async function listDisabled(): Promise<RawEntry[]> {
  const out: RawEntry[] = []
  for (const [hive, key] of [
    ['HKCU', RUN.replace('Run', RUN_DISABLED)],
    ['HKLM', RUN_HKLM.replace('Run', RUN_DISABLED)]
  ] as const) {
    out.push(...(await readRunEntries(hive, key)))
  }
  return out
}

/** 启用/禁用启动项：注册表值移入 SurperCleanDisabled 备份键；文件夹项改名 .disabled */
export async function toggleStartup(id: string, enable: boolean, lang: Lang = 'zh'): Promise<{ ok: boolean; message: string }> {
  const [kind, key, name] = id.split('|')
  if (kind === 'FOLDER') {
    const full = key // key 位存的是完整路径，name 是文件名
    const src = path.join(full, name)
    const dst = enable ? src : `${src}.surperclean-disabled`
    try {
      await fs.rename(enable ? `${src}.surperclean-disabled` : src, dst)
      return { ok: true, message: pick(lang, '已切换', 'Toggled') }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }
  const isHKLM = kind === 'HKLM'
  const targetKey = key
  const backupKey = targetKey.replace('Run', RUN_DISABLED)
  const esc = (s: string) => s.replace(/'/g, "''")
  if (enable) {
    // 从备份键读回并写入 Run，再删备份
    const script = isHKLM
      ? `$v=(Get-ItemProperty -Path '${backupKey}' -Name '${esc(name)}' -ErrorAction Stop).'${esc(name)}'; Set-ItemProperty -Path '${targetKey}' -Name '${esc(name)}' -Value $v; Remove-ItemProperty -Path '${backupKey}' -Name '${esc(name)}'`
      : `$v=(Get-ItemProperty -Path '${backupKey}' -Name '${esc(name)}' -ErrorAction Stop).'${esc(name)}'; Set-ItemProperty -Path '${targetKey}' -Name '${esc(name)}' -Value $v; Remove-ItemProperty -Path '${backupKey}' -Name '${esc(name)}'`
    try {
      if (isHKLM) await runElevated(script)
      else await runPowerShell(script)
      return { ok: true, message: pick(lang, '已启用', 'Enabled') }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  } else {
    const script = `$i=Get-Item '${targetKey}'; $v=$i.GetValue('${esc(name)}'); if($null -eq $v){ throw '值不存在' }; if(-not (Test-Path '${backupKey}')){ New-Item -Path '${backupKey}' -Force | Out-Null }; Set-ItemProperty -Path '${backupKey}' -Name '${esc(name)}' -Value $v; Remove-ItemProperty -Path '${targetKey}' -Name '${esc(name)}'`
    try {
      if (isHKLM) await runElevated(script)
      else await runPowerShell(script)
      return { ok: true, message: pick(lang, '已禁用', 'Disabled') }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }
}

export async function listProcesses(): Promise<ProcessItem[]> {
  const out = await runPowerShell(
    `Get-Process | Where-Object { $_.MainWindowTitle -or $_.WorkingSet64 -gt 100MB } | Sort-Object WorkingSet64 -Descending | Select-Object -First 40 | ForEach-Object { "{0}|{1}|{2}" -f $_.Id, $_.ProcessName, [math]::Round($_.WorkingSet64/1MB,1) }`,
    30000
  )
  return out
    .split(/\r?\n/)
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [pid, name, mem] = l.split('|')
      return { pid: parseInt(pid, 10), name, memMB: parseFloat(mem) }
    })
}

export async function killProcess(pid: number, lang: Lang = 'zh'): Promise<{ ok: boolean; message: string }> {
  try {
    process.kill(pid)
    return { ok: true, message: pick(lang, '已结束', 'Terminated') }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
