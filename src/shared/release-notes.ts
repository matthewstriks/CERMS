export const maxReleaseNotesLength = 50000
/** Feed content is text, never executable HTML or a renderer-supplied URL. */
export function releaseNotesText(value: unknown, version: string): string | undefined {
  const candidate = Array.isArray(value)
    ? value.find((v) => v && typeof v === 'object' && v.version === version)?.note
    : value
  return typeof candidate === 'string' &&
    candidate.trim() &&
    candidate.length <= maxReleaseNotesLength
    ? candidate.replace(/\r\n?/g, '\n').trim()
    : undefined
}
export type ReleaseNotesBlock =
  | { type: 'heading' | 'paragraph' | 'code'; text: string }
  | { type: 'list' | 'ordered'; items: string[] }
export function releaseNotesBlocks(notes: string): ReleaseNotesBlock[] {
  const blocks: ReleaseNotesBlock[] = []
  let paragraph: string[] = [],
    list: { type: 'list' | 'ordered'; items: string[] } | undefined
  let fence: string | undefined,
    code: string[] = []
  function flush() {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
      paragraph = []
    }
    if (list) {
      blocks.push(list)
      list = undefined
    }
  }
  for (const line of notes.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        blocks.push({ type: 'code', text: code.join('\n') })
        fence = undefined
        code = []
      } else code.push(line)
      continue
    }
    if (marker) {
      flush()
      fence = marker
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', text: heading[1]! })
      continue
    }
    const bullet = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.*)$/.exec(line)
    if (bullet) {
      const type = /^\s*\d/.test(line) ? 'ordered' : 'list'
      if (paragraph.length || list?.type !== type) flush()
      list ??= { type, items: [] }
      list.items.push(bullet[1]!)
      continue
    }
    if (list && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += ' ' + line.trim()
      continue
    }
    if (list) flush()
    paragraph.push(line)
  }
  if (fence) blocks.push({ type: 'code', text: code.join('\n') })
  flush()
  return blocks
}
