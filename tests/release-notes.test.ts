import { it, expect } from 'vitest'
import { releaseNotesText, releaseNotesBlocks } from '../src/shared/release-notes'
it('accepts only bounded text for the advertised version, including updater note arrays', () => {
  expect(
    releaseNotesText(
      [
        { version: '5.0.0-alpha.1', note: 'Old' },
        { version: '5.0.0-alpha.2', note: 'New' },
      ],
      '5.0.0-alpha.2',
    ),
  ).toBe('New')
  expect(
    releaseNotesText([{ version: '5.0.0-alpha.1', note: 'Old' }], '5.0.0-alpha.2'),
  ).toBeUndefined()
  for (const value of [null, {}, [{}], ' ', 'x'.repeat(50001)])
    expect(releaseNotesText(value, '5.0.0-alpha.2')).toBeUndefined()
})
it('renders release text as inert heading/list/paragraph/code content, preserving multiline bullets', () => {
  const blocks = releaseNotesBlocks(
    '### Added\n- Staff chat\n  and read receipts\n\n1. Open Messages\n2. Pick staff\n\n<img src="https://example.com/x" onerror="evil()">\n\n```\n<script>evil()</script>\n```',
  )
  expect(blocks).toEqual([
    { type: 'heading', text: 'Added' },
    { type: 'list', items: ['Staff chat and read receipts'] },
    { type: 'ordered', items: ['Open Messages', 'Pick staff'] },
    { type: 'paragraph', text: '<img src="https://example.com/x" onerror="evil()">' },
    { type: 'code', text: '<script>evil()</script>' },
  ])
})
