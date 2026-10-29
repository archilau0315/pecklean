/** 定时清理：写配置 + 注册 Windows 计划任务；支持 --autoclean 静默执行 */
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import { JUNK_RULES } from './junkRules'
import { cleanJunk } from './junk'
import { cleanPrivacy, PRIVACY_IDS } from './privacy'
import { formatBytes } from './utils'
import { ScheduleConfig, ScheduleStatus, CleanResult } from '../../shared/types'

const TASK_NAME = 'SurperClean_AutoClean'

function configFile(): string {
  return path.join(app.getPath('userData'), 'schedule.json')
}

function logFile(): string {
  return path.join(app.getPath('userData'), 'autoclean.log')
}

/** 默认配置：所有无需提权的垃圾规则 + 隐私清理 + 回收站 */
export function defaultConfig(): ScheduleConfig {
  return {
    enabled: false,
    time: '03:00',
    junkIds: JUNK_RULES.filter((r) => !r.admin).map((r) => r.id),
    privacy: true,
    recycleBin: true
  }
}

async function loadConfig(): Promise<ScheduleConfig> {
  try {
    const text = await fs.readFile(configFile(), 'utf8')
    const parsed = JSON.parse(text) as Partial<ScheduleConfig>
    const def = defaultConfig()
    return {
      enabled: !!parsed.enabled,
      time: validTime(parsed.time) ? parsed.time! : def.time,
      junkIds: Array.isArray(parsed.junkIds) ? parsed.junkIds : def.junkIds,
      privacy: parsed.privacy ?? def.privacy,
      recycleBin: parsed.recycleBin ?? def.recycleBin
    }
  } catch {
    return defaultConfig()
  }
}

function validTime(t?: string): boolean {
  return !!t && /^\d{2}:\d{2}$/.test(t)
}

/** 计划任务是否存在 */
function taskExists(): Promise<boolean> {
  return new Promise((resolveP) => {
    execFile('schtasks.exe', ['/Query', '/TN', TASK_NAME], { windowsHide: true }, (err) => {
      resolveP(!err)
    })
  })
}

/** 注册应用启动命令（开发态需带项目路径） */
function taskCommand(): string {
  if (app.isPackaged) return `"${process.execPath}" --autoclean`
  return `"${process.execPath}" "${app.getAppPath()}" --autoclean`
}

function schtasks(args: string[]): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    execFile('schtasks.exe', args, { windowsHide: true }, (err, _stdout, stderr) => {
      if (err) rejectP(new Error((stderr || '').trim() || err.message))
      else resolveP()
    })
  })
}

async function createTask(time: string): Promise<void> {
  await schtasks([
    '/Create',
    '/F',
    '/TN',
    TASK_NAME,
    '/TR',
    taskCommand(),
    '/SC',
    'DAILY',
    '/ST',
    time
  ])
}

async function deleteTask(): Promise<void> {
  if (!(await taskExists())) return
  await schtasks(['/Delete', '/F', '/TN', TASK_NAME]).catch(() => undefined)
}

/** 读取状态（含最近日志） */
export async function getScheduleStatus(): Promise<ScheduleStatus> {
  const cfg = await loadConfig()
  const log = await fs.readFile(logFile(), 'utf8').catch(() => '')
  return {
    ...cfg,
    taskExists: await taskExists(),
    log: log.split('\n').slice(-8).join('\n').trim()
  }
}

/** 保存配置并同步计划任务 */
export async function saveSchedule(cfg: ScheduleConfig): Promise<ScheduleStatus> {
  if (!validTime(cfg.time)) throw new Error('时间格式应为 HH:mm')
  const time = cfg.time
  await fs.mkdir(app.getPath('userData'), { recursive: true }).catch(() => null)
  await fs.writeFile(configFile(), JSON.stringify({ ...cfg, time }, null, 2), 'utf8')
  if (cfg.enabled) {
    await createTask(time)
  } else {
    await deleteTask()
  }
  return getScheduleStatus()
}

/** 静默清理一次（定时任务与「立即运行」共用） */
export async function runAutoClean(): Promise<CleanResult> {
  const cfg = await loadConfig()
  const total: CleanResult = { files: 0, bytes: 0, errors: [] }
  try {
    const ids = cfg.junkIds.filter((id) => JUNK_RULES.some((r) => r.id === id && !r.admin))
    if (cfg.recycleBin) ids.push('recyclebin')
    if (ids.length) {
      const r = await cleanJunk(ids)
      total.files += r.files
      total.bytes += r.bytes
      total.errors.push(...r.errors)
    }
    if (cfg.privacy) {
      const r = await cleanPrivacy(PRIVACY_IDS)
      total.files += r.files
      total.errors.push(...r.errors)
    }
    await appendLog(`清理 ${total.files} 项，释放 ${formatBytes(total.bytes)}${total.errors.length ? `，${total.errors.length} 项跳过` : ''}`)
  } catch (e) {
    await appendLog(`清理失败：${(e as Error).message}`)
    total.errors.push((e as Error).message)
  }
  return total
}

async function appendLog(text: string): Promise<void> {
  const line = `[${new Date().toLocaleString('zh-CN')}] ${text}\n`
  await fs.appendFile(logFile(), line, 'utf8').catch(() => null)
}
