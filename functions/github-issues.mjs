// Runtime access is a repository-scoped Secret Manager credential, never a desktop token.
export const githubRepository = Object.freeze({
  owner: 'matthewstriks',
  name: 'CERMS',
  id: 715211699,
})
const base = `https://api.github.com/repos/${githubRepository.owner}/${githubRepository.name}`
const issueBase = `https://github.com/${githubRepository.owner}/${githubRepository.name}/issues/`
export class GithubIssueError extends Error {
  constructor(message, definitive = false) {
    super(message)
    this.definitive = definitive
  }
}
export function validGithubIssue(issue) {
  return (
    !!issue &&
    Number.isSafeInteger(issue.number) &&
    issue.number > 0 &&
    (issue.html_url ?? issue.url) === issueBase + issue.number
  )
}
export function publicReportText(value) {
  return String(value)
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)\b/g, '[redacted token]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted token]')
    .replace(/((?:password|access_token|refresh_token|idToken)\s*[=:]\s*)\S+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s<>]+/gi, (url) =>
      /storage\.googleapis\.com|firebasestorage\.googleapis\.com|[?&](?:token|key|signature|x-goog-signature)=/i.test(
        url,
      )
        ? '[private link omitted]'
        : url,
    )
    .replace(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/g, '[email omitted]')
    .replace(/@/g, '@\u200b')
}
function block(value) {
  const text = publicReportText(value)
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) || []).map((s) => s.length + 1)))
  return `${fence}text\n${text}\n${fence}`
}
export function githubIssueContent(metadata, marker, attachmentCount) {
  return {
    title: `[CERMS 5 · ${metadata.priority}] ${publicReportText(metadata.subject)}`.slice(0, 240),
    body: [
      `<!-- cerms-report:${marker} -->`,
      '## Report',
      block(metadata.message),
      '## Environment',
      block(
        `Version: ${metadata.version}\nPlatform: ${metadata.platform}\nElectron: ${metadata.electron}\nPriority: ${metadata.priority}\nSource: ${metadata.origin === 'login' ? 'Login support (not signed in)' : 'Signed-in staff report'}`,
      ),
      '## Private evidence',
      `${attachmentCount} attachment(s). Reporter contact details, diagnostics and private download links are retained in the support email; they are not published here.`,
    ].join('\n\n'),
  }
}
export function createGithubIssues(token, { request = fetch } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CERMS5-Support',
  }
  async function call(path, options = {}) {
    try {
      const response = await request(base + path, {
        ...options,
        headers: { ...headers, ...options.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok)
        throw new GithubIssueError(
          `GitHub issue request was not confirmed (${response.status}).`,
          response.status >= 400 && response.status < 500 && response.status !== 408,
        )
      return {
        data: await response.json(),
        more: !!response.headers.get('link')?.includes('rel="next"'),
      }
    } catch (error) {
      if (error instanceof GithubIssueError) throw error
      throw new GithubIssueError('GitHub issue request was not confirmed.')
    }
  }
  async function ready() {
    try {
      const { data } = await call('')
      if (
        data.id !== githubRepository.id ||
        data.full_name !== `${githubRepository.owner}/${githubRepository.name}` ||
        !data.has_issues ||
        data.archived
      )
        throw new GithubIssueError('The configured CERMS issue repository is unavailable.', true)
      return data
    } catch (error) {
      throw new GithubIssueError(error.message, true)
    } // No create request has been attempted.
  }
  return {
    ready,
    async create(metadata, marker, attachmentCount) {
      await ready()
      const { data } = await call('/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(githubIssueContent(metadata, marker, attachmentCount)),
      })
      if (!validGithubIssue(data))
        throw new GithubIssueError('GitHub issue confirmation was incomplete.')
      return { number: data.number, url: data.html_url }
    },
    async find(marker, startedAt) {
      const since = encodeURIComponent(new Date(startedAt - 300000).toISOString())
      for (let page = 1; page <= 10; page++) {
        const { data, more } = await call(
          `/issues?state=all&sort=created&direction=desc&per_page=100&since=${since}&page=${page}`,
        )
        if (!Array.isArray(data)) throw new GithubIssueError('GitHub issue lookup was incomplete.')
        const found = data.find(
          (issue) => !issue.pull_request && issue.body?.includes(`<!-- cerms-report:${marker} -->`),
        )
        if (found) {
          if (!validGithubIssue(found))
            throw new GithubIssueError('GitHub issue lookup was incomplete.')
          return { number: found.number, url: found.html_url }
        }
        if (!more) return null
      }
      throw new GithubIssueError('GitHub issue lookup needs review before another create attempt.')
    },
  }
}
