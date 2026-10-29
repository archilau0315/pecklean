/** 主进程/渲染进程共享类型 */

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
  done: number
  total: number
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
