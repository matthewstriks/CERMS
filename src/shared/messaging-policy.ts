export const staffMessagingEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/staffMessaging'
export type MessagingRequest = { business: string } & (
  | { action: 'directory'; cursor: string | null }
  | { action: 'start'; recipients: string[] }
  | { action: 'send'; chatId: string; requestId: string; text: string }
  | { action: 'read'; chatId: string; messageId: string }
  | { action: 'search'; chatId: string; query: string; before: number | null }
)
export function isMessagingRequest(body?: string): boolean {
  try {
    if (!body || body.length > 70000) return false
    const p = JSON.parse(body),
      d = p.data
    const exact = (keys: string[]) =>
      Object.keys(d).sort().join() === ['business', 'action', ...keys].sort().join()
    const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
    const uuid = (v: unknown) =>
      typeof v === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)
    const chat = () => typeof d.chatId === 'string' && /^[a-f0-9]{64}$/.test(d.chatId)
    if (Object.keys(p).join() !== 'data' || !d || !id(d.business)) return false
    switch (d.action) {
      case 'directory':
        return exact(['cursor']) && (d.cursor === null || id(d.cursor))
      case 'start':
        return (
          exact(['recipients']) &&
          Array.isArray(d.recipients) &&
          d.recipients.length >= 1 &&
          d.recipients.length <= 9 &&
          d.recipients.every(id) &&
          new Set(d.recipients).size === d.recipients.length
        )
      case 'send':
        return (
          exact(['chatId', 'requestId', 'text']) &&
          chat() &&
          uuid(d.requestId) &&
          typeof d.text === 'string' &&
          !!d.text.trim() &&
          d.text.length <= 10000
        )
      case 'read':
        return exact(['chatId', 'messageId']) && chat() && uuid(d.messageId)
      case 'search':
        return (
          exact(['chatId', 'query', 'before']) &&
          chat() &&
          typeof d.query === 'string' &&
          !!d.query.trim() &&
          d.query.length <= 200 &&
          (d.before === null || (Number.isSafeInteger(d.before) && d.before > 0))
        )
      default:
        return false
    }
  } catch {
    return false
  }
}
