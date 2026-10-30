/** 主进程/渲染进程共享类型 */

/** 界面语言：渲染层传给主进程用于选择双语消息 */
export type Lang = 'zh' | 'en'

export interface ScanItem {
  id: string
  name: string
  category: string
  admin: boolean
  files: number
  bytes: number
  /** 代表性路径预览（最多 3 条） */
  samples: string[]
}

export interface ScanProgress {
  current: string
  /** 当前项的稳定 id（规则 id / recyclebin / admin / done），供渲染层翻译 */
  id?: string
  done: number
  total: number
  /** 清理回收站时附带：待清理文件数与总字节 */
  files?: number
  bytes?: number
}

export interface CleanResult {
  files: number
  bytes: number
  errors: string[]
}

export interface StartupItem {
  id: string
  name: string
  command: string
  location: string
  hive: 'HKCU' | 'HKLM' | 'FOLDER'
  enabled: boolean
}

export interface ProcessItem {
  pid: number
  name: string
  memMB: number
}

export interface PrivacyItem {
  id: string
  name: string
  desc: string
  count: number
}

export interface BigFileItem {
  path: string
  bytes: number
  modified: number
}

export interface DuplicateGroup {
  hash: string
  files: { path: string; bytes: number }[]
}

export interface AppInfo {
  version: string
  electron: string
  node: string
}

/** 已安装软件（来自注册表 Uninstall 键） */
export interface UninstallItem {
  /** 注册表子键名或完整键路径 */
  id: string
  name: string
  version: string
  publisher: string
  installLocation: string
  uninstall: string
  quietUninstall: string
  /** 注册表登记大小（KB） */
  sizeKB: number
  date: string
}

/** 卸载残留：注册表键 / 目录 / 快捷方式 */
export interface LeftoverItem {
  id: string
  kind: 'registry' | 'dir' | 'shortcut'
  path: string
  desc: string
  bytes: number
}

/** 残留扫描结果；installed=true 表示软件仍处于安装状态，列出的项可能是正常数据 */
export interface LeftoverReport {
  installed: boolean
  items: LeftoverItem[]
}

export interface MovePreset {
  /** 稳定 id，供渲染层翻译名称 */
  id: string
  name: string
  path: string
  exists: boolean
  bytes: number
}

export interface MoveProgress {
  phase: string
  percent: number
}

export interface MoveResult {
  ok: boolean
  message: string
}

export interface ScheduleConfig {
  enabled: boolean
  /** HH:mm */
  time: string
  junkIds: string[]
  privacy: boolean
  recycleBin: boolean
}

export interface ScheduleStatus extends ScheduleConfig {
  taskExists: boolean
  log: string
}
