/** 主进程返回数据的中文标签 → 渲染层翻译（缺失时回退原文） */
import type { LeftoverItem, MovePreset, PrivacyItem, ScanProgress, StartupItem } from '../../../shared/types'
import type { Translate } from './types'

/** 垃圾分类中文值 → 字典短 key */
const CATEGORY_KEY: Record<string, string> = {
  临时文件: 'temp',
  系统缓存: 'syscache',
  浏览器: 'browser',
  常用软件: 'apps',
  系统: 'system'
}

export function junkCategory(t: Translate, category: string): string {
  const key = CATEGORY_KEY[category]
  return key ? t(`junk.cat.${key}`, undefined, category) : category
}

export function junkRuleName(t: Translate, id: string, name: string): string {
  return t(`junk.rule.${id}`, undefined, name)
}

/** 扫描进度：优先按 id 翻译，完成后为「完成」 */
export function junkProgress(t: Translate, p: ScanProgress & { id?: string }): string {
  if (!p.id) return p.current
  if (p.id === 'done') return t('junk.scan.done', undefined, p.current)
  return t(`junk.rule.${p.id}`, undefined, p.current)
}

export function privacyName(t: Translate, item: PrivacyItem): string {
  return t(`privacy.item.${item.id}.name`, undefined, item.name)
}

export function privacyDesc(t: Translate, item: PrivacyItem): string {
  return t(`privacy.item.${item.id}.desc`, undefined, item.desc)
}

export function movePresetName(t: Translate, preset: MovePreset): string {
  return t(`move.preset.${preset.id}`, undefined, preset.name)
}

/** 启动项位置：按 hive 翻译 */
export function startupLocation(t: Translate, item: StartupItem): string {
  const key = item.hive === 'FOLDER' ? 'folder' : item.hive === 'HKCU' ? 'hkcu' : 'hklm'
  return t(`startup.loc.${key}`, undefined, item.location)
}

/** 卸载残留：按 kind 翻译；注册表项保留软件原始 DisplayName */
export function leftoverLabel(t: Translate, item: LeftoverItem): string {
  const base = t(`leftover.kind.${item.kind}`, undefined, item.desc)
  if (item.kind !== 'registry') return base
  const idx = item.desc.indexOf('：')
  const name = idx >= 0 ? item.desc.slice(idx + 1).trim() : ''
  return name ? `${base}${t('leftover.join')}${name}` : base
}
