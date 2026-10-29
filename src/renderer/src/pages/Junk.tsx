import { useState } from 'react'
import { formatBytes } from './fmt'
import type { ScanItem, CleanResult } from '../../../shared/types'

export default function Junk(): React.JSX.Element {
  const [items, setItems] = useState<ScanItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<CleanResult | null>(null)

  const scan = async (): Promise<void> => {
    setScanning(true)
    setResult(null)
    setItems([])
    const off = window.api.onJunkScanProgress((p) => setProgress(`${p.current} (${p.done + 1}/${p.total})`))
    try {
      const res = await window.api.junkScan(null)
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
    if (adminCount > 0 && !confirm(`包含 ${adminCount} 个系统级清理项，将弹出 UAC 提权窗口，继续？`)) return
    setCleaning(true)
    try {
      const res = await window.api.junkClean([...selected])
      setResult(res)
      setItems((prev) => prev.filter((i) => !selected.has(i.id)))
      setSelected(new Set())
    } finally {
      setCleaning(false)
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
        <h1>垃圾清理</h1>
        <div className="actions">
          <button className="btn" onClick={scan} disabled={scanning || cleaning}>
            {scanning ? '扫描中…' : items.length ? '重新扫描' : '开始扫描'}
          </button>
          <button className="btn primary" onClick={clean} disabled={cleaning || scanning || !selected.size}>
            {cleaning ? '清理中…' : `一键清理${selected.size ? ` (${formatBytes(totalSelected)})` : ''}`}
          </button>
        </div>
      </div>
      {scanning && <div className="progress-line">{progress || '正在扫描…'}</div>}
      {result && (
        <div className={`result-box ${result.errors.length ? 'warn' : ''}`}>
          已清理 {result.files} 项，释放 {formatBytes(result.bytes)}
          {result.errors.length > 0 && <div className="errors">跳过 {result.errors.length} 个被占用的文件（正常现象）</div>}
        </div>
      )}
      {items.length > 0 && (
        <div className="scan-summary">
          共发现 <b>{formatBytes(totalAll)}</b> 可清理空间，已勾选 <b>{formatBytes(totalSelected)}</b>
        </div>
      )}
      {categories.map((cat) => (
        <div key={cat} className="category">
          <div className="category-title">{cat}</div>
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
                  {i.name}
                  {i.admin && <span className="badge admin">UAC</span>}
                </span>
                <span className="item-samples" title={i.samples.join('\n')}>
                  {i.samples[0] ?? (i.id === 'recyclebin' ? '清空回收站' : i.samples.length ? '' : '未发现')}
                </span>
                <span className="item-size">
                  {i.files} 项 · {formatBytes(i.bytes)}
                </span>
              </label>
            ))}
        </div>
      ))}
      {!scanning && items.length === 0 && (
        <div className="empty-state">点击「开始扫描」查找可清理的垃圾文件</div>
      )}
    </div>
  )
}
