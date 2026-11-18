// Rebuild committed installer artwork only. Does not build/package the desktop.
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const sharp = require('sharp')
const root = new URL('../', import.meta.url)
async function render(name, scale = 1) {
  const path = new URL(`resources/installer/${name}.svg`, root)
  const logo = await readFile(new URL('../branding/cerms-logo.png', path))
  const svg = (await readFile(path, 'utf8')).replace(
    '../branding/cerms-logo.png',
    `data:image/png;base64,${logo.toString('base64')}`,
  )
  return sharp(Buffer.from(svg), { density: 72 * scale })
}
function bmp({ data, info }) {
  const stride = Math.ceil((info.width * 3) / 4) * 4
  const output = Buffer.alloc(54 + stride * info.height)
  output.write('BM')
  output.writeUInt32LE(output.length, 2)
  output.writeUInt32LE(54, 10)
  output.writeUInt32LE(40, 14)
  output.writeInt32LE(info.width, 18)
  output.writeInt32LE(info.height, 22)
  output.writeUInt16LE(1, 26)
  output.writeUInt16LE(24, 28)
  output.writeUInt32LE(stride * info.height, 34)
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const input = (y * info.width + x) * 3,
        at = 54 + (info.height - 1 - y) * stride + x * 3
      output[at] = data[input + 2]
      output[at + 1] = data[input + 1]
      output[at + 2] = data[input]
    }
  return output
}
for (const name of ['windows-sidebar', 'windows-header']) {
  const image = await render(name)
  await image
    .clone()
    .png()
    .toFile(new URL(`resources/installer/${name}.png`, root).pathname)
  const pixels = await image
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  await writeFile(new URL(`resources/installer/${name}.bmp`, root), bmp(pixels))
}
// Finder measures layout in points; TIFF carries the explicit 144-dpi Retina resolution.
const mac = await render('mac-background', 2)
await mac.clone().png().toFile(new URL('resources/installer/mac-background@2x.png', root).pathname)
await mac
  .withMetadata({ density: 144 })
  .tiff({ compression: 'lzw' })
  .toFile(new URL('resources/installer/mac-background.tiff', root).pathname)
console.log(
  'Installer artwork regenerated: Windows 24-bit BMPs and Mac Retina TIFF. No desktop packaging.',
)
