import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Send } from 'lucide-react'
import type { MessagingClient } from '../../../../data/firebase-messaging'
import {
  chatTitle,
  messageReaders,
  type StaffChat,
  type StaffMessage,
  type MessagingLive,
} from '../../../../domain/messaging'
const time = (value: number | null) =>
  value === null ? 'Pending' : new Date(value).toLocaleString()
export default function Conversation({
  client,
  id,
  uid,
  initialDraft,
  onDraftChange,
  onChatChange,
}: {
  client: MessagingClient
  id: string
  uid: string
  initialDraft: string
  onDraftChange(id: string, text: string): void
  onChatChange(chat: StaffChat): void
}) {
  const [chat, setChat] = useState<MessagingLive<StaffChat>>({ rows: [], status: 'connecting' })
  const [live, setLive] = useState<MessagingLive<StaffMessage>>({ rows: [], status: 'connecting' })
  const [older, setOlder] = useState<StaffMessage[]>([]),
    [more, setMore] = useState<boolean | null>(null)
  const [text, setText] = useState(client.pending(id)?.text ?? initialDraft),
    [pending, setPending] = useState(!!client.pending(id))
  const [sending, setSending] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [readError, setReadError] = useState(''),
    [readRetry, setReadRetry] = useState(0)
  const [search, setSearch] = useState(''),
    [results, setResults] = useState<{
      query: string
      rows: StaffMessage[]
      next: number | null
    } | null>(null)
  const [atBottom, setAtBottom] = useState(true),
    [focused, setFocused] = useState(document.hasFocus() && document.visibilityState === 'visible')
  const scroll = useRef<HTMLDivElement>(null),
    shouldScroll = useRef(true),
    prepend = useRef<number | null>(null),
    saving = useRef(false),
    searching = useRef(0)
  useEffect(() => client.subscribeChat(id, setChat), [client, id])
  useEffect(() => client.subscribeMessages(id, setLive), [client, id])
  useEffect(() => {
    const update = () => setFocused(document.hasFocus() && document.visibilityState === 'visible')
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      document.removeEventListener('visibilitychange', update)
      searching.current++
    }
  }, [])
  const messages = useMemo(() => {
    const m = new Map(older.map((v) => [v.id, v]))
    live.rows.forEach((v) => m.set(v.id, v))
    return [...m.values()].sort((a, b) => a.sequence - b.sequence)
  }, [older, live.rows])
  const current = chat.rows[0],
    latest = live.rows.at(-1)
  useEffect(() => {
    if (current && chat.status === 'live') onChatChange(current)
  }, [current, chat.status, onChatChange])
  const connected = live.status === 'live' && chat.status === 'live' && !!current
  const unavailable = chat.status === 'error' || live.status === 'error'
  const ownRead = current?.readBy[uid]?.sequence ?? 0
  useLayoutEffect(() => {
    const node = scroll.current
    if (!node || results) return
    if (prepend.current !== null) {
      node.scrollTop += node.scrollHeight - prepend.current
      prepend.current = null
    } else if (shouldScroll.current) {
      node.scrollTop = node.scrollHeight
      setAtBottom(true)
    }
  }, [messages, results])
  useEffect(() => {
    const node = scroll.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      if (shouldScroll.current && !results) {
        node.scrollTop = node.scrollHeight
        setAtBottom(true)
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [results, unavailable])
  useEffect(() => {
    if (!connected || !focused || !atBottom || results || !latest || ownRead >= latest.sequence)
      return
    let active = true
    const timer = window.setTimeout(() => {
      void client
        .read(id, latest.id)
        .then(() => {
          if (active) setReadError('')
        })
        .catch(() => {
          if (active) setReadError('Read receipt was not confirmed.')
        })
    }, 350)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [client, id, connected, focused, atBottom, results, latest?.id, ownRead, readRetry])
  async function send() {
    if (!text.trim() || saving.current || !connected) return
    saving.current = true
    setSending(true)
    setError('')
    try {
      await client.send(id, text)
      setText('')
      onDraftChange(id, '')
      setPending(false)
      shouldScroll.current = true
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
      setAtBottom(true)
    } catch (e) {
      setPending(!!client.pending(id))
      setError(e instanceof Error ? e.message : 'Send was not confirmed. Retry the same message.')
    } finally {
      saving.current = false
      setSending(false)
    }
  }
  async function loadOlder() {
    if (loading || !messages[0]) return
    setLoading(true)
    setError('')
    shouldScroll.current = false
    setAtBottom(false)
    try {
      const page = await client.olderMessages(id, messages[0].sequence)
      prepend.current = scroll.current?.scrollHeight ?? null
      setOlder((rows) => [...page.rows, ...rows])
      setMore(page.more)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'History could not be loaded.')
    } finally {
      setLoading(false)
    }
  }
  async function find(olderPage = false) {
    const q = olderPage ? results?.query : search.trim()
    if (!q) {
      setResults(null)
      return
    }
    const request = ++searching.current
    setLoading(true)
    setError('')
    try {
      const page = await client.search(id, q, olderPage ? (results?.next ?? null) : null)
      if (request === searching.current)
        setResults((previous) => ({
          query: q,
          rows: [...(olderPage ? (previous?.rows ?? []) : []), ...page.messages],
          next: page.nextBefore,
        }))
    } catch (e) {
      if (request === searching.current)
        setError(e instanceof Error ? e.message : 'Search could not be completed.')
    } finally {
      if (request === searching.current) setLoading(false)
    }
  }
  const displayed = results
    ? [
        ...new Map(
          [
            ...results.rows,
            ...live.rows.filter((m) =>
              m.text.toLocaleLowerCase().includes(results.query.toLocaleLowerCase()),
            ),
          ].map((m) => [m.id, m]),
        ).values(),
      ].sort((a, b) => b.sequence - a.sequence)
    : messages
  return (
    <section className="panel chat-conversation" aria-label="Conversation">
      <header className="chat-heading">
        <h2>{current ? chatTitle(current, uid) : 'Conversation'}</h2>
        <p>
          {current?.participantUids.length
            ? `${current.participantUids.length} participants · `
            : ''}
          {connected ? 'Live updates' : unavailable ? 'Unavailable' : 'Reconnecting…'}
        </p>
      </header>
      <form
        className="message-search"
        onSubmit={(e) => {
          e.preventDefault()
          if (!loading) void find()
        }}
      >
        <input
          type="search"
          aria-label="Search this conversation"
          placeholder="Search this conversation"
          value={search}
          maxLength={200}
          disabled={!connected}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button disabled={!connected || loading || !search.trim()}>Search messages</button>
        {results && (
          <button
            type="button"
            onClick={() => {
              searching.current++
              setLoading(false)
              setResults(null)
              setSearch('')
            }}
          >
            Clear search
          </button>
        )}
      </form>
      {unavailable ? (
        <div className="chat-notice" role="alert">
          {chat.error || live.error} Reopen this conversation to reconnect.
        </div>
      ) : (
        <>
          <div
            ref={scroll}
            className="chat-history"
            role={results ? 'region' : 'log'}
            aria-live={results ? 'off' : 'polite'}
            aria-relevant="additions"
            aria-label={results ? 'Message search results' : 'Chat history'}
            onScroll={() => {
              const el = scroll.current
              if (el) {
                const near = el.scrollHeight - el.scrollTop - el.clientHeight < 36
                shouldScroll.current = near
                setAtBottom(near)
              }
            }}
          >
            {!results && (more ?? live.more) && (
              <button
                className="history-load"
                disabled={loading || !connected}
                onClick={() => void loadOlder()}
              >
                {loading ? 'Loading…' : 'Load older messages'}
              </button>
            )}
            {results && (
              <div className="chat-notice">
                <p>
                  {displayed.length} matching messages
                  {results.next !== null
                    ? ' · more history is available'
                    : ' · all history searched'}
                </p>
                {results.next !== null && (
                  <button disabled={loading} onClick={() => void find(true)}>
                    {loading ? 'Searching…' : 'Search older history'}
                  </button>
                )}
              </div>
            )}
            {!displayed.length && (
              <p className="chat-notice">
                {connected
                  ? results
                    ? 'No matching messages found in the history searched so far.'
                    : 'No messages yet. Say hello.'
                  : 'Loading conversation…'}
              </p>
            )}
            {displayed.map((m, i) => {
              const readers = current ? messageReaders(current, m) : [],
                own = m.senderUid === uid
              const date = m.sentAt === null ? '' : new Date(m.sentAt).toLocaleDateString()
              const previousDate =
                displayed[i - 1]?.sentAt == null
                  ? ''
                  : new Date(displayed[i - 1]!.sentAt!).toLocaleDateString()
              return (
                <div key={m.id} className="chat-message-wrap">
                  {date !== previousDate && <div className="chat-date">{date}</div>}
                  <article
                    className={`chat-message ${own ? 'own' : ''}`}
                    aria-label={`Message from ${m.senderName}`}
                  >
                    <div className="message-meta">
                      <strong>{own ? 'You' : m.senderName}</strong>
                      <time
                        dateTime={m.sentAt === null ? undefined : new Date(m.sentAt).toISOString()}
                      >
                        {time(m.sentAt)}
                      </time>
                    </div>
                    <p>{m.text}</p>
                    {own && (
                      <div className="read-receipt">
                        {readers.length ? (
                          <details>
                            <summary>
                              {current?.participantUids.length === 2
                                ? 'Read'
                                : `Read by ${readers.length} of ${(current?.participantUids.length ?? 1) - 1}`}
                            </summary>
                            <ul>
                              {readers.map((r) => (
                                <li key={r.uid}>
                                  {r.name} · last read {time(r.readAt)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          'Sent'
                        )}
                      </div>
                    )}
                  </article>
                </div>
              )
            })}
          </div>
          {!atBottom && !results && (
            <button
              className="jump-latest"
              onClick={() => {
                shouldScroll.current = true
                if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
                setAtBottom(true)
              }}
            >
              <ArrowDown size={14} /> Latest messages
            </button>
          )}
          {readError && (
            <div className="chat-notice">
              <span>{readError}</span>
              <button onClick={() => setReadRetry((n) => n + 1)}>Retry read receipt</button>
            </div>
          )}
          <form
            className="message-composer"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <label className="sr-only" htmlFor="staff-message">
              Message
            </label>
            <textarea
              id="staff-message"
              aria-label="Message"
              placeholder="Write a message…"
              maxLength={10000}
              value={text}
              disabled={sending || pending || !connected}
              onChange={(e) => {
                setText(e.target.value)
                onDraftChange(id, e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <div>
              <small>Enter to send · Shift+Enter for a new line</small>
              <button className="primary" disabled={sending || !text.trim() || !connected}>
                <Send size={15} />
                {sending ? 'Sending…' : pending ? 'Retry same message' : 'Send message'}
              </button>
            </div>
            {pending && (
              <p className="chat-notice">
                Send was not confirmed. Retry to confirm delivery without sending twice.
              </p>
            )}
          </form>
        </>
      )}
      {error && (
        <p className="inline-error chat-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
