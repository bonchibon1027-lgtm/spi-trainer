// PWA アイコンを作るスクリプト（npm run icons）。図柄は鉛筆と下線。
// 出力: public/pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png, apple-touch-icon.png, favicon.svg
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

const BG1 = '#4c7ad8'
const BG2 = '#2c56b3'

// 鉛筆（下向きに描いて 45 度回す。先端が左下、消しゴムが右上）。中心 (256,256)・全長 300
const pencil = `
  <g transform="rotate(45 256 256)">
    <rect x="216" y="106" width="80" height="34" rx="12" fill="#f4a3a3"/>
    <rect x="216" y="140" width="80" height="22" fill="#cfd6e4"/>
    <rect x="216" y="162" width="80" height="150" fill="#ffd54a"/>
    <rect x="216" y="162" width="26" height="150" fill="#f2b705"/>
    <polygon points="216,312 296,312 256,406" fill="#f6e3c4"/>
    <polygon points="238,356 274,356 256,406" fill="#3b3f4a"/>
  </g>
  <rect x="112" y="396" width="288" height="16" rx="8" fill="#ffffff" opacity="0.92"/>
`

function svg({ rounded, size = 512 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG1}"/><stop offset="1" stop-color="${BG2}"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rounded ? 104 : 0}" fill="url(#g)"/>
  ${pencil}
</svg>`
}

async function png(name, size, opts) {
  await sharp(Buffer.from(svg({ ...opts, size })), { density: 300 }).resize(size, size).png().toFile(join(out, name))
  console.log('wrote', name)
}

await png('pwa-192x192.png', 192, { rounded: true })
await png('pwa-512x512.png', 512, { rounded: true })
await png('maskable-icon-512x512.png', 512, { rounded: false })
await png('apple-touch-icon.png', 180, { rounded: false })
writeFileSync(join(out, 'favicon.svg'), svg({ rounded: true, size: 64 }))
console.log('wrote favicon.svg')
