import { useEffect, useMemo } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { todayStr } from '../lib/date'
import { countDueReviews } from '../lib/review'
import { bankSource } from '../lib/reviewSource'
import { useApp } from '../state/AppState'
import { ErrorBoundary } from './ErrorBoundary'
import { TabIcon, type TabIconName } from './Icons'

type Tab = { to: string; label: string; icon: TabIconName; match: (p: string) => boolean }

const TABS: Tab[] = [
  { to: '/', label: 'ホーム', icon: 'home', match: (p) => p === '/' || p.startsWith('/mock') },
  {
    to: '/topics',
    label: '分野',
    icon: 'topics',
    match: (p) => /^\/(topics|topic|note|drill)(\/|$)/.test(p),
  },
  { to: '/review', label: '復習', icon: 'review', match: (p) => p.startsWith('/review') },
  { to: '/stats', label: '分析', icon: 'stats', match: (p) => p.startsWith('/stats') },
  { to: '/settings', label: '設定', icon: 'settings', match: (p) => p.startsWith('/settings') },
]

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function Layout() {
  const { data, recovered, saveFailed, dismissRecovered } = useApp()
  const { pathname } = useLocation()
  const today = todayStr()
  const due = useMemo(() => countDueReviews(data.reviews, today, bankSource), [data.reviews, today])

  return (
    <div className="app">
      <ScrollToTop />
      {recovered && (
        <div className="banner banner-warn" role="alert">
          <span>保存されていた学習記録を読み込めなかったため、初期状態で始めました。壊れたデータは端末内に退避してあります。</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={dismissRecovered}>
            閉じる
          </button>
        </div>
      )}
      {saveFailed && (
        <div className="banner banner-error" role="alert">
          学習記録を端末に保存できませんでした（プライベートブラウズや保存容量が原因かもしれません）。設定からバックアップを書き出してください。
        </div>
      )}
      <main className="page">
        {/* 画面を移動したらエラー表示を解除する */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <nav className="tabbar" aria-label="メインメニュー">
        <div className="tabbar-inner">
          {TABS.map((t) => {
            const active = t.match(pathname)
            return (
              <Link key={t.to} to={t.to} className={`tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                <span className="tab-icon">
                  <TabIcon name={t.icon} />
                  {t.to === '/review' && due > 0 && (
                    <span className="tab-badge" aria-label={`今日の復習${due}問`}>
                      {due > 99 ? '99+' : due}
                    </span>
                  )}
                </span>
                <span className="tab-label">{t.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
