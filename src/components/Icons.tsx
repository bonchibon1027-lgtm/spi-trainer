import type { ReactNode } from 'react'

export type TabIconName = 'home' | 'topics' | 'review' | 'stats' | 'settings'

const PATHS: Record<TabIconName, ReactNode> = {
  home: <path d="M3.5 11 12 3.8 20.5 11v8.7a.8.8 0 0 1-.8.8H15v-6H9v6H4.3a.8.8 0 0 1-.8-.8z" />,
  topics: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  review: (
    <>
      <path d="M4.2 12a7.8 7.8 0 0 1 13.4-5.4L19.8 8.8" />
      <path d="M19.8 4v4.8H15" />
      <path d="M19.8 12a7.8 7.8 0 0 1-13.4 5.4L4.2 15.2" />
      <path d="M4.2 20v-4.8H9" />
    </>
  ),
  stats: (
    <>
      <path d="M5 20v-8" />
      <path d="M12 20V5" />
      <path d="M19 20v-5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9" />
      <path d="M19 7h1" />
      <circle cx="16" cy="7" r="2.2" />
      <path d="M4 17h1" />
      <path d="M11 17h9" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
}

export function TabIcon({ name }: { name: TabIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
