import { useEffect } from 'react'

// 模試中に画面が消えにくいようにする（Screen Wake Lock）。
// 対応していない端末・拒否された場合は何もしない。例外で落ちないようにしてある。

type Sentinel = { released?: boolean; release: () => Promise<void> }
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> }

function getApi(): WakeLockApi | null {
  try {
    const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock
    return api && typeof api.request === 'function' ? api : null
  } catch {
    return null
  }
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const api = getApi()
    if (!api) return
    let sentinel: Sentinel | null = null
    let cancelled = false

    const request = async () => {
      try {
        const s = await api.request('screen')
        if (cancelled) {
          void s.release().catch(() => undefined)
          return
        }
        sentinel = s
      } catch {
        // 拒否・非対応・バッテリー節約モードなど。何もしない
      }
    }
    void request()

    // 画面が裏に回ると解除される。戻ってきたらもう一度お願いする
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      try {
        void sentinel?.release().catch(() => undefined)
      } catch {
        // 解除に失敗しても続行
      }
    }
  }, [active])
}
