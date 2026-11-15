import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, Search, MessageSquare } from 'lucide-react'
import { useMembershipSession } from '../lib/membership-session'
import type { MessagingClient } from '../../../data/firebase-messaging'
import {
  chatTitle,
  chatUnread,
  type MessagingLive,
  type StaffChat,
} from '../../../domain/messaging'
import NewConversation from './messages/NewConversation'
import Conversation from './messages/Conversation'
import './messages/Messages.css'
export default function Messages() {
  const { reader } = useMembershipSession()
  const drafts = useRef<Record<string, string>>({})
  const rememberDraft = useCallback((id: string, text: string) => {
    drafts.current[id] = text
  }, [])
  const updateConversation = useCallback(
    (chat: StaffChat) => setOlder((rows) => [...rows.filter((c) => c.id !== chat.id), chat]),
    [],
  )
  const [client, setClient] = useState<MessagingClient | null>(null)
  useEffect(() => {
    let active = true
    setClient(null)
    if (reader)
      void import('../../../data/firebase-messaging')
        .then((m) => {
          if (active) setClient(m.createMessaging(reader))
        })
        .catch(() => {
          if (active)
            setLive({
              rows: [],
              status: 'error',
              error: 'Messages could not be loaded. Reopen Messages to retry.',
            })
        })
    return () => {
      active = false
    }
  }, [reader])
  const [live, setLive] = useState<MessagingLive<StaffChat>>({ rows: [], status: 'connecting' })
  const [older, setOlder] = useState<StaffChat[]>([]),
    [more, setMore] = useState<boolean | null>(null)
  const [search, setSearch] = useState(''),
    [unreadOnly, setUnreadOnly] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!client) return
    setOlder([])
    setMore(null)
    setSelected(null)
    return client.subscribeChats((state) => {
      setLive(state)
      if (state.status === 'error') {
        setOlder([])
        setSelected(null)
        setCreating(false)
      }
    })
  }, [client, revision])
  const chats = useMemo(() => {
    const rows = new Map(older.map((c) => [c.id, c]))
    live.rows.forEach((c) => rows.set(c.id, c))
    return [...rows.values()].sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id),
    )
  }, [live.rows, older])
  if (!reader || !client)
    return (
      <section className="panel chat-notice" role="status">
        {live.error || 'Loading messages…'}
      </section>
    )
  const needle = search.trim().toLocaleLowerCase()
  const visible = chats.filter(
    (c) =>
      (!unreadOnly || chatUnread(c, reader.uid)) &&
      `${chatTitle(c, reader.uid)} ${c.lastMessage?.text ?? ''}`
        .toLocaleLowerCase()
        .includes(needle),
  )
  async function loadOlder() {
    if (!client || busy) return
    setBusy(true)
    setError('')
    try {
      const page = await client.olderChats()
      setOlder((rows) => [...rows, ...page.rows])
      setMore(page.more)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Older conversations could not be loaded.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="messaging-toolbar">
        <p>Private conversations with staff in your business.</p>
        <button
          className="primary"
          disabled={live.status !== 'live'}
          onClick={() => setCreating(true)}
        >
          <MessageSquarePlus size={16} /> New conversation
        </button>
      </div>
      <div className="messaging-layout">
        <aside className="panel conversation-list" aria-label="Staff conversations">
          <div className="conversation-filters">
            <label className="conversation-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Search conversations"
                placeholder="Search conversations"
                value={search}
                maxLength={200}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className={unreadOnly ? 'selected' : ''}
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              Unread
            </button>
            <span className="chat-connection" role="status">
              {live.status === 'live'
                ? 'Live updates'
                : live.status === 'error'
                  ? 'Unavailable'
                  : 'Connecting…'}
            </span>
          </div>
          {live.error && (
            <div className="chat-notice">
              <p role="alert">{live.error}</p>
              <button onClick={() => setRevision((n) => n + 1)}>Reconnect messages</button>
            </div>
          )}
          <div className="conversation-rows">
            {visible.map((c) => (
              <button
                className={`conversation-row ${c.id === selected ? 'selected' : ''}`}
                key={c.id}
                aria-current={c.id === selected ? 'true' : undefined}
                aria-describedby={chatUnread(c, reader.uid) ? `unread-${c.id}` : undefined}
                onClick={() => setSelected(c.id)}
                aria-label={`Open conversation with ${chatTitle(c, reader.uid)}`}
              >
                <div>
                  <strong>{chatTitle(c, reader.uid)}</strong>
                  {chatUnread(c, reader.uid) && (
                    <span className="chat-unread" id={`unread-${c.id}`}>
                      Unread
                    </span>
                  )}
                </div>
                <p>{c.lastMessage?.text || 'No messages yet'}</p>
                <small>
                  {c.participantUids.length > 2 ? `${c.participantUids.length} staff · ` : ''}
                  {c.updatedAt !== null ? new Date(c.updatedAt).toLocaleString() : ''}
                </small>
              </button>
            ))}
          </div>
          {!visible.length && live.status === 'live' && (
            <p className="chat-notice">
              {chats.length
                ? 'No conversations match. Load older conversations to search more history.'
                : 'No conversations yet. Choose New conversation to send your first message.'}
            </p>
          )}
          {(more ?? live.more) && (
            <button disabled={busy || live.status !== 'live'} onClick={() => void loadOlder()}>
              {busy ? 'Loading…' : 'Load older conversations'}
            </button>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </aside>
        {selected ? (
          <Conversation
            key={`${reader.uid}:${reader.club}:${selected}`}
            client={client}
            id={selected}
            uid={reader.uid}
            initialDraft={drafts.current[selected] ?? ''}
            onDraftChange={rememberDraft}
            onChatChange={updateConversation}
          />
        ) : (
          <section className="panel chat-empty">
            <MessageSquare size={32} />
            <h2>Your staff messages</h2>
            <p>Choose a conversation or start a new one.</p>
          </section>
        )}
      </div>
      {creating && (
        <NewConversation
          client={client}
          onClose={() => setCreating(false)}
          onStarted={(id) => {
            setSelected(id)
            setCreating(false)
            setUnreadOnly(false)
            setSearch('')
          }}
        />
      )}
    </>
  )
}
