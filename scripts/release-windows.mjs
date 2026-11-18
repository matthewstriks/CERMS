// Explicit Windows-only retry/escape hatch; release:alpha uses both platforms.
import { runRelease } from './release-desktop.mjs'
await runRelease({ platforms: ['windows'], nextAlpha: process.argv.includes('--next-alpha') })
