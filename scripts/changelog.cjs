const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const versionPattern = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/
const MAX_NOTES = 50000
function parseChangelog(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n'),
    sections = new Map()
  let current, fence
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined
      continue
    }
    if (fence || !/^##\s/.test(line)) continue
    const match = /^##\s+(?:\[([^\]]+)\]|(\S+))(?:\s+-\s+\d{4}-\d{2}-\d{2})?\s*$/.exec(line)
    const title = match?.[1] ?? match?.[2],
      key = title?.toLowerCase() === 'unreleased' ? 'Unreleased' : title
    assert.ok(
      key && (key === 'Unreleased' || versionPattern.test(key)),
      'Use ## Unreleased or ## <version>; use ### for change groups.',
    )
    assert.ok(!sections.has(key), `Duplicate changelog section: ${key}`)
    if (current) current.end = i
    current = { version: key, start: i, end: lines.length }
    sections.set(key, current)
  }
  assert.ok(!fence, 'Close changelog code blocks before preparing a release.')
  return { lines, sections }
}
function sectionNotes(parsed, version) {
  const section = parsed.sections.get(version)
  if (!section) return undefined
  return parsed.lines
    .slice(section.start + 1, section.end)
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}
function validateNotes(notes) {
  assert.ok(
    typeof notes === 'string' && notes.trim() && notes.trim().length <= MAX_NOTES,
    'Add release notes to CHANGELOG.md (maximum 50,000 characters).',
  )
  assert.ok(
    notes.split('\n').some((line) => line.trim() && !/^#{1,6}\s/.test(line.trim())),
    'Release notes must describe at least one change.',
  )
  return notes.trim()
}
function notesForVersion(source, version) {
  assert.match(version, versionPattern, 'Use a semantic release version.')
  const parsed = parseChangelog(source)
  return validateNotes(sectionNotes(parsed, version) ?? sectionNotes(parsed, 'Unreleased'))
}
function prepareChangelog(source, version) {
  assert.match(version, versionPattern, 'Use a semantic release version.')
  const parsed = parseChangelog(source)
  if (parsed.sections.has(version))
    return { source, notes: validateNotes(sectionNotes(parsed, version)), changed: false }
  const section = parsed.sections.get('Unreleased')
  const notes = validateNotes(sectionNotes(parsed, 'Unreleased'))
  assert.ok(section, 'Add ## Unreleased before preparing a new release.')
  const lines = [
    ...parsed.lines.slice(0, section.start),
    '## Unreleased',
    '',
    '<!-- Add changes for the next version here. -->',
    '',
    `## ${version}`,
    '',
    notes,
    '',
    ...parsed.lines.slice(section.end),
  ]
  return { source: lines.join('\n').replace(/\n+$/, '\n'), notes, changed: true }
}
function loadReleaseNotes(version) {
  return notesForVersion(fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8'), version)
}
module.exports = {
  parseChangelog,
  sectionNotes,
  validateNotes,
  notesForVersion,
  prepareChangelog,
  loadReleaseNotes,
  MAX_NOTES,
}
