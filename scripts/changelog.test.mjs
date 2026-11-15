import test from 'node:test'
import assert from 'node:assert/strict'
import { notesForVersion, parseChangelog, prepareChangelog, sectionNotes } from './changelog.cjs'
const source =
  '# Changes\n\n## [Unreleased]\n\n### Added\n\n- New staff messaging.\n\n## [5.0.0-alpha.2] - 2026-11-14\n\n- Older release.\n'
test('preparing notes records the chosen version, preserves older history and leaves a draft for next time', () => {
  const prepared = prepareChangelog(source, '5.0.0-alpha.4')
  assert.equal(prepared.changed, true)
  assert.equal(
    notesForVersion(prepared.source, '5.0.0-alpha.4'),
    '### Added\n\n- New staff messaging.',
  )
  assert.equal(notesForVersion(prepared.source, '5.0.0-alpha.2'), '- Older release.')
  assert.equal(sectionNotes(parseChangelog(prepared.source), 'Unreleased'), '')
  const edited = prepared.source.replace(
    '<!-- Add changes for the next version here. -->',
    '- A later draft.',
  )
  const retry = prepareChangelog(edited, '5.0.0-alpha.4')
  assert.equal(retry.changed, false)
  assert.equal(retry.source, edited)
  assert.ok(!retry.notes.includes('later draft'))
})
test('empty drafts, duplicate versions, oversized notes and ambiguous headings cannot release silently', () => {
  for (const text of [
    '## Unreleased\n\n<!-- Placeholder -->',
    '## Unreleased\n\n### Added',
    '## Unreleased\n\n' + 'x'.repeat(50001),
    source + '\n## Unreleased\n- Duplicate.',
    '## Added\n- Wrong heading.',
    '## Unreleased\n\n```text\nUnclosed block',
  ])
    assert.throws(() => prepareChangelog(text, '5.0.0-alpha.4'))
})
test('code-fenced headings remain part of their notes and CRLF normalizes across platform builds', () => {
  const s = '## Unreleased\r\n\r\nExample:\r\n\r\n```text\r\n## Not a release heading\r\n```\r\n'
  const notes = notesForVersion(s, '5.0.0-alpha.4')
  assert.ok(notes.includes('## Not a release heading'))
  assert.ok(!notes.includes('\r'))
  assert.equal(prepareChangelog(s, '5.0.0-alpha.4').notes, notes)
})
