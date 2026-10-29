import { useEffect, useState } from 'react'
import { formatBytes } from './fmt'
import type { MovePreset, MoveProgress } from '../../../shared/types'

export default function Move(): React.JSX.Element {
  const [presets, setPresets] = useState<MovePreset[]>([])
  const [drives, setDrives] = useState<string[]>([])
  const [src, setSrc] = useState('')
  const [drive, setDrive] = useState('')
  const [dest, setDest] = useState('')
  const [manualDest, setManualDest] = useState(false)
  const [size, setSize] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<MoveProgress | null>(null)
  const [msg, setMsg] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    Promise.all([window.api.movePresets(), window.api.moveDrives()]).then(([p, d]) => {
      setPresets(p)
      setDrives(d)
      setDrive(d.find((x) => x !== 'C:') ?? d[0] ?? '')
    })
  }, [])

  useEffect(() => {
    if (!src.trim() || !drive || manualDest) return
    let alive = true
    window.api.moveDefaultTarget(src.trim(), drive).then((t) => {
      if (alive) setDest(t)
    })
    return () => {
      alive = false
    }
  }, [src, drive, manualDest])

  useEffect(() => {
    if (!src.trim()) {
      setSize(0)
      return
    }
    let alive = true
    window.api.moveSize(src.trim()).then((s) => {
      if (alive) setSize(s)
    })
    return () => {
      alive = false
    }
  }, [src])

  // 系统文件夹选择框：原目录与新位置都可直接在资源管理器里点选
  const pickSrc = async (): Promise<void> => {
    const p = await window.api.pickFolder({ title: '选择要搬移的目录' })
    if (p) {
      setSrc(p)
      setManualDest(false)
    }
  }

  const pickDest = async (): Promise<void> => {
    const p = await window.api.pickFolder({ title: '选择新的存放位置', defaultPath: dest || undefined })
    if (p) {
      setDest(p)
      setManualDest(true)
    }
  }

  const start = async (): Promise<void> => {
    if (!src.trim() || !dest.trim()) return
    if (!confirm(`将把\n${src}\n搬移到\n${dest}\n\n原目录会变成一个链接，软件照常使用。继续？`)) return
    setBusy(true)
    setMsg('')
    setFailed(false)
    setProgress({ phase: '准备中…', percent: 0 })
    const off = window.api.onMoveProgress(setProgress)
    try {
      const r = await window.api.moveRun(src.trim(), dest.trim())
      setMsg(r.message)
      setFailed(!r.ok)
      if (r.ok) setSrc('')
    } finally {
      off()
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>目录搬移</h1>
        <span className="muted small">把占空间的目录搬到别的盘，原位置自动建链接</span>
      </div>
      {msg && <div className={`result-box ${failed ? 'warn' : ''}`}>{msg}</div>}

      {presets.length > 0 && (
        <div className="category">
          <div className="category-title">常用目录（点击填入）</div>
          <div className="preset-row">
            {presets.map((p) => (
              <button key={p.path} className={`chip ${src === p.path ? 'active' : ''}`} onClick={() => setSrc(p.path)} title={p.path}>
                {p.name} · {formatBytes(p.bytes)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="category">
        <div className="category-title">搬移设置</div>
        <div className="form-row">
          <span className="form-label">原目录</span>
          <input
            className="text-input grow"
            placeholder="要搬走的文件夹，点右侧「选择」也可以"
            value={src}
            onChange={(e) => {
              setSrc(e.target.value)
              setManualDest(false)
            }}
            disabled={busy}
          />
          <button className="btn" onClick={pickSrc} disabled={busy}>
            选择
          </button>
        </div>
        <div className="form-row">
          <span className="form-label">目标盘</span>
          <div className="preset-row">
            {drives.map((d) => (
              <button
                key={d}
                className={`chip ${drive === d ? 'active' : ''}`}
                onClick={() => setDrive(d)}
                disabled={busy}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <span className="form-label">新位置</span>
          <input
            className="text-input grow"
            placeholder="新的存放目录，点右侧「选择」也可以"
            value={dest}
            onChange={(e) => {
              setDest(e.target.value)
              setManualDest(true)
            }}
            disabled={busy}
          />
          <button className="btn" onClick={pickDest} disabled={busy}>
            选择
          </button>
        </div>
        {src && size > 0 && <div className="muted small">目录大小 {formatBytes(size)}，复制时请勿关闭相关软件</div>}

        {progress && (
          <div className="progressbar">
            <div className="progressbar-fill" style={{ width: `${progress.percent}%` }} />
            <span className="progressbar-text">
              {progress.phase} {progress.percent}%
            </span>
          </div>
        )}

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={start} disabled={busy || !src.trim() || !dest.trim()}>
            {busy ? '搬移中…' : '开始搬移'}
          </button>
        </div>
      </div>

      <div className="tip-box">
        <b>工作原理</b>
        <ul>
          <li>先把文件完整复制到新位置并逐个校验，确保一个字节都不丢</li>
          <li>校验通过后删除原目录，在原位置建立 Junction 链接，路径不变、软件无感</li>
          <li>任一步失败会自动回滚，不会出现「文件搬一半」的情况</li>
          <li>搬移前请先退出微信 / QQ 等正在读写该目录的程序</li>
        </ul>
      </div>
    </div>
  )
}
