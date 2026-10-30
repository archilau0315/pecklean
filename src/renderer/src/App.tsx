import { useEffect, useState } from 'react'
import Home from './pages/Home'
import Junk from './pages/Junk'
import Startup from './pages/Startup'
import Privacy from './pages/Privacy'
import Files from './pages/Files'
import Uninstall from './pages/Uninstall'
import Move from './pages/Move'
import Schedule from './pages/Schedule'
import { LanguageProvider, useI18n } from './i18n'
import type { Lang } from './i18n'

const NAV = ['home', 'junk', 'startup', 'privacy', 'files', 'uninstall', 'move', 'schedule'] as const

type PageKey = (typeof NAV)[number]

/** 外壳：语言上下文就绪后再渲染，切换语言时整页文案立即刷新 */
function Shell(): React.JSX.Element {
  const { t, lang, setLang } = useI18n()
  // 窗口标题跟随语言切换
  useEffect(() => {
    document.title = t('app.title')
  }, [t])
  const [page, setPage] = useState<PageKey>('home')
  // 页面首次访问后保持挂载，仅隐藏不卸载：扫描/搬移等长任务切走再切回可继续
  const [visited, setVisited] = useState<PageKey[]>(['home'])

  const go = (p: PageKey): void => {
    setPage(p)
    setVisited((prev) => (prev.includes(p) ? prev : [...prev, p]))
  }

  const show = (key: PageKey, node: React.JSX.Element): React.JSX.Element | null =>
    visited.includes(key) ? (
      <div className={`page-wrap${page === key ? '' : ' hidden'}`}>{node}</div>
    ) : null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">
            {/* 啄木鸟侧面头像剪影，白色填充，底色与应用图标一致的墨绿→青绿渐变 */}
            <svg viewBox="0 0 32 32" role="img" aria-label="Pecklean">
              <defs>
                <mask id="pl-bird">
                  <rect width="32" height="32" fill="#fff" />
                  <circle cx="14" cy="14.4" r="1.4" fill="#000" />
                </mask>
              </defs>
              <g transform="translate(-0.8 -2) scale(1.12)" mask="url(#pl-bird)">
                <path
                  fill="#fff"
                  d="M1 16.2 C3.4 16.4 6.4 16.4 8.9 17.8 C8.6 19.4 9.4 21.6 10.4 23.6 C12 26.2 15.8 27.9 18.4 27.6 C21.4 27.2 23.4 25.4 23.6 23.2 C23.6 20.8 22.8 18.6 22.8 16.2 C21.8 14 21 12.4 20.3 10.8 C19.6 8.6 19.4 7 18.6 5.6 C16.8 7 15 8 12.4 8.8 C10.8 9.6 9.6 11.2 9 12.9 C6 13.9 3.3 15.4 1 16.2 Z"
                />
              </g>
            </svg>
          </span>
          <span>{t('app.name')}</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n}
              className={`nav-item ${page === n ? 'active' : ''}`}
              onClick={() => go(n)}
            >
              {t(`nav.${n}`)}
            </button>
          ))}
        </nav>
        <div className="lang-switch">
          {(['zh', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              className={`chip ${lang === l ? 'active' : ''}`}
              onClick={() => setLang(l)}
            >
              {l === 'zh' ? '中文' : 'EN'}
            </button>
          ))}
        </div>
        <div className="sidebar-foot">{t('nav.footer')}</div>
      </aside>
      <main className="content">
        {show('home', <Home go={go} />)}
        {show('junk', <Junk />)}
        {show('startup', <Startup />)}
        {show('privacy', <Privacy />)}
        {show('files', <Files />)}
        {show('uninstall', <Uninstall />)}
        {show('move', <Move />)}
        {show('schedule', <Schedule />)}
      </main>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <LanguageProvider>
      <Shell />
    </LanguageProvider>
  )
}
