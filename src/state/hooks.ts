import { useEffect } from 'react'

/** 練習中など、下のタブを隠したい画面で使う */
export function useImmersive(on = true): void {
  useEffect(() => {
    if (!on) return
    document.body.classList.add('immersive')
    return () => document.body.classList.remove('immersive')
  }, [on])
}

/** ダイアログ・シートが開いている間、背面のスクロールを止める */
export function useLockScroll(on: boolean): void {
  useEffect(() => {
    if (!on) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [on])
}

/** Esc キーで閉じる */
export function useEscape(on: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!on) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [on, onEscape])
}
