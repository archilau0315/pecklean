import { useEffect, useState } from 'react'
import type { PrivacyItem, CleanResult } from '../../../shared/types'

export default function Privacy(): React.JSX.Element {
  const [items, setItems] = useState<PrivacyItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [result, setResult] = useState<CleanResult | null>(null)

  const scan = async (): Promise<void> => {
    setLoading(true)
    setResult(null)
    try {
      const res = await window.api.privacyScan()
      setItems(res)
      setSelected(new Set(res.filter((i) => i.count > 0).map((i) => i.id)))
    } finally {
      setLoading(false)
    }
  }

  const clean = async (): Promise<void> => {
    if (!selected.size) return
    if (!confirm('将删除选中的隐私痕迹记录，不可恢复，继续？')) return
    setCleaning(true)
    try {
      const res = await window.api.privacyClean([...selected])
      setResult(res)
      scan()
    } finally {
      setCleaning(false)
    }
  }

  useEffect(() => {
    scan()
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <h1>隐私清理</h1>
        <div className="actions">
          <button className="btn" onClick={scan} disabled={loading || cleaning}>
            {loading ? '扫描中…' : '重新扫描'}
          </button>
          <button className="btn primary" onClick={clean} disabled={cleaning || loading || !selected.size}>
            {cleaning ? '清理中…' : '清理选中项'}
          </button>
        </div>
      </div>
      {result && (
        <div className={`result-box ${result.errors.length ? 'warn' : ''}`}>
          清理完成{result.errors.length > 0 && `，${result.errors.length} 项失败：${result.errors[0]}`}
        </div>
      )}
      <div className="muted small">提示：浏览器历史需要在对应浏览器完全退出后才能清理</div>
      <div className="category">
        {items.map((i) => (
          <label key={i.id} className={`item-row ${i.count === 0 ? 'empty' : ''}`}>
            <input
              type="checkbox"
              checked={selected.has(i.id)}
              onChange={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (next.has(i.id)) next.delete(i.id)
                  else next.add(i.id)
                  return next
                })
              }
              disabled={i.count === 0}
            />
            <span className="item-name">{i.name}</span>
            <span className="item-samples">{i.desc}</span>
            <span className="item-size">{i.count > 0 ? `${i.count} 条` : '无记录'}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
