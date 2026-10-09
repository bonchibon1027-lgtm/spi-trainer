import { Link, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './screens/HomePage'
import { TopicsPage } from './screens/TopicsPage'
import { TopicPage } from './screens/TopicPage'
import { NotePage } from './screens/NotePage'
import { DrillPage } from './screens/DrillPage'
import { ReviewPage } from './screens/ReviewPage'
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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/topic/:id" element={<TopicPage />} />
        <Route path="/note/:id" element={<NotePage />} />
        <Route path="/drill/:id" element={<DrillPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
