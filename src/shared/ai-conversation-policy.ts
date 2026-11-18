import { supportModel, validAssistantUser, type AssistantUser } from './ai-support'
export const aiConversationEndpoint =
  'https://us-central1-cerms-7af24.cloudfunctions.net/emailAiSupportConversation'
export const aiConversationReasons = [
  'end-button',
  'new-conversation',
  'window-closed',
  'application-quit',
  'recovered',
  'session-changed',
  'model-removed',
] as const
export type AiConversationReason = (typeof aiConversationReasons)[number]
export interface AiConversationEmail {
  id: string
  version: string
  model: typeof supportModel
  platform: string
  device: string
  startedAt: number
  finishedAt: number
  reason: AiConversationReason
  user?: AssistantUser | null
  turns: { role: 'user' | 'assistant'; text: string; sources?: { id: string; title: string }[] }[]
}
const exact = (v: unknown, keys: string[]) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === keys.sort().join()
export function validAiConversation(d: unknown): d is AiConversationEmail {
  if (
    !exact(d, [
      'id',
      'version',
      'model',
      'platform',
      'device',
      'startedAt',
      'finishedAt',
      'reason',
      'turns',
      ...(d && typeof d === 'object' && Object.hasOwn(d, 'user') ? ['user'] : []),
    ])
  )
    return false
  const p = d as AiConversationEmail
  return (
    typeof p.id === 'string' &&
    /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.id) &&
    typeof p.version === 'string' &&
    /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(p.version) &&
    p.version.length <= 80 &&
    p.model === supportModel &&
    (p.user === undefined || p.user === null || validAssistantUser(p.user)) &&
    ['darwin', 'win32', 'linux'].includes(p.platform) &&
    typeof p.device === 'string' &&
    p.device.length > 0 &&
    p.device.length <= 255 &&
    !/[\x00-\x1f\x7f]/.test(p.device) &&
    Number.isSafeInteger(p.startedAt) &&
    Number.isSafeInteger(p.finishedAt) &&
    p.startedAt >= 1577836800000 &&
    p.finishedAt >= p.startedAt &&
    p.finishedAt < 4102444800000 &&
    aiConversationReasons.includes(p.reason) &&
    Array.isArray(p.turns) &&
    p.turns.length > 0 &&
    p.turns.length <= 20 &&
    p.turns[0]?.role === 'user' &&
    p.turns.every(
      (t) =>
        (exact(t, ['role', 'text']) || exact(t, ['role', 'text', 'sources'])) &&
        ['user', 'assistant'].includes(t.role) &&
        typeof t.text === 'string' &&
        t.text.trim().length > 0 &&
        t.text.length <= (t.role === 'user' ? 2000 : 8000) &&
        (t.sources === undefined ||
          (t.role === 'assistant' &&
            Array.isArray(t.sources) &&
            t.sources.length <= 3 &&
            t.sources.every(
              (s) =>
                exact(s, ['id', 'title']) &&
                typeof s.id === 'string' &&
                /^[a-z-]{1,60}$/.test(s.id) &&
                typeof s.title === 'string' &&
                s.title.length > 0 &&
                s.title.length <= 200,
            ))),
    )
  )
}
export function isAiConversationRequest(body?: string): boolean {
  try {
    if (!body || body.length > 250000) return false
    const p = JSON.parse(body)
    return exact(p, ['data']) && validAiConversation(p.data)
  } catch {
    return false
  }
}
