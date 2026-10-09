import { Component, type ErrorInfo, type ReactNode } from 'react'

// 画面の途中で想定外のエラーが起きても、真っ白にならず案内を出す。
// 学習記録は localStorage にあるので、ホームへ戻れば続けられる。

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('画面でエラーが起きました', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="stack">
        <h1 className="page-title">うまく表示できませんでした</h1>
        <div className="card">
          <p>画面の表示中にエラーが起きました。学習記録は消えていません。</p>
          <p className="muted small">{this.state.error.message}</p>
          <a className="btn btn-primary" href="#/">
            ホームへ戻る
          </a>
        </div>
      </div>
    )
  }
}
