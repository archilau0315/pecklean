import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

export default function Home({
  go
}: {
  go: (p: 'junk' | 'startup' | 'privacy' | 'files' | 'uninstall' | 'move' | 'schedule') => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [info, setInfo] = useState<{ version: string; electron: string } | null>(null)
  useEffect(() => {
    window.api.appInfo().then(setInfo)
  }, [])

  const cards = [
    { key: 'junk', icon: '🧹' },
    { key: 'startup', icon: '⚡' },
    { key: 'privacy', icon: '🔒' },
    { key: 'files', icon: '📁' },
    { key: 'uninstall', icon: '🗑️' },
    { key: 'move', icon: '🔀' },
    { key: 'schedule', icon: '⏰' }
  ] as const

  return (
    <div className="page">
      <h1>{t('home.title')}</h1>
      <p className="muted">{t('home.subtitle', { version: info?.electron ?? '' })}</p>
      <div className="card-grid">
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
