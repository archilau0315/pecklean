import { useRef, useState } from 'react'
import { formatBytes } from './fmt'
import { useI18n } from '../i18n'
import { junkCategory, junkRuleName, junkProgress } from '../i18n/helpers'
import type { ScanItem, CleanResult, ScanProgress } from '../../../shared/types'

export default function Junk(): React.JSX.Element {
  const { t } = useI18n()
  const [items, setItems] = useState<ScanItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [progress, setProgress] = useState('')
  const [cleanProgress, setCleanProgress] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<CleanResult | null>(null)
  const [notice, setNotice] = useState('')
  const cancelRef = useRef(false)

  /** 任务执行中再次点击按钮：标记取消并请求主进程停止 */
  const cancel = (): void => {
    if (cancelRef.current) return
    cancelRef.current = true
    window.api.junkCancel()
  }

  const scan = async (): Promise<void> => {
    cancelRef.current = false
    setNotice('')
    setScanning(true)
    setResult(null)
    setItems([])
    setSelected(new Set())
    const off = window.api.onJunkScanProgress((p: ScanProgress) =>
      setProgress(`${junkProgress(t, p)} (${p.done + 1}/${p.total})`)
    )
    try {
      const res = await window.api.junkScan(null)
      if (cancelRef.current) {
        setNotice(t('junk.scanCancelled'))
        return
      }
      setItems(res)
      // 默认勾选所有非空且非管理员项
      setSelected(new Set(res.filter((i) => !i.admin && i.bytes > 0).map((i) => i.id)))
    } finally {
      off()
      setScanning(false)
      setProgress('')
    }
  }

  const clean = async (): Promise<void> => {
    if (!selected.size) return
    const adminCount = items.filter((i) => selected.has(i.id) && i.admin).length
    if (adminCount > 0 && !confirm(t('junk.uacConfirm', { n: adminCount }))) return
    cancelRef.current = false
    setNotice('')
    setCleaning(true)
    setCleanProgress('')
    setElapsed(0)
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    const off = window.api.onJunkCleanProgress((p: ScanProgress) => {
      let text = junkProgress(t, p)
      if (p.id === 'recyclebin' && p.files !== undefined) {
        text += ` (${t('junk.item.size', { files: p.files, size: formatBytes(p.bytes || 0) })})`
      } else if (p.id !== 'done' && p.id !== 'cancelled' && p.total > 0) {
        text += ` (${Math.min(p.done + 1, p.total)}/${p.total})`
      }
      setCleanProgress(text)
    })
    try {
      const res = await window.api.junkClean([...selected])
      setResult(res)
      if (cancelRef.current) {
        // 已取消时保留列表，方便查看或重新清理
        setNotice(t('junk.cleanCancelled'))
        return
      }
      setItems((prev) => prev.filter((i) => !selected.has(i.id)))
      setSelected(new Set())
    } finally {
      off()
      clearInterval(timer)
      setCleaning(false)
      setCleanProgress('')
    }
  }

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = items.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.bytes, 0)
  const totalAll = items.reduce((s, i) => s + i.bytes, 0)
  const categories = [...new Set(items.map((i) => i.category))]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('junk.title')}</h1>
        <div className="actions">
          <button className="btn" onClick={scanning ? cancel : scan} disabled={cleaning}>
            {scanning ? t('junk.cancelScan') : items.length ? t('junk.rescan') : t('junk.scan')}
          </button>
          <button
            className="btn primary"
            onClick={cleaning ? cancel : clean}
            disabled={scanning || (!cleaning && !selected.size)}
          >
            {cleaning
              ? t('junk.cancelClean')
              : `${t('junk.clean')}${selected.size ? ` (${formatBytes(totalSelected)})` : ''}`}
          </button>
        </div>
      </div>
      {notice && <div className="result-box">{notice}</div>}
      {scanning && <div className="progress-line">{progress || t('junk.scanningHint')}</div>}
      {cleaning && (
        <div className="progress-line">
          {cleanProgress || t('junk.cleaningHint')} · {elapsed}s
        </div>
      )}
      {result && (
        <div className={`result-box ${result.errors.length ? 'warn' : ''}`}>
          {t('junk.result', { files: result.files, size: formatBytes(result.bytes) })}
          {result.errors.length > 0 && (
            <div className="errors">{t('junk.result.errors', { n: result.errors.length })}</div>
          )}
        </div>
      )}
      {items.length > 0 && (
        <div className="scan-summary">
          {t('junk.summary.before')} <b>{formatBytes(totalAll)}</b> {t('junk.summary.after')}{' '}
          <b>{formatBytes(totalSelected)}</b>
        </div>
      )}
      {categories.map((cat) => (
        <div key={cat} className="category">
          <div className="category-title">{junkCategory(t, cat)}</div>
          {items
            .filter((i) => i.category === cat)
            .map((i) => (
              <label key={i.id} className={`item-row ${i.bytes === 0 ? 'empty' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  onChange={() => toggle(i.id)}
                  disabled={i.bytes === 0}
                />
                <span className="item-name">
                  {junkRuleName(t, i.id, i.name)}
                  {i.admin && <span className="badge admin">UAC</span>}
                </span>
                <span className="item-samples" title={i.samples.join('\n')}>
                  {i.samples[0] ??
                    (i.id === 'recyclebin' ? t('junk.recyclebinAction') : i.samples.length ? '' : t('junk.notFound'))}
                </span>
                <span className="item-size">{t('junk.item.size', { files: i.files, size: formatBytes(i.bytes) })}</span>
              </label>
            ))}
        </div>
      ))}
      {!scanning && items.length === 0 && <div className="empty-state">{t('junk.empty')}</div>}
    </div>
  )
}
