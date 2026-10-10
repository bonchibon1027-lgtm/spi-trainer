import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router-dom'

// 練習・復習・模試の途中で、戻るボタンや他の画面への移動が起きたときに「やめますか？」と確認する。
// 画面の×ボタンも同じ確認ダイアログを使うので、確認が二重に出ない。
// useBlocker は createHashRouter などの「データルーター」の中でだけ使える。

export type LeaveGuard = {
  /** 確認ダイアログを開くか */
  open: boolean
  /** ×ボタン用: 確認ダイアログを開く */
  askExit: () => void
  /** 「続ける」 */
  keep: () => void
  /** 「やめる」: 止めていた移動を進める。×から開いたときは onExit を呼ぶ */
  leave: () => void
}

/**
 * 移動を止めるか。途中のとき（active）、別の画面（パスが違う）へ移る移動だけ止める。
 * 同じ画面の中での URL の書き換え（復習の ?go=1 を消す処理など）は止めない。
 */
export function shouldBlockLeave(active: boolean, from: { pathname: string }, to: { pathname: string }): boolean {
  return active && from.pathname !== to.pathname
}

/**
 * @param active  途中のとき true。終了画面（結果）では false にして、止めないようにする
 * @param onExit  ×から「やめる」を選んだときの処理（移動や画面の切り替え）
 */
export function useLeaveGuard(active: boolean, onExit: () => void): LeaveGuard {
  // ×から抜けるときの移動は、止めない（二重に確認しない）
  const allow = useRef(false)
  const exitRef = useRef(onExit)
  exitRef.current = onExit

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => shouldBlockLeave(active && !allow.current, currentLocation, nextLocation),
    [active],
  )
  const blocker = useBlocker(shouldBlock)
  const [asking, setAsking] = useState(false)

  // 再読み込み・タブを閉じる・アプリの外へ戻る操作は useBlocker では止められない。
  // 途中のときだけ、ブラウザ標準の「このページを離れますか？」を出す（端末によっては出ないこともある）。
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  useEffect(() => {
    if (active) return
    // 途中でなくなった（模試の時間が切れたなど）ら、開いていた確認を閉じて、その場に留まる
    setAsking(false)
    if (blocker.state === 'blocked') blocker.reset()
  }, [active, blocker])

  const keep = useCallback(() => {
    setAsking(false)
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const leave = useCallback(() => {
    setAsking(false)
    if (blocker.state === 'blocked') {
      blocker.proceed()
      return
    }
    allow.current = true
    exitRef.current()
  }, [blocker])

  return {
    open: active && (asking || blocker.state === 'blocked'),
    askExit: () => setAsking(true),
    keep,
    leave,
  }
}
