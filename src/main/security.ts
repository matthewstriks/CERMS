import { resolve, relative, isAbsolute } from 'node:path'

export function rendererAsset(root: string, requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== 'cerms:' || url.host !== 'app') return null
    const pathname = decodeURIComponent(url.pathname)
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    const rel = relative(root, file)
    return rel.startsWith('..') || isAbsolute(rel) ? null : file
  } catch {
    return null
  }
}

export function isTrustedRenderer(url: string, devUrl?: string): boolean {
  try {
    const parsed = new URL(url)
    if (devUrl) return parsed.origin === new URL(devUrl).origin
    return parsed.protocol === 'cerms:' && parsed.host === 'app'
  } catch {
    return false
  }
}
