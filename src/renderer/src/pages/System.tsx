/** 系统维护 — 磁盘碎片整理 + 内存加速 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'

interface DriveRow {
  letter: string
  label: string
  fs: string
  totalMB: number
  freeMB: number
  type: string
  fragmented: number | null
  needsDefrag?: boolean
}

interface MemTop {
  name: string
  pid: number
  memMB: number
}

interface MemInfo {
  totalMB: number
  availableMB: number
  usedMB: number
  usedPct: number
  topProcesses: MemTop[]
}

interface RuntimeRow {
  id: string
  name: string
  category: string
  installed: boolean
  version: string | null
  arch: string
  downloadUrl: string
  note?: string
}

interface RuntimeSummary {
  ok: number
  total: number
  missing: RuntimeRow[]
}

function fmtSize(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  return mb + ' MB'
}

export default function System(): React.JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<'defrag' | 'memory' | 'runtime' | 'whitelist'>('defrag')

  // ── Defrag state ──
  const [drives, setDrives] = useState<DriveRow[]>([])
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [defraging, setDefraging] = useState<string | null>(null)
  const [defragMsg, setDefragMsg] = useState('')
  const [notice, setNotice] = useState('')

  // ── Memory state ──
  const [mem, setMem] = useState<MemInfo | null>(null)
  const [boosting, setBoosting] = useState(false)
  const [boostMsg, setBoostMsg] = useState('')

  // ── Runtime state ──
  const [runtimes, setRuntimes] = useState<RuntimeRow[]>([])
  const [rtSummary, setRtSummary] = useState<RuntimeSummary | null>(null)
  const [rtScanning, setRtScanning] = useState(false)
  const [rtCopied, setRtCopied] = useState<string>('')

  // ── Whitelist state ──
  const [wlText, setWlText] = useState('')
  const [wlSaved, setWlSaved] = useState(false)

  // ── Load on mount ──
  useEffect(() => {
    loadDrives()
    loadMem()
    window.api.whitelistGet().then((p) => setWlText((p as string[]).join('\n')))
  }, [])

  const loadDrives = async (): Promise<void> => {
    const list = (await window.api.systemDrives()) as DriveRow[]
    setDrives(list)
  }

  const loadMem = async (): Promise<void> => {
    const m = (await window.api.systemMemoryInfo()) as MemInfo
    setMem(m)
  }

  // defrag 进度订阅
  useEffect(() => {
    const off = window.api.onSystemDefragProgress((p) => {
      if (defraging === p.drive) setDefragMsg(p.msg)
    })
    return off
  }, [defraging])

  useEffect(() => {
    const off = window.api.onSystemMemoryProgress((msg) => {
      if (boosting) setBoostMsg(msg)
    })
    return off
  }, [boosting])

  const analyze = async (letter: string): Promise<void> => {
    setAnalyzing(letter)
    setNotice('')
    try {
      const pct = (await window.api.systemDefragAnalyze(letter)) as number | null
      setDrives((prev) =>
        prev.map((d) =>
          d.letter === letter
            ? { ...d, fragmented: pct, needsDefrag: pct !== null && pct >= 10 }
            : d
        )
      )
      if (pct === null) setNotice(t('system.defragAnalyzeFail'))
    } finally {
      setAnalyzing(null)
    }
  }

  const runDefrag = async (letter: string): Promise<void> => {
    setDefraging(letter)
    setDefragMsg('')
    setNotice('')
    try {
      const res = (await window.api.systemDefragRun(letter)) as {
        ok: boolean
        beforePct: number | null
        afterPct: number | null
        error?: string
      }
      if (res.ok) {
        setDrives((prev) =>
          prev.map((d) =>
            d.letter === letter
              ? { ...d, fragmented: res.afterPct, needsDefrag: res.afterPct !== null && res.afterPct >= 10 }
              : d
          )
        )
        setNotice(
          t('system.defragDone', {
            before: res.beforePct ?? '?',
            after: res.afterPct ?? '?'
          })
        )
      } else {
        setNotice(t('system.defragFail', { msg: res.error ?? '' }))
      }
    } finally {
      setDefraging(null)
      setDefragMsg('')
    }
  }

  const boost = async (): Promise<void> => {
    setBoosting(true)
    setBoostMsg('')
    setNotice('')
    try {
      const res = (await window.api.systemMemoryBoost()) as {
        ok: boolean
        freedMB: number
        processedCount: number
        after: MemInfo | null
        error?: string
      }
      if (res.after) setMem(res.after)
      if (res.ok) {
        setNotice(t('system.boostDone', { mb: res.freedMB, n: res.processedCount }))
      } else {
        setNotice(t('system.boostFail', { msg: res.error ?? '' }))
      }
    } finally {
      setBoosting(false)
      setBoostMsg('')
    }
  }

  const scanRuntimes = async (): Promise<void> => {
    setRtScanning(true)
    setNotice('')
    try {
      const res = (await window.api.runtimeScan()) as { items: RuntimeRow[]; summary: RuntimeSummary }
      setRuntimes(res.items)
      setRtSummary(res.summary)
    } finally {
      setRtScanning(false)
    }
  }

  const copyUrl = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setRtCopied(url)
      setTimeout(() => setRtCopied(''), 2000)
    } catch {
      // 忽略
    }
  }

  const saveWhitelist = async (): Promise<void> => {
    const patterns = wlText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    await window.api.whitelistSet(patterns)
    setWlSaved(true)
    setTimeout(() => setWlSaved(false), 2000)
  }

  // 内存使用率条颜色
  const memColor = useMemo(() => {
    if (!mem) return ''
    if (mem.usedPct > 85) return 'danger'
    if (mem.usedPct > 70) return 'warn'
    return 'good'
  }, [mem])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('system.title')}</h1>
          <div className="muted small">{t('system.subtitle')}</div>
        </div>
        <div className="actions">
          <button
            className={`btn ${tab === 'defrag' ? 'primary' : ''}`}
            onClick={() => setTab('defrag')}
          >
            {t('system.tab.defrag')}
          </button>
          <button
            className={`btn ${tab === 'memory' ? 'primary' : ''}`}
            onClick={() => setTab('memory')}
          >
            {t('system.tab.memory')}
          </button>
          <button
            className={`btn ${tab === 'runtime' ? 'primary' : ''}`}
            onClick={() => { setTab('runtime'); if (runtimes.length === 0) scanRuntimes() }}
          >
            {t('system.tab.runtime')}
          </button>
          <button
            className={`btn ${tab === 'whitelist' ? 'primary' : ''}`}
            onClick={() => setTab('whitelist')}
          >
            {t('system.tab.whitelist')}
          </button>
          {tab === 'runtime' ? (
            <button className="btn" onClick={scanRuntimes} disabled={rtScanning}>
              {rtScanning ? t('system.rtScanning') : t('system.rtRescan')}
            </button>
          ) : tab === 'whitelist' ? (
            <button className="btn primary" onClick={saveWhitelist}>
              {wlSaved ? t('system.wlSaved') : t('system.wlSave')}
            </button>
          ) : (
            <button className="btn" onClick={loadDrives} disabled={defraging !== null}>
              {t('system.refresh')}
            </button>
          )}
        </div>
      </div>

      {notice && <div className="result-box">{notice}</div>}

      {/* ═══════════════════════ Defrag Tab ═══════════════════════ */}
      {tab === 'defrag' && (
        <>
          {defraging && defragMsg && <div className="result-box">{defragMsg}</div>}
          <div className="category">
            <div className="category-title">{t('system.drives')}</div>
            {drives.length === 0 && <div className="empty">{t('system.noDrive')}</div>}
            {drives.map((d) => {
              const used = d.totalMB > 0 ? Math.round(((d.totalMB - d.freeMB) / d.totalMB) * 100) : 0
              const busy = analyzing === d.letter || defraging === d.letter
              return (
                <div key={d.letter} className="item-row">
                  <div className="item-name" style={{ fontWeight: 600 }}>
                    {d.letter} {d.label ? `(${d.label})` : ''}
                  </div>
                  <div className="item-samples grow">
                    {d.fs} · {d.type} · {fmtSize(d.freeMB)} free / {fmtSize(d.totalMB)}
                    <div className="progress-bar" style={{ marginTop: 4, maxWidth: 280 }}>
                      <div className={`progress-fill ${used > 90 ? 'danger' : used > 75 ? 'warn' : 'good'}`} style={{ width: used + '%' }} />
                    </div>
                  </div>
                  {d.fragmented !== null && (
                    <span className={`badge ${d.needsDefrag ? 'warn' : 'on'}`}>
                      {t('system.fragPct', { pct: d.fragmented })}
                    </span>
                  )}
                  <button
                    className="btn"
                    style={{ marginLeft: 8 }}
                    disabled={busy || defraging !== null}
                    onClick={() => analyze(d.letter)}
                  >
                    {analyzing === d.letter ? t('system.analyzing') : t('system.analyze')}
                  </button>
                  <button
                    className="btn primary"
                    style={{ marginLeft: 4 }}
                    disabled={busy || defraging !== null}
                    onClick={() => runDefrag(d.letter)}
                  >
                    {defraging === d.letter ? t('system.defraging') : t('system.defrag')}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="category">
            <div className="category-title">{t('system.defragTip.title')}</div>
            <div style={{ padding: '0 12px', lineHeight: 1.8, color: '#9aa3b2', fontSize: 13 }}>
              <div>{t('system.defragTip.1')}</div>
              <div>{t('system.defragTip.2')}</div>
              <div>{t('system.defragTip.3')}</div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ Memory Tab ═══════════════════════ */}
      {tab === 'memory' && (
        <>
          {boosting && boostMsg && <div className="result-box">{boostMsg}</div>}

          <div className="category">
            <div className="category-title">{t('system.memoryTitle')}</div>
            {mem && (
              <>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#7fd4a8' }}>
                    {mem.usedPct}%
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#9aa3b2', fontSize: 13 }}>
                      {t('system.memUsed')}: {fmtSize(mem.usedMB)} / {fmtSize(mem.totalMB)}
                    </div>
                    <div style={{ color: '#9aa3b2', fontSize: 13, marginTop: 2 }}>
                      {t('system.memFree')}: {fmtSize(mem.availableMB)}
                    </div>
                    <div className="progress-bar" style={{ marginTop: 8 }}>
                      <div className={`progress-fill ${memColor}`} style={{ width: mem.usedPct + '%' }} />
                    </div>
                  </div>
                  <button className="btn" onClick={loadMem} disabled={boosting}>
                    {t('system.refresh')}
                  </button>
                  <button className="btn primary" onClick={boost} disabled={boosting}>
                    {boosting ? t('system.boosting') : t('system.boost')}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="category">
            <div className="category-title">{t('system.memTop')}</div>
            {mem?.topProcesses.map((p) => (
              <div key={p.pid} className="item-row">
                <div className="item-name">{p.name}</div>
                <div className="item-samples muted">PID {p.pid}</div>
                <div className="item-name" style={{ width: 100, textAlign: 'right' }}>{fmtSize(p.memMB)}</div>
              </div>
            ))}
            {mem && mem.topProcesses.length === 0 && (
              <div className="empty">{t('system.noProcess')}</div>
            )}
          </div>

          <div className="category">
            <div className="category-title">{t('system.memTip.title')}</div>
            <div style={{ padding: '0 12px', lineHeight: 1.8, color: '#9aa3b2', fontSize: 13 }}>
              <div>{t('system.memTip.1')}</div>
              <div>{t('system.memTip.2')}</div>
              <div>{t('system.memTip.3')}</div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ Runtime Tab ═══════════════════════ */}
      {tab === 'runtime' && (
        <>
          {rtScanning && <div className="result-box">{t('system.rtScanning')}</div>}

          {/* 汇总卡片 */}
          {rtSummary && (
            <div className="category">
              <div className="category-title">{t('system.rtSummary')}</div>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: rtSummary.missing.length === 0 ? '#7fd4a8' : '#e0a06b' }}>
                  {rtSummary.ok}/{rtSummary.total}
                </div>
                <div style={{ color: '#9aa3b2', fontSize: 13, flex: 1 }}>
                  <div>{t('system.rtOkCount', { ok: rtSummary.ok, total: rtSummary.total })}</div>
                  <div style={{ marginTop: 4 }}>
                    {rtSummary.missing.length === 0
                      ? t('system.rtAllGood')
                      : t('system.rtMissing', { n: rtSummary.missing.length })}
                  </div>
                </div>
                {rtSummary.missing.length > 0 && (
                  <span className="badge warn">{t('system.rtMissing', { n: rtSummary.missing.length })}</span>
                )}
              </div>
            </div>
          )}

          {/* 列表 */}
          {runtimes.length > 0 && (
            <div className="category">
              <div className="category-title">{t('system.rtList')}</div>
              {runtimes.map((r) => (
                <div key={r.id} className="item-row">
                  <div className="item-name" style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="item-samples muted">
                    {r.version ?? '-'} · {r.arch}
                    {r.note && <div style={{ color: '#9aa3b2', marginTop: 2 }}>{r.note}</div>}
                  </div>
                  {r.installed ? (
                    <span className="badge on">{t('system.rtInstalled')}</span>
                  ) : (
                    <>
                      <span className="badge warn" style={{ marginRight: 8 }}>{t('system.rtMissingOne')}</span>
                      <button
                        className="btn"
                        onClick={() => copyUrl(r.downloadUrl)}
                        style={{ fontSize: 12 }}
                      >
                        {rtCopied === r.downloadUrl ? t('system.rtCopied') : t('system.rtCopyLink')}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 提示 */}
          <div className="category">
            <div className="category-title">{t('system.rtTip.title')}</div>
            <div style={{ padding: '0 12px', lineHeight: 1.8, color: '#9aa3b2', fontSize: 13 }}>
              <div>{t('system.rtTip.1')}</div>
              <div>{t('system.rtTip.2')}</div>
              <div>{t('system.rtTip.3')}</div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ Whitelist Tab ═══════════════════════ */}
      {tab === 'whitelist' && (
        <>
          <div className="category">
            <div className="category-title">{t('system.wlTitle')}</div>
            <div style={{ padding: '12px 16px' }}>
              <textarea
                value={wlText}
                onChange={(e) => setWlText(e.target.value)}
                rows={10}
                placeholder={t('system.wlPlaceholder')}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
              />
              <div style={{ color: '#9aa3b2', fontSize: 12, marginTop: 8 }}>
                {t('system.wlHint')}
              </div>
            </div>
          </div>

          <div className="category">
            <div className="category-title">{t('system.wlTip.title')}</div>
            <div style={{ padding: '0 12px', lineHeight: 1.8, color: '#9aa3b2', fontSize: 13 }}>
              <div>{t('system.wlTip.1')}</div>
              <div>{t('system.wlTip.2')}</div>
              <div>{t('system.wlTip.3')}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
