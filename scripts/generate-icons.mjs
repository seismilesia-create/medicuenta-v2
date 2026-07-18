// Rasteriza public/icons/icon.svg a los PNG que consume la PWA.
// Uso: node scripts/generate-icons.mjs
// Cuando cambies el ícono definitivo, editá icon.svg y volvé a correr esto.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'public', 'icons')
const svg = await readFile(join(iconsDir, 'icon.svg'))

// Tamaños del manifest + apple-touch (iOS) + favicon PNG.
const targets = [
  { size: 72, file: 'icon-72.png' },
  { size: 96, file: 'icon-96.png' },
  { size: 128, file: 'icon-128.png' },
  { size: 144, file: 'icon-144.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
  { size: 180, file: 'apple-touch-icon.png' }, // iOS Safari lo exige aparte
]

for (const { size, file } of targets) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(iconsDir, file))
  console.log(`  ✓ ${file} (${size}x${size})`)
}

// apple-touch-icon también en la raíz (iOS lo busca ahí por convención)
await writeFile(
  join(root, 'public', 'apple-touch-icon.png'),
  await readFile(join(iconsDir, 'apple-touch-icon.png'))
)
console.log('  ✓ public/apple-touch-icon.png')
console.log('Íconos generados.')
