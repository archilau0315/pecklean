import { useEffect, useState } from 'react'
import { formatBytes, formatDate } from './fmt'
import type { BigFileItem, DuplicateGroup } from '../../../shared/types'

export default function Files(): React.JSX.Element {
  const [tab, setTab] = useState<'big' | 'dup'>('big')
  const [roots, setRoots] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [minMB, setMinMB] = useState(100)
  const [bigFiles, setBigFiles] = useState<BigFileItem[]>([])
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([])
  const [dupChecked, setDupChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    window.api.bigRoots().then((r) => {
      setRoots(r)
      setRoot(r[0] ?? '')
    })
  }, [])

  const scanBig = async (): Promise<void> => {
    setBusy(true)
    setBigFiles([])
    const off = window.api.onBigProgress((p) => setProgress(`扫描 ${p}`))
    try {
      setBigFiles(await window.api.findBig(roots, minMB))
    } finally {
      off()
      setBusy(false)
      setProgress('')
    }
  }

  const scanDup = async (): Promise<void> => {
    if (!root) return
    setBusy(true)
    setDupGroups([])
    setDupChecked(new Set())
    const off = window.api.onDupProgress((n) => setProgress(`已扫描 ${n} 个文件`))
    try {
      setDupGroups(await window.api.findDup(root))
    } finally {
      off()
      setBusy(false)
      setProgress('')
    }
  }

  const deleteBig = async (paths: string[]): Promise<void> => {
    if (!paths.length || !confirm(`删除选中的 ${paths.length} 个文件？不可恢复！`)) return
    const r = await window.api.deleteFiles(paths)
    setMsg(`已删除 ${r.files} 个文件${r.errors.length ? `，${r.errors.length} 个失败` : ''}`)
    setBigFiles((prev) => prev.filter((f) => !paths.includes(f.path)))
  }

  const deleteDup = async (): Promise<void> => {
    if (!dupChecked.size || !confirm(`删除选中的 ${dupChecked.size} 个重复文件？不可恢复！`)) return
    const r = await window.api.deleteFiles([...dupChecked])
    setMsg(`已删除 ${r.files} 个重复文件，释放空间`)
    setDupGroups((prev) =>
      prev
        .map((g) => ({ ...g, files: g.files.filter((f) => !dupChecked.has(f.path)) }))
        .filter((g) => g.files.length >= 1)
    )
    setDupChecked(new Set())
  }

  const toggleDup = (p: string): void => {
    setDupChecked((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>大文件 / 重复文件</h1>
        <div className="tabs">
          <button className={`tab ${tab === 'big' ? 'active' : ''}`} onClick={() => setTab('big')}>
            大文件
          </button>
          <button className={`tab ${tab === 'dup' ? 'active' : ''}`} onClick={() => setTab('dup')}>
            重复文件
          </button>
        </div>
      </div>
      {msg && <div className="result-box">{msg}</div>}
      {busy && <div className="progress-line">{progress || '扫描中…'}</div>}

      {tab === 'big' && (
        <>
          <div className="filter-row">
            <span>扫描位置：</span>
            {roots.map((r) => (
              <label key={r} className="chip">
                <input
                  type="checkbox"
                  checked={roots.includes(r) && roots.length >= 0}
                  onChange={() =>
                    setRoots((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
                  }
                />
                {r.split('\\').pop()}
              </label>
            ))}
            <span className="spacer" />
            <span>大于</span>
            <input type="number" value={minMB} min={1} onChange={(e) => setMinMB(+e.target.value || 100)} />
            <span>MB</span>
            <button className="btn primary" onClick={scanBig} disabled={busy || !roots.length}>
              扫描
            </button>
          </div>
          {bigFiles.map((f) => (
            <div key={f.path} className="item-row">
              <span className="item-samples grow" title={f.path}>
                {f.path}
              </span>
              <span className="item-size">{formatBytes(f.bytes)}</span>
              <span className="item-samples">{formatDate(f.modified)}</span>
              <button className="btn small danger" onClick={() => deleteBig([f.path])}>
                删除
              </button>
            </div>
          ))}
          {!busy && bigFiles.length === 0 && <div className="empty-state">设置条件后点击扫描</div>}
        </>
      )}

      {tab === 'dup' && (
        <>
          <div className="filter-row">
            <span>扫描目录：</span>
            <input className="text-input grow" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="输入文件夹路径，如 D:\下载" />
            <button className="btn primary" onClick={scanDup} disabled={busy || !root}>
              扫描
            </button>
          </div>
          {dupGroups.length > 0 && (
            <div className="page-head">
              <span className="muted">
                发现 {dupGroups.length} 组重复文件（共可释放{' '}
                {formatBytes(dupGroups.reduce((s, g) => s + g.files[0].bytes * (g.files.length - 1), 0))}）
              </span>
              <button className="btn danger" onClick={deleteDup} disabled={!dupChecked.size}>
                删除选中 ({dupChecked.size})
              </button>
            </div>
          )}
          {dupGroups.map((g) => (
            <div key={g.hash} className="dup-group">
              <div className="category-title">
                {g.files.length} 个相同文件 · 每个 {formatBytes(g.files[0]?.bytes ?? 0)}
              </div>
              {g.files.map((f, idx) => (
                <label key={f.path} className="item-row">
                  <input type="checkbox" disabled={idx === 0} checked={dupChecked.has(f.path)} onChange={() => toggleDup(f.path)} />
                  <span className="item-samples grow" title={f.path}>
                    {f.path}
                  </span>
                  {idx === 0 && <span className="badge on">建议保留</span>}
                </label>
              ))}
            </div>
          ))}
          {!busy && dupGroups.length === 0 && <div className="empty-state">输入目录后点击扫描</div>}
        </>
      )}
    </div>
  )
}
