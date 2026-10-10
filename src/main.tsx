import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { routes, routerFuture } from './App'
import { AppProvider } from './state/AppState'
import './styles/index.css'
import './styles/mock.css'

// GitHub Pages で動かすため、ハッシュ方式（#/...）のルーター。
// 練習・模試の途中で戻るボタンを押したときに確認を出すため、データルーター（createHashRouter）を使う。
const router = createHashRouter(routes, { future: routerFuture })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProvider>
  </StrictMode>,
)
