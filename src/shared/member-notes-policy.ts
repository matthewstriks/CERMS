export const memberNotesEndpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/memberNotes'
export function isMemberNotesRequest(body?: string) {
  try {
    if (!body || body.length > 70000) return false
    const p = JSON.parse(body),
      d = p.data
    const keys: Record<string, string[]> = {
      list: ['cursor'],
      add: ['requestId', 'text'],
      remove: ['noteId'],
      dna: ['requestId', 'enabled', 'reason', 'expectedDna'],
    }
    const uuid = (s: unknown) => typeof s === 'string' && /^[a-f0-9-]{36}$/.test(s)
    return (
      Object.keys(p).join() === 'data' &&
      d &&
      keys[d.action] &&
      ['business', 'memberId'].every(
        (k) => typeof d[k] === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(d[k]),
      ) &&
      Object.keys(d).sort().join() ===
        ['business', 'memberId', 'action', ...keys[d.action]!].sort().join() &&
      (d.action === 'list'
        ? d.cursor === null || uuid(d.cursor)
        : d.action === 'remove'
          ? uuid(d.noteId) || /^legacy_[a-f0-9]{64}$/.test(d.noteId)
          : uuid(d.requestId) &&
            (d.action === 'add'
              ? typeof d.text === 'string' && !!d.text.trim() && d.text.length <= 10000
              : typeof d.enabled === 'boolean' &&
                typeof d.expectedDna === 'boolean' &&
                typeof d.reason === 'string' &&
                d.reason.length <= 10000 &&
                (!d.enabled || !!d.reason.trim())))
    )
  } catch {
    return false
  }
}
