import { expect, it } from 'vitest'
import { createAiConversationOutbox } from '../src/main/ai-conversation-outbox'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'
import { aiConversationEndpoint } from '../src/shared/ai-conversation-policy'
const turns = [
  { role: 'user' as const, text: 'How do I print a receipt?' },
  { role: 'assistant' as const, text: 'Open the receipt and choose Print.' },
]
it('retains the chat-start user across updates and offline recovery without saving credentials', async () => {
  const f = fixture(),
    outbox = createAiConversationOutbox(f.options)
  const user = {
    uid: 'synthetic-user',
    name: 'Synthetic Staff',
    email: 'staff@example.test',
    business: 'synthetic-business',
  }
  outbox.capture(turns.slice(0, 1), user)
  outbox.capture(turns, { ...user, name: 'Later profile name' })
  const reopened = createAiConversationOutbox(f.options)
  reopened.capture([{ role: 'user', text: 'Signed-out question' }], null)
  reopened.finish('window-closed')
  await reopened.flush()
  expect(f.sent[0].user).toEqual(user)
  expect(f.sent[1].user).toBe(null)
  expect(f.saved()).not.toContain('token')
})
function fixture() {
  let saved: string | null = null,
    offline = false,
    time = Date.now()
  const sent: any[] = []
  const options = {
    version: '5.0.0-alpha.10',
    platform: 'darwin',
    device: 'Synthetic Mac',
    read: () => saved,
    write: (v: string) => {
      saved = v
    },
    now: () => time,
    post: async (data: any): Promise<'sent' | 'review'> => {
      if (offline) throw Error('offline')
      sent.push(data)
      return 'sent'
    },
  }
  return {
    options,
    sent,
    setOffline: (v: boolean) => {
      offline = v
    },
    advance: () => {
      time += 3600000
    },
    saved: () => saved,
  }
}
it('journals every turn, seals once and retains the full transcript across offline close/restart', async () => {
  const f = fixture(),
    outbox = createAiConversationOutbox(f.options)
  outbox.capture(turns.slice(0, 1))
  outbox.capture(turns)
  expect(JSON.parse(f.saved()!).draft.turns).toHaveLength(2)
  const id = JSON.parse(f.saved()!).draft.id
  expect(outbox.finish('window-closed')).toBe(true)
  expect(outbox.finish('application-quit')).toBe(false)
  f.setOffline(true)
  await outbox.flush()
  expect(outbox.pending()).toBe(1)
  const reopened = createAiConversationOutbox(f.options)
  f.setOffline(false)
  f.advance()
  await reopened.flush()
  expect(f.sent).toHaveLength(1)
  expect(f.sent[0].id).toBe(id)
  expect(f.sent[0].turns).toEqual(turns)
  expect(f.sent[0].reason).toBe('window-closed')
  expect(JSON.parse(f.saved()!).pending).toEqual([])
  expect(
    allowFirebaseRequest(aiConversationEndpoint, 'POST', JSON.stringify({ data: f.sent[0] })),
  ).toBe(true)
  expect(
    allowFirebaseRequest(
      aiConversationEndpoint + '?other=1',
      'POST',
      JSON.stringify({ data: f.sent[0] }),
    ),
  ).toBe(false)
  expect(
    allowFirebaseRequest(
      aiConversationEndpoint,
      'POST',
      JSON.stringify({ data: { ...f.sent[0], to: 'elsewhere@example.test' } }),
    ),
  ).toBe(false)
})
it('recovers a crash draft and separates new conversations; review status does not resend', async () => {
  const f = fixture(),
    first = createAiConversationOutbox(f.options)
  first.capture(turns)
  const recovered = createAiConversationOutbox(f.options)
  recovered.capture([{ role: 'user', text: 'A new question' }])
  recovered.finish('end-button')
  await recovered.flush()
  expect(f.sent).toHaveLength(2)
  expect(f.sent[0].reason).toBe('recovered')
  expect(f.sent[0].id).not.toBe(f.sent[1].id)
  let attempts = 0
  const review = createAiConversationOutbox({
    ...f.options,
    post: async () => {
      attempts++
      return 'review'
    },
  })
  review.capture(turns)
  review.finish('new-conversation')
  await review.flush()
  await review.flush()
  expect(attempts).toBe(1)
  expect(review.needsReview()).toBe(true)
  expect(JSON.parse(f.saved()!).pending[0].data.turns).toEqual(turns)
})
it('coalesces simultaneous flushes and preserves a draft if sealing cannot be saved', async () => {
  const f = fixture()
  let resolve: () => void = () => {}
  const waiting = new Promise<void>((r) => {
    resolve = r
  })
  let count = 0
  const outbox = createAiConversationOutbox({
    ...f.options,
    post: async () => {
      count++
      await waiting
      return 'sent'
    },
  })
  outbox.capture(turns)
  outbox.finish('application-quit')
  const one = outbox.flush(),
    two = outbox.flush()
  resolve()
  await Promise.all([one, two])
  expect(count).toBe(1)
  let fail = false
  const draft = createAiConversationOutbox({
    ...f.options,
    write: (v) => {
      if (fail) throw Error('disk full')
      f.options.write(v)
    },
  })
  draft.capture(turns)
  fail = true
  expect(() => draft.finish('window-closed')).toThrow('disk full')
  expect(draft.hasDraft()).toBe(true)
})

it('drains a second conversation finished while the first email is still sending', async () => {
  const f = fixture()
  let unblock: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    unblock = resolve
  })
  let sends = 0
  const queue = createAiConversationOutbox({
    ...f.options,
    post: async () => {
      if (++sends === 1) await held
      return 'sent'
    },
  })
  queue.capture(turns)
  queue.finish('window-closed')
  const sending = queue.flush()
  queue.capture([{ role: 'user', text: 'Another conversation' }])
  queue.finish('application-quit')
  unblock()
  await sending
  expect(sends).toBe(2)
  expect(queue.pending()).toBe(0)
})
