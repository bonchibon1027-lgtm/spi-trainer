import { createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { shouldBlockLeave } from './leaveGuard'

// 練習・復習・模試の途中で、戻るボタン（POP）や他画面への移動を止めて確認できること。
// 画面（React）を使わず、データルーターに直接ブロッカーを登録して確かめる。

describe('shouldBlockLeave', () => {
  it('途中のときだけ、別の画面（パスが違う）への移動を止める', () => {
    expect(shouldBlockLeave(true, { pathname: '/drill/nv-profit' }, { pathname: '/' })).toBe(true)
    expect(shouldBlockLeave(true, { pathname: '/mock' }, { pathname: '/stats' })).toBe(true)
    expect(shouldBlockLeave(false, { pathname: '/mock' }, { pathname: '/stats' })).toBe(false)
  })

  it('同じ画面の中の書き換え（?go=1 を消す）は止めない', () => {
    expect(shouldBlockLeave(true, { pathname: '/review' }, { pathname: '/review' })).toBe(false)
  })
})

function setup(active: { on: boolean }, initialEntries: string[], initialIndex: number) {
  const router = createMemoryRouter(
    ['/', '/topics', '/topic/:id', '/drill/:id', '/review', '/mock', '/stats'].map((path) => ({ path, element: null })),
    { initialEntries, initialIndex },
  )
  router.getBlocker('guard', ({ currentLocation, nextLocation }) => shouldBlockLeave(active.on, currentLocation, nextLocation))
  const blocker = () => router.state.blockers.get('guard')
  return { router, blocker }
}

describe('データルーターでの動き', () => {
  it('他の画面への移動は止まり、「続ける」で留まり、「やめる」で移動する', async () => {
    const active = { on: true }
    const { router, blocker } = setup(active, ['/', '/drill/nv-profit'], 1)

    await router.navigate('/stats')
    expect(router.state.location.pathname).toBe('/drill/nv-profit')
    expect(blocker()?.state).toBe('blocked')

    blocker()?.reset?.()
    expect(blocker()?.state).toBe('unblocked')
    expect(router.state.location.pathname).toBe('/drill/nv-profit')

    await router.navigate('/stats')
    expect(blocker()?.state).toBe('blocked')
    blocker()?.proceed?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.state.location.pathname).toBe('/stats')
    router.dispose()
  })

  it('戻るボタン（POP）も止まり、「続ける」で今の画面に留まる。「やめる」で戻る', async () => {
    const active = { on: true }
    const { router, blocker } = setup(active, ['/', '/mock'], 1)

    await router.navigate(-1)
    await new Promise((r) => setTimeout(r, 0))
    expect(blocker()?.state).toBe('blocked')
    expect(router.state.location.pathname).toBe('/mock')

    blocker()?.reset?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(blocker()?.state).toBe('unblocked')
    expect(router.state.location.pathname).toBe('/mock')

    await router.navigate(-1)
    await new Promise((r) => setTimeout(r, 0))
    expect(blocker()?.state).toBe('blocked')
    blocker()?.proceed?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.state.location.pathname).toBe('/')
    router.dispose()
  })

  it('終了画面（途中でない）では止めない', async () => {
    const active = { on: false }
    const { router, blocker } = setup(active, ['/', '/mock'], 1)
    await router.navigate('/stats')
    expect(router.state.location.pathname).toBe('/stats')
    expect(blocker()?.state ?? 'unblocked').toBe('unblocked')
    router.dispose()
  })

  it('復習の ?go=1 を消す書き換え（同じ画面・replace）は止めない', async () => {
    const active = { on: true }
    const { router } = setup(active, ['/', '/review?go=1'], 1)
    await router.navigate('/review', { replace: true })
    expect(router.state.location.pathname).toBe('/review')
    expect(router.state.location.search).toBe('')
    router.dispose()
  })
})
