/** 主进程双语工具：按渲染层传入的 lang 选择中文或英文消息 */
import type { Lang } from '../shared/types'

/** 归一化 IPC 传入的语言参数，缺省中文 */
export function normLang(v: unknown): Lang {
  return v === 'en' ? 'en' : 'zh'
}

/** 双语取一 */
export function pick(lang: Lang, zh: string, en: string): string {
  return lang === 'en' ? en : zh
}
