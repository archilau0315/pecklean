import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

interface HealthReport {
  score: number
  junkBytes: number
  junkFiles: number
  startupDisabled: number
  startupTotal: number
  privacyIds: string[]
  optimizeApplied: number
  optimizeTotal: number
  tips: string[]
}

export default function Home({
  go
}: {
  go: (p: 'junk' | 'startup' | 'privacy' | 'files' | 'uninstall' | 'move' | 'optimize' | 'system' | 'schedule') => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [info, setInfo] = useState<{ version: string; electron: string } | null>(null)
  const [health, setHealth] = useState<HealthReport | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)

  useEffect(() => {
    window.api.appInfo().then(setInfo)
  }, [])

  const runDiagnose = async (): Promise<void> => {
    setDiagnosing(true)
    try {
      const r = (await window.api.diagnoseRun()) as HealthReport
      setHealth(r)
    } finally {
      setDiagnosing(false)
    }
  }

  const cards = [
    { key: 'junk', icon: '🧹' },
    { key: 'startup', icon: '⚡' },
    { key: 'privacy', icon: '🔒' },
    { key: 'files', icon: '📁' },
    { key: 'uninstall', icon: '🗑️' },
    { key: 'move', icon: '🔀' },
    { key: 'optimize', icon: '🛠️' },
    { key: 'system', icon: '💻' },
    { key: 'schedule', icon: '⏰' }
  ] as const

  const scoreColor = (s: number): string => {
    if (s >= 75) return '#3fb950'
    if (s >= 50) return '#d29922'
    return '#e5534b'
  }

  const scoreLabel = (s: number): string => {
    if (s >= 75) return t('diagnose.score.good')
    if (s >= 50) return t('diagnose.score.mid')
    return t('diagnose.score.low')
  }

  const fmt = (n: number): string => {
    if (n > 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB'
    if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
    return (n / 1024).toFixed(0) + ' KB'
  }

  return (
    <div className="page">
      <h1>{t('home.title')}</h1>
      <p className="muted">{t('home.subtitle', { version: info?.electron ?? '' })}</p>

      {/* 全面体检区 */}
      <div className="card-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="feature-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {health ? (
              <div style={{ width: 80, height: 80, borderRadius: 40, border: `4px solid ${scoreColor(health.score)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: scoreColor(health.score) }}>
                {health.score}
              </div>
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 40, border: '4px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                —
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="feature-title">{t('diagnose.title')}</span>
              {health ? (
                <>
                  <span style={{ color: scoreColor(health.score), fontSize: 13 }}>{scoreLabel(health.score)}</span>
                  <span className="muted small">
                    Junk: {fmt(health.junkBytes)} / Startup: {health.startupDisabled}/{health.startupTotal} disabled /
                    Privacy: {health.privacyIds.length} / Optimize: {health.optimizeApplied}/{health.optimizeTotal}
                  </span>
                  {health.tips.length > 0 && (
                    <span className="muted small">💡 {health.tips[0]}</span>
                  )}
                </>
              ) : (
                <span className="muted small">{t('diagnose.subtitle') ?? 'One-click scan of every module for a full status report'}</span>
              )}
            </div>
          </div>
          <button className="btn primary" onClick={runDiagnose} disabled={diagnosing}>
            {diagnosing ? t('diagnose.running') : t('diagnose.run')}
          </button>
        </div>
      </div>

      <div className="card-grid" style={{ marginTop: 12 }}>
        {cards.map((c) => (
          <button key={c.key} className="feature-card" onClick={() => go(c.key)}>
            <span className="feature-icon">{c.icon}</span>
            <span className="feature-title">{t(`home.card.${c.key}.title`)}</span>
            <span className="feature-desc">{t(`home.card.${c.key}.desc`)}</span>
          </button>
        ))}
      </div>

      <div className="tip-box">
        <b>{t('home.safety.title')}</b>
        <ul>
          <li>{t('home.safety.1')}</li>
          <li>{t('home.safety.2')}</li>
          <li>{t('home.safety.3')}</li>
        </ul>
      </div>
      <p className="muted small">{t('home.version', { version: info?.version ?? '-' })}</p>
    </div>
  )
}
