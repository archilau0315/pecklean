/** 渲染层 i18n：公共类型与翻译函数签名 */
import type { Lang } from '../../../shared/types'

export type { Lang }

/** 占位参数：{name} 形式的键值 */
export type Params = Record<string, string | number>

/** t(key, params?, fallback?)：缺失翻译时回退 fallback，再回退 key */
export type Translate = (key: string, params?: Params, fallback?: string) => string
