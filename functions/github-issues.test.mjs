import test from 'node:test'
import assert from 'node:assert/strict'
import { createGithubIssues, githubIssueContent, githubRepository } from './github-issues.mjs'
const repo = {
  id: githubRepository.id,
  full_name: 'matthewstriks/CERMS',
  has_issues: true,
  archived: false,
}
const issue = {
  number: 42,
  html_url: 'https://github.com/matthewstriks/CERMS/issues/42',
  url: 'https://api.github.com/repos/matthewstriks/CERMS/issues/42',
}
const metadata = {
  subject: 'Problem',
  message: 'Details',
  priority: 'normal',
  version: '5',
  platform: 'win32',
  electron: '44',
  email: 'private@example.test',
  uid: 'private-uid',
  business: 'private-business',
  logs: ['private diagnostic'],
}
const response = (data, status = 200, more = false) =>
  new Response(JSON.stringify(data), {
    status,
    headers: more ? { link: '<next>; rel="next"' } : {},
  })
test('fixed repository issue contains public report and excludes private evidence and credentials', async () => {
  const calls = []
  const client = createGithubIssues('synthetic', {
    request: async (url, options) => {
      calls.push({ url, options })
      return response(calls.length === 1 ? repo : issue)
    },
  })
  assert.deepEqual(await client.create(metadata, 'marker', 2), { number: 42, url: issue.html_url })
  assert.equal(calls[1].url, 'https://api.github.com/repos/matthewstriks/CERMS/issues')
  const content = JSON.parse(calls[1].options.body)
  assert.match(content.body, /Details/)
  assert.match(content.body, /2 attachment/)
  for (const privateValue of [metadata.email, metadata.uid, metadata.business, metadata.logs[0]])
    assert.ok(!content.body.includes(privateValue))
  const sanitized = githubIssueContent(
    {
      ...metadata,
      message:
        'x@example.test @someone Bearer SECRET github_pat_SECRET https://storage.googleapis.com/private?X-Goog-Signature=secret',
    },
    'marker',
    0,
  ).body
  for (const secret of [
    'x@example.test',
    '@someone',
    'Bearer SECRET',
    'github_pat_SECRET',
    'https://storage.googleapis.com',
  ])
    assert.ok(!sanitized.includes(secret))
})
test('repository mismatch prevents POST; explicit rejection permits safe retry, lost response is uncertain', async () => {
  let calls = 0
  await assert.rejects(
    createGithubIssues('synthetic', {
      request: async () => {
        calls++
        return response({ ...repo, id: 1 })
      },
    }).create(metadata, 'marker', 0),
    { definitive: true },
  )
  assert.equal(calls, 1)
  for (const [status, definitive] of [
    [403, true],
    [422, true],
    [500, false],
  ]) {
    calls = 0
    await assert.rejects(
      createGithubIssues('synthetic', {
        request: async () => response(++calls === 1 ? repo : {}, calls === 1 ? 200 : status),
      }).create(metadata, 'marker', 0),
      { definitive },
    )
  }
})
test('recovery scans all issue states, paginates, ignores PRs and returns only the original issue', async () => {
  const urls = []
  const client = createGithubIssues('synthetic', {
    request: async (url) => {
      urls.push(url)
      return urls.length === 1
        ? response(
            [{ ...issue, pull_request: {}, body: '<!-- cerms-report:marker -->' }],
            200,
            true,
          )
        : response([{ ...issue, body: '<!-- cerms-report:marker -->' }])
    },
  })
  assert.deepEqual(await client.find('marker', Date.now()), { number: 42, url: issue.html_url })
  assert.match(urls[0], /state=all/)
  assert.match(urls[1], /page=2/)
})
