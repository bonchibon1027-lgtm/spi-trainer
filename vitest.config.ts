import { defineConfig } from 'vitest/config'

// テストは問題生成と問題データの検証が中心。画面のテストはしないので node 環境で回す。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
