// A repository-only credential is entered locally, never passed as an argument or logged.
import { readFile, stat, open } from 'node:fs/promises'
import { isAbsolute, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createGithubIssues } from '../functions/github-issues.mjs'
import { releaseToken } from './firebase-release-auth.mjs'
const project = 'cerms-7af24',
  secret = 'CERMS5_GITHUB_ISSUES_TOKEN'
const principal = 'serviceAccount:cerms5-support@cerms-7af24.iam.gserviceaccount.com'
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(
    'Usage: node scripts/setup-github-issues.mjs [--token-file=/absolute/private/file] [--deploy]\nWithout a file, enter the token at the hidden terminal prompt.\nUse a fine-grained token for only matthewstriks/CERMS, Issues: Read and write.\n--deploy updates only the two support functions and verifies legacy compatibility.',
  )
  process.exit(0)
}
if (
  args.some((a) => a !== '--deploy' && !a.startsWith('--token-file=')) ||
  args.filter((a) => a.startsWith('--token-file=')).length > 1
)
  throw Error('Unknown or repeated setup option. Use --help.')
async function hiddenToken() {
  if (!process.stdin.isTTY)
    throw Error('Run in an interactive terminal, or use --token-file with a private file.')
  process.stdout.write('GitHub fine-grained token (hidden): ')
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      error ? reject(error) : resolve(value.trim())
    }
    const onData = (chunk) => {
      for (const c of chunk.toString()) {
        if (c === '\u0003') {
          finish(Error('Setup canceled.'))
          return
        }
        if (c === '\r' || c === '\n') {
          finish()
          return
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else if (/[A-Za-z0-9_]/.test(c)) value += c
        else {
          finish(Error('Token contains an unexpected character.'))
          return
        }
        if (value.length > 1000) {
          finish(Error('Token is too long.'))
          return
        }
      }
    }
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}
function checkCompatibility(mode) {
  const result = spawnSync(process.execPath, ['scripts/github-issues-deployment.mjs', mode], {
    stdio: 'inherit',
  })
  if (result.status !== 0)
    throw Error(`Compatibility ${mode} check failed. No further action performed.`)
}
try {
  const fileArg = args.find((a) => a.startsWith('--token-file='))
  let token
  if (fileArg) {
    const path = fileArg.slice('--token-file='.length)
    if (!isAbsolute(path)) throw Error('Token file path must be absolute.')
    const info = await stat(path)
    if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0))
      throw Error('Use a regular private token file (chmod 600).')
    if (info.size > 1000) throw Error('Token file is too large.')
    token = (await readFile(path, 'utf8')).trim()
  } else token = await hiddenToken()
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(token))
    throw Error('Use a fine-grained GitHub personal access token.')
  await createGithubIssues(token).ready() // Read-only repository verification; never creates a test issue.
  if (args.includes('--deploy')) checkCompatibility('before')
  const authorization = `Bearer ${await releaseToken()}`
  const root = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets`
  async function api(url, method = 'GET', body, allowMissing = false) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (allowMissing && response.status === 404) return null
    if (!response.ok) throw Error(`Secret Manager setup failed (${response.status}).`)
    return response.json()
  }
  if (!(await api(`${root}/${secret}`, 'GET', undefined, true)))
    await api(`${root}?secretId=${secret}`, 'POST', { replication: { automatic: {} } })
  const version = await api(`${root}/${secret}:addVersion`, 'POST', {
    payload: { data: Buffer.from(token).toString('base64') },
  })
  token = undefined
  const policy = await api(`${root}/${secret}:getIamPolicy`)
  let binding = policy.bindings?.find(
    (b) => b.role === 'roles/secretmanager.secretAccessor' && !b.condition,
  )
  if (!binding) {
    binding = { role: 'roles/secretmanager.secretAccessor', members: [] }
    ;(policy.bindings ??= []).push(binding)
  }
  if (!binding.members.includes(principal)) {
    binding.members.push(principal)
    await api(`${root}/${secret}:setIamPolicy`, 'POST', { policy })
  }
  console.log(`Credential saved securely as ${version.name}.`)
  if (args.includes('--deploy')) {
    const logPath = `/private/tmp/cerms-github-issues-deploy-${Date.now()}.log`
    const log = await open(logPath, 'wx', 0o600)
    console.log(
      'Deploying only submitBugReport and submitLoginSupport; this may take a few minutes.',
    )
    const result = spawnSync(
      'npx',
      [
        '-y',
        'firebase-tools@latest',
        'deploy',
        '--project',
        project,
        '--config',
        'firebase.github-issues.json',
        '--only',
        'functions:cerms-staff:submitBugReport,functions:cerms-staff:submitLoginSupport',
        '--non-interactive',
      ],
      { stdio: ['ignore', log.fd, log.fd], shell: process.platform === 'win32' },
    )
    await log.close()
    if (result.status !== 0)
      throw Error(
        `Scoped deployment did not finish. Inspect ${logPath}; do not run a full deployment.`,
      )
    checkCompatibility('after')
    console.log(
      'GitHub issue reporting is active. No test issues, emails or desktop release were created.',
    )
  } else
    console.log(
      'Credential configured. Run this command again with --deploy to activate the integration.',
    )
} catch (error) {
  // Never dump objects, HTTP bodies or credentials.
  console.error(error.message)
  process.exitCode = 1
}
