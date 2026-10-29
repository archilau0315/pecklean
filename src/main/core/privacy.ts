/** 隐私清理引擎：运行历史、最近文件、跳转列表、浏览器历史（对标原软件 Privacy.Scanner 系列） */
import { promises as fs } from 'fs'
import { existsSync, readdirSync } from 'fs'
import os from 'os'
import path from 'path'
import { runPowerShell, deletePath, expand } from './utils'
import { PrivacyItem, CleanResult } from '../../shared/types'

interface PrivacyRule {
  id: string
  name: string
  desc: string
  count: () => Promise<number>
  clean: () => Promise<string[]> // 返回错误列表
}

/** 注册表删除值/键（仅 HKCU，无需管理员） */
function regDel(args: string): Promise<void> {
  return runPowerShell(`Remove-Item ${args} -ErrorAction SilentlyContinue`).then(() => undefined)
}

function regCount(args: string): Promise<number> {
  return runPowerShell(`(Get-Item ${args} -ErrorAction SilentlyContinue).Count`)
    .then((v) => parseInt(v.trim(), 10) || 0)
    .catch(() => 0)
}

const RUN_MRU = "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU'"
const RECENT_DOCS = "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'"
const TYPED_PATHS = "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths'"
const USER_ASSIST = "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist'"
const FEATURE_TIP = "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage'"

function recentDir(sub = ''): string {
  return path.join(process.env.APPDATA!, 'Microsoft\\Windows\\Recent', sub)
}

async function dirFileCount(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir)).length
  } catch {
    return 0
  }
}

/** 浏览器历史文件（Chrome/Edge）：进程在运行时跳过 */
const BROWSERS: { id: string; name: string; proc: string; base: string }[] = [
  {
    id: 'chrome-history',
    name: 'Chrome 浏览历史',
    proc: 'chrome.exe',
    base: path.join(process.env.LOCALAPPDATA!, 'Google\\Chrome\\User Data')
  },
  {
    id: 'edge-history',
    name: 'Edge 浏览历史',
    proc: 'msedge.exe',
    base: path.join(process.env.LOCALAPPDATA!, 'Microsoft\\Edge\\User Data')
  }
]

function listProfileDirs(base: string): string[] {
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (d.name === 'Default' || /^(Profile|Guest) /.test(d.name)))
    .map((d) => path.join(base, d.name))
}

function isProcRunning(name: string): boolean {
  try {
    const { execSync } = require('child_process')
    const out = execSync(`tasklist /fi "imagename eq ${name}" /nh`, { windowsHide: true }).toString()
    return out.toLowerCase().includes(name)
  } catch {
    return false
  }
}

const RULES: PrivacyRule[] = [
  {
    id: 'run-mru',
    name: '运行命令历史',
    desc: 'Win+R 输入记录',
    count: () => regCount(RUN_MRU),
    clean: async () => {
      const errs: string[] = []
      try {
        await regDel(`${RUN_MRU} -DeleteProperty *`)
      } catch (e) {
        errs.push((e as Error).message)
      }
      return errs
    }
  },
  {
    id: 'recent-docs',
    name: '最近打开文档记录',
    desc: '资源管理器与开始菜单的最近文件',
    count: () => regCount(RECENT_DOCS),
    clean: async () => {
      const errs: string[] = []
      try {
        await regDel(`${RECENT_DOCS} -Recurse`)
      } catch (e) {
        errs.push((e as Error).message)
      }
      return errs
    }
  },
  {
    id: 'typed-paths',
    name: '地址栏输入历史',
    desc: '资源管理器地址栏记录',
    count: () => regCount(TYPED_PATHS),
    clean: async () => {
      try {
        await regDel(`${TYPED_PATHS} -DeleteProperty *`)
      } catch (e) {
        return [(e as Error).message]
      }
      return []
    }
  },
  {
    id: 'user-assist',
    name: '程序使用痕迹',
    desc: '系统统计的程序启动记录',
    count: async () => {
      try {
        const out = await runPowerShell(
          `(Get-ChildItem ${USER_ASSIST} -ErrorAction SilentlyContinue | Get-ChildItem -Name Count).Count`
        )
        return parseInt(out.trim(), 10) || 0
      } catch {
        return 0
      }
    },
    clean: async () => {
      try {
        await regDel(`${USER_ASSIST}\\* -Recurse`)
      } catch (e) {
        return [(e as Error).message]
      }
      return []
    }
  },
  {
    id: 'feature-usage',
    name: '系统功能使用统计',
    desc: '开始菜单/通知使用痕迹',
    count: () => regCount(FEATURE_TIP),
    clean: async () => {
      try {
        await regDel(`${FEATURE_TIP} -DeleteProperty *`)
      } catch (e) {
        return [(e as Error).message]
      }
      return []
    }
  },
  {
    id: 'recent-files',
    name: '最近文件快捷方式',
    desc: 'Recent 文件夹中的 .lnk',
    count: async () => (await dirFileCount(recentDir())) + (await dirFileCount(recentDir('AutomaticDestinations'))) + (await dirFileCount(recentDir('CustomDestinations'))),
    clean: async () => {
      const errs: string[] = []
      for (const d of [recentDir(), recentDir('AutomaticDestinations'), recentDir('CustomDestinations')]) {
        const r = await deletePath(d, d)
        errs.push(...r.errors)
      }
      return errs
    }
  },
  ...BROWSERS.map<PrivacyRule>((b) => ({
    id: b.id,
    name: b.name,
    desc: 'History 数据库记录（浏览器关闭时才可清理）',
    count: async () => {
      const profiles = listProfileDirs(b.base)
      let n = 0
      for (const p of profiles) {
        const st = await fs.stat(path.join(p, 'History')).catch(() => null)
        if (st) n++
      }
      return n
    },
    clean: async () => {
      if (isProcRunning(b.proc)) return [`${b.name}：请先退出 ${b.proc}`]
      const errs: string[] = []
      for (const p of listProfileDirs(b.base)) {
        for (const f of ['History', 'History-journal', 'Visited Links']) {
          const full = path.join(p, f)
          if (existsSync(full)) await fs.unlink(full).catch((e) => errs.push(`${full}: ${e.message}`))
        }
      }
      return errs
    }
  }))
]

export async function scanPrivacy(): Promise<PrivacyItem[]> {
  const items: PrivacyItem[] = []
  for (const r of RULES) {
    const count = await r.count().catch(() => 0)
    items.push({ id: r.id, name: r.name, desc: r.desc, count })
  }
  return items
}

export async function cleanPrivacy(ids: string[]): Promise<CleanResult> {
  const res: CleanResult = { files: 0, bytes: 0, errors: [] }
  for (const id of ids) {
    const rule = RULES.find((r) => r.id === id)
    if (!rule) continue
    const errs = await rule.clean()
    res.files++
    res.errors.push(...errs)
  }
  return res
}

/** 防止未使用告警 */
void os
void expand
