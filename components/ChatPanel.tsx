'use client'

import { useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content: q }]
    setMsgs(next)
    setText('')
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      setMsgs([...next, { role: 'assistant', content: data.reply ?? 'Something went wrong.' }])
    } catch {
      setMsgs([...next, { role: 'assistant', content: 'Could not reach the chatbot.' }])
    } finally {
      setBusy(false)
      setTimeout(() => logRef.current?.scrollTo({ top: 1e9 }), 0)
    }
  }

  return (
    <>
      <button className="chat-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Close chat' : 'Ask about companies'}
      </button>
      {open && (
        <div className="chat">
          <div className="chat-log" ref={logRef}>
            {msgs.length === 0 && (
              <p className="muted">
                Ask things like &quot;Which NJ company has the biggest roof?&quot; or &quot;How many properties does
                Acme have?&quot; Answers use approved data only.
              </p>
            )}
            {msgs.map((m, i) => (
              <p key={i} className={`msg ${m.role}`}>{m.content}</p>
            ))}
            {busy && <p className="muted">Looking that up…</p>}
          </div>
          <form onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" maxLength={500} />
            <button disabled={busy}>Send</button>
          </form>
        </div>
      )}
    </>
  )
}