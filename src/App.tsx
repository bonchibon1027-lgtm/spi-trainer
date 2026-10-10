import { Link, useRouteError, type RouteObject } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './screens/HomePage'
import { TopicsPage } from './screens/TopicsPage'
import { TopicPage } from './screens/TopicPage'
import { NotePage } from './screens/NotePage'
import { DrillPage } from './screens/DrillPage'
import { ReviewPage } from './screens/ReviewPage'
import { MockPage } from './screens/MockPage'
import { StatsPage } from './screens/StatsPage'
import { SettingsPage } from './screens/SettingsPage'

function NotFound() {
  return (
    <div className="stack">
      <h1 className="page-title">ページが見つかりません</h1>
      <Link to="/" className="btn btn-primary">
        ホームへ
      </Link>
    </div>
  )
}

/** 画面の外側（レイアウト自体）で想定外のエラーが起きたときの表示。中身のエラーは Layout の ErrorBoundary が受ける */
function RootError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : ''
  return (
    <div className="app">
      <div className="stack page">
        <h1 className="page-title">うまく表示できませんでした</h1>
        <div className="card">
          <p>画面の表示中にエラーが起きました。学習記録は消えていません。</p>
          {message && <p className="muted small">{message}</p>}
          <a className="btn btn-primary" href="#/">
            ホームへ戻る
          </a>
        </div>
      </div>
    </div>
  )
}

// 画面の一覧。戻るボタンでの離脱防止（useBlocker）のため、createHashRouter（データルーター）に渡して使う。
// テストでは createMemoryRouter に同じ一覧を渡す。
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <RootError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/topics', element: <TopicsPage /> },
      { path: '/topic/:id', element: <TopicPage /> },
      { path: '/note/:id', element: <NotePage /> },
      { path: '/drill/:id', element: <DrillPage /> },
      { path: '/review', element: <ReviewPage /> },
      { path: '/mock', element: <MockPage /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

/** 今のバージョンの React Router で出る「将来の変更」の警告を出さないための設定（v7 の挙動に先にそろえる） */
export const routerFuture = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const
