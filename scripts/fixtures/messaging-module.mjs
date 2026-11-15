// Synthetic Electron-only adapter. Replaces the production data chunk in intercepted tests.
const endpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/staffMessaging'
const outbox = new Map()
export function createMessaging(reader) {
  const call = async (data) => {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-only' },
      body: JSON.stringify({ data: { business: reader.club, ...data } }),
    })
    const p = await r.json()
    if (!r.ok || p.error) throw new Error(p.error?.message || 'Unconfirmed')
    return p.result
  }
  const state = () => window.__messagingFixture ?? { chats: [], messages: {} }
  const sub = (get, receive) => {
    const emit = () => receive({ rows: get(), status: 'live', more: get().length === 50 })
    window.addEventListener('messaging-fixture', emit)
    queueMicrotask(emit)
    return () => window.removeEventListener('messaging-fixture', emit)
  }
  let chatOffset = 50
  return {
    async directory() {
      const all = []
      let cursor = null
      do {
        const p = await call({ action: 'directory', cursor })
        all.push(...p.staff)
        cursor = p.nextCursor
      } while (cursor)
      return all.sort((a, b) => a.name.localeCompare(b.name))
    },
    start: (recipients) => call({ action: 'start', recipients }),
    pending: (id) => outbox.get(id),
    async send(chatId, text) {
      const p = outbox.get(chatId) ?? { requestId: crypto.randomUUID(), text: text.trim() }
      outbox.set(chatId, p)
      const result = await call({ action: 'send', chatId, ...p })
      outbox.delete(chatId)
      return result
    },
    read: (chatId, messageId) => call({ action: 'read', chatId, messageId }),
    search: (chatId, query, before) => call({ action: 'search', chatId, query, before }),
    subscribeChats: (receive) => sub(() => state().chats.slice(0, 50), receive),
    subscribeChat: (id, receive) => sub(() => state().chats.filter((c) => c.id === id), receive),
    subscribeMessages: (id, receive) => sub(() => (state().messages[id] ?? []).slice(-50), receive),
    async olderMessages(id, before) {
      const rows = (state().messages[id] ?? []).filter((m) => m.sequence < before)
      return { rows: rows.slice(-50), more: rows.length >= 50 }
    },
    async olderChats() {
      const rows = state().chats.slice(chatOffset, chatOffset + 50)
      chatOffset += 50
      return { rows, more: rows.length === 50 }
    },
  }
}
