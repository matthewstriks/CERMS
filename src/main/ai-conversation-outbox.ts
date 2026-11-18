import { randomUUID } from 'node:crypto'
import { redactSupportSecrets, supportModel } from '../shared/ai-support'
import type { SupportTurn, AssistantUser } from '../shared/ai-support'
import {
  validAiConversation,
  type AiConversationEmail,
  type AiConversationReason,
} from '../shared/ai-conversation-policy'
interface Entry {
  data: AiConversationEmail
  attempts: number
  nextAttemptAt: number
  review: boolean
}
interface Stored {
  schemaVersion: 1
  draft: AiConversationEmail | null
  pending: Entry[]
}
export function createAiConversationOutbox(options: {
  version: string
  platform: string
  device: string
  read(): string | null
  write(value: string): void
  post(data: AiConversationEmail): Promise<'sent' | 'review'>
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const raw = options.read()
  let state: Stored =
    raw === null ? { schemaVersion: 1, draft: null, pending: [] } : JSON.parse(raw)
  if (
    state.schemaVersion !== 1 ||
    !(state.draft === null || validAiConversation(state.draft)) ||
    !Array.isArray(state.pending) ||
    !state.pending.every(
      (e) =>
        validAiConversation(e.data) &&
        Number.isSafeInteger(e.attempts) &&
        e.attempts >= 0 &&
        Number.isFinite(e.nextAttemptAt) &&
        typeof e.review === 'boolean',
    )
  )
    throw Error('Saved AI conversation emails need review. The file was preserved.')
  let savedSignature = '',
    inFlight: Promise<void> | undefined
  const save = () => options.write(JSON.stringify(state))
  function finish(reason: AiConversationReason) {
    if (!state.draft) return false
    const data = {
      ...state.draft,
      reason,
      finishedAt: Math.max(now(), state.draft.startedAt, state.draft.finishedAt),
    }
    const next: Stored = {
      ...state,
      draft: null,
      pending: [...state.pending, { data, attempts: 0, nextAttemptAt: 0, review: false }],
    }
    // Persist before clearing the in-memory draft; a failed disk write cannot discard it.
    options.write(JSON.stringify(next))
    state = next
    savedSignature = ''
    return true
  }
  if (state.draft) finish('recovered')
  function capture(turns: SupportTurn[], user?: AssistantUser | null) {
    if (!turns.length) return
    const signature = JSON.stringify(turns)
    if (signature === savedSignature) return
    const normalized = turns.map((t) => ({
      role: t.role,
      text: redactSupportSecrets(t.text),
      ...(t.sources ? { sources: t.sources.map((s) => ({ id: s.id, title: s.title })) } : {}),
    }))
    const timestamp = now()
    const draft: AiConversationEmail = state.draft
      ? {
          ...state.draft,
          turns: normalized,
          finishedAt: Math.max(timestamp, state.draft.startedAt),
        }
      : {
          id: randomUUID(),
          version: options.version,
          model: supportModel,
          platform: options.platform,
          device: options.device,
          startedAt: timestamp,
          finishedAt: timestamp,
          reason: 'recovered',
          ...(user !== undefined ? { user: user === null ? null : { ...user } } : {}),
          turns: normalized,
        }
    if (!validAiConversation(draft))
      throw Error('AI conversation cannot be queued in its current format.')
    const next = { ...state, draft }
    options.write(JSON.stringify(next))
    state = next
    savedSignature = signature
  }
  function flush(): Promise<void> {
    if (inFlight) return inFlight
    inFlight = (async () => {
      // Drain conversations added during delivery too, especially while app quit is waiting.
      // Each item is attempted at most once per flush, even if the clock changes.
      const attempted = new Set<string>()
      while (true) {
        const entry = state.pending.find(
          (e) => !e.review && e.nextAttemptAt <= now() && !attempted.has(e.data.id),
        )
        if (!entry) break
        attempted.add(entry.data.id)
        try {
          const result = await options.post(entry.data)
          if (result === 'sent')
            state.pending = state.pending.filter((e) => e.data.id !== entry.data.id)
          else entry.review = true
        } catch {
          entry.attempts++
          entry.nextAttemptAt =
            now() + Math.min(30 * 60000, 30000 * 2 ** Math.min(entry.attempts, 6))
        }
        save()
      }
    })().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }
  return {
    capture,
    finish,
    flush,
    pending: () => state.pending.filter((e) => !e.review).length,
    needsReview: () => state.pending.some((e) => e.review),
    hasDraft: () => !!state.draft,
  }
}
