// Genera los íconos de la PWA a partir del logo de marca (public/logo-mark.svg),
// compuesto sobre un fondo blanco (decisión de Héctor). Vectorial → escala perfecto.
// Uso: node scripts/generate-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'public', 'icons')
const markSvg = await readFile(join(root, 'public', 'logo-mark.svg'))

// El logo ocupa ~62% del ícono, centrado → deja "safe zone" para el recorte maskable.
const MARK_RATIO = 0.62

// Tamaños del manifest + apple-touch (iOS). Fondo blanco para todos.
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
  const markSize = Math.round(size * MARK_RATIO)
  // Renderiza el logo a alta densidad y lo encaja en su recuadro (sin fondo).
  const mark = await sharp(markSvg, { density: 512 })
    .resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(join(iconsDir, file))
  console.log(`  ✓ ${file} (${size}x${size})`)
}

// apple-touch-icon también en la raíz (iOS lo busca ahí por convención).
await writeFile(
  join(root, 'public', 'apple-touch-icon.png'),
  await readFile(join(iconsDir, 'apple-touch-icon.png'))
)
console.log('  ✓ public/apple-touch-icon.png')

// Badge de notificaciones Android: silueta blanca sobre TRANSPARENTE (sin fondo blanco).
const badgeSvg = await readFile(join(iconsDir, 'badge.svg'))
for (const size of [72, 96]) {
  await sharp(badgeSvg, { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(iconsDir, `badge-${size}.png`))
  console.log(`  ✓ badge-${size}.png (${size}x${size}, transparente)`)
}
console.log('Íconos generados desde el logo de marca.')
