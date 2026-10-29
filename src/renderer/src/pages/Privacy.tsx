import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { privacyDesc, privacyName } from '../i18n/helpers'
import type { PrivacyItem, CleanResult } from '../../../shared/types'

export default function Privacy(): React.JSX.Element {
  const { t } = useI18n()
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
    if (!confirm(t('privacy.confirm'))) return
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
        <h1>{t('privacy.title')}</h1>
        <div className="actions">
          <button className="btn" onClick={scan} disabled={loading || cleaning}>
            {loading ? t('privacy.scanning') : t('privacy.scan')}
          </button>
          <button className="btn primary" onClick={clean} disabled={cleaning || loading || !selected.size}>
            {cleaning ? t('privacy.cleaning') : t('privacy.clean')}
          </button>
        </div>
      </div>
      {result && (
        <div className={`result-box ${result.errors.length ? 'warn' : ''}`}>
          {t('privacy.done')}
          {result.errors.length > 0 &&
            t('privacy.doneFail', { n: result.errors.length, msg: result.errors[0] })}
        </div>
      )}
      <div className="muted small">{t('privacy.hint')}</div>
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
            <span className="item-name">{privacyName(t, i)}</span>
            <span className="item-samples">{privacyDesc(t, i)}</span>
            <span className="item-size">{i.count > 0 ? t('privacy.count', { n: i.count }) : t('privacy.none')}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
