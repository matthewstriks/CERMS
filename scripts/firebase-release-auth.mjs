// Publisher credentials stay on the developer machine, never in the desktop bundle.
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export async function releaseToken() {
  const path = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'configstore/firebase-tools.json',
  )
  let config = JSON.parse(await readFile(path, 'utf8'))
  if (!config.tokens?.access_token || (config.tokens.expires_at ?? 0) < Date.now() + 300_000) {
    try {
      // A read-only CLI command refreshes its own saved login when necessary.
      execFileSync(
        process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
        ['projects:list', '--json'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        },
      )
    } catch {
      throw new Error('Firebase publisher login expired. Run firebase login --reauth, then retry.')
    }
    config = JSON.parse(await readFile(path, 'utf8'))
  }
  if (!config.tokens?.access_token) throw new Error('Run firebase login before publishing.')
  return config.tokens.access_token
}
