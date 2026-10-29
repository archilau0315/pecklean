/** 隐私清理引擎：运行历史、最近文件、跳转列表、浏览器历史 */
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

/** 注册表清理脚本：必须是真的执行，失败要冒出来（不再用 SilentlyContinue 吞掉） */
function regDel(script: string): Promise<void> {
  return runPowerShell(script, 30000).then(() => undefined)
}

async function psCount(script: string): Promise<number> {
  const out = await runPowerShell(script, 30000).catch(() => '0')
  return parseInt(out.trim(), 10) || 0
}

/** 键下值数量（键不存在返回 0） */
function countProps(key: string): Promise<number> {
  return psCount(`$k='${key}'; if (Test-Path $k) { (Get-Item $k).Property.Count } else { 0 }`)
}

/** 键下子键数量（递归） */
function countTree(key: string): Promise<number> {
  return psCount(
    `$k='${key}'; if (Test-Path $k) { (Get-ChildItem $k -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count } else { 0 }`
  )
}

const RUN_MRU = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU'
const RECENT_DOCS = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'
const TYPED_PATHS = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths'
const USER_ASSIST = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist'
const FEATURE_TIP = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage'

/** 删除键下所有值（保留键本身） */
async function cleanValues(key: string): Promise<string[]> {
  try {
    await regDel(
      `$k='${key}'; if (Test-Path $k) { (Get-Item $k).Property | ForEach-Object { Remove-ItemProperty -Path $k -Name $_ -ErrorAction Stop } }`
    )
    return []
  } catch (e) {
    return [(e as Error).message]
  }
}

/** 删除键下所有子项（递归），保留键本身 */
async function cleanTree(key: string): Promise<string[]> {
  try {
    await regDel(`$k='${key}'; if (Test-Path $k) { Remove-Item "$k\\*" -Recurse -Force -ErrorAction Stop }`)
    return []
  } catch (e) {
    return [(e as Error).message]
  }
}

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
    count: () => countProps(RUN_MRU),
    clean: async () => cleanValues(RUN_MRU)
  },
  {
    id: 'recent-docs',
    name: '最近打开文档记录',
    desc: '资源管理器与开始菜单的最近文件',
    count: () => countTree(RECENT_DOCS),
    clean: async () => cleanTree(RECENT_DOCS)
  },
  {
    id: 'typed-paths',
    name: '地址栏输入历史',
    desc: '资源管理器地址栏记录',
    count: () => countProps(TYPED_PATHS),
    clean: async () => cleanValues(TYPED_PATHS)
  },
  {
    id: 'user-assist',
    name: '程序使用痕迹',
    desc: '系统统计的程序启动记录',
    count: () => countTree(USER_ASSIST),
    clean: async () => cleanTree(USER_ASSIST)
  },
  {
    id: 'feature-usage',
    name: '系统功能使用统计',
    desc: '开始菜单/通知使用痕迹',
    count: () => countTree(FEATURE_TIP),
    clean: async () => cleanTree(FEATURE_TIP)
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

/** 全部隐私清理项 id（定时清理用） */
export const PRIVACY_IDS = RULES.map((r) => r.id)

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
