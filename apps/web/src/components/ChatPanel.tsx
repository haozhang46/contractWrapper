import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { ChatMessage, ToolCallEvent } from '../types/chat'
import { toSessionMetaList, toSessionDetail, type SessionMetaDTO } from '../mappers/chat-sessions'
import {
  applyChatStreamEvent,
  markAssistantComplete,
} from './applyChatStreamEvent'
import { deriveChatStatus } from './deriveChatStatus'
import { listSkills, type SkillListItem } from './skillsApi'
import SlashSkillPicker from './SlashSkillPicker'
import {
  applySlashInsert,
  filterSkills,
  parseSlashQuery,
} from './slashSkill'

export default function ChatPanel(): ReactElement {
  const [sessions, setSessions] = useState<SessionMetaDTO[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [composing, setComposing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [memToast, setMemToast] = useState('')
  const [enabledSkills, setEnabledSkills] = useState<SkillListItem[]>([])
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const slashQuery = parseSlashQuery(input)
  const slashOpen = Boolean(slashQuery?.active) && !slashDismissed
  const filteredSkills = slashQuery
    ? filterSkills(
        enabledSkills.map((s) => ({
          name: s.name,
          description: s.description,
        })),
        slashQuery.filter,
      )
    : []

  const refreshEnabledSkills = useCallback(async function refreshEnabledSkills() {
    try {
      const result = await listSkills({ enabledOnly: true })
      if (result.ok) setEnabledSkills(result.data)
    } catch {
      // picker is best-effort; chat still works without it
    }
  }, [])

  useEffect(function loadEnabledSkillsOnMount() {
    void refreshEnabledSkills()
  }, [refreshEnabledSkills])

  useEffect(function refreshSkillsWhenPickerOpens() {
    if (slashOpen) void refreshEnabledSkills()
  }, [slashOpen, refreshEnabledSkills])

  useEffect(function resetSlashIndex() {
    setSlashIndex(0)
    setSlashDismissed(false)
  }, [slashQuery?.filter, slashQuery?.active])

  useEffect(function clampSlashIndex() {
    if (filteredSkills.length === 0) {
      setSlashIndex(0)
      return
    }
    setSlashIndex((i) => Math.min(i, filteredSkills.length - 1))
  }, [filteredSkills.length])

  const selectSlashSkill = useCallback(
    function selectSlashSkill(name: string) {
      setInput((prev) => {
        const next = applySlashInsert(prev, name)
        // Trailing space ends the slash token so the picker closes.
        return parseSlashQuery(next) ? `${next} ` : next
      })
      setSlashDismissed(true)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [],
  )

  useEffect(function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // While streaming, watch pending confirms so status can explain "stuck" waits.
  useEffect(function pollPendingConfirms() {
    if (!streaming) {
      setPendingConfirm(false)
      return
    }
    let closed = false
    const poll = async () => {
      try {
        const res = await fetch('/api/pending')
        if (!res.ok || closed) return
        const data = (await res.json()) as { pending?: unknown[] }
        if (!closed) setPendingConfirm((data.pending?.length ?? 0) > 0)
      } catch {
        // Transient — status bar is advisory, not critical
      }
    }
    void poll()
    const timer = setInterval(poll, 1500)
    return () => {
      closed = true
      clearInterval(timer)
    }
  }, [streaming])

  const loadSessions = useCallback(async function loadSessions() {
    try {
      const res = await fetch('/api/chat-sessions')
      const data = await res.json()
      setSessions(toSessionMetaList(data.sessions))
    } catch {
      // chat API may be unavailable until later tasks
    }
  }, [])

  useEffect(function loadSessionsOnMount() {
    void loadSessions()
  }, [loadSessions])

  const openSession = useCallback(async function openSession(id: string) {
    try {
      const res = await fetch(`/api/chat-sessions/${id}`)
      const data = await res.json()
      const detail = toSessionDetail(data)
      if (detail.messages.length > 0) {
        setActiveId(detail.id)
        setMessages(
          detail.messages.map(m => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            timestamp: new Date().toISOString(),
            status: 'complete' as const,
            toolCalls: m.toolCalls,
          })),
        )
      }
    } catch {
      // ignore
    }
  }, [])

  const saveSession = useCallback(
    async function saveSession(msgs: ChatMessage[], title?: string) {
      const id = activeId ?? `chat_${Date.now()}`
      if (!activeId) setActiveId(id)
      try {
        const apiMessages = msgs
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role,
            content: m.content,
            ...(m.toolCalls && m.toolCalls.length > 0
              ? { toolCalls: m.toolCalls }
              : {}),
          }))
        const sessionTitle =
          title ??
          msgs.find(m => m.role === 'user')?.content.slice(0, 50) ??
          'New Chat'
        await fetch('/api/chat-sessions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, title: sessionTitle, messages: apiMessages }),
        })
        void loadSessions()
      } catch {
        // ignore
      }
    },
    [activeId, loadSessions],
  )

  const newChat = useCallback(function newChat() {
    abortRef.current?.abort()
    abortRef.current = null
    setActiveId(null)
    setMessages([])
    setStreaming(false)
  }, [])

  const deleteSession = useCallback(async function deleteSession(id: string) {
    await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' })
    if (activeId === id) newChat()
    void loadSessions()
  }, [activeId, loadSessions, newChat])

  const handleStop = useCallback(function handleStop() {
    abortRef.current?.abort()
  }, [])

  const handleSend = useCallback(async function handleSend() {
    if (!input.trim() || streaming) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
      status: 'complete',
    }
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'streaming',
      toolCalls: [],
    }

    const history = [...messages, userMsg]
    let live: ChatMessage[] = [...history, assistantMsg]
    setMessages(live)
    setInput('')
    setStreaming(true)

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const apiMessages = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: ac.signal,
      })

      if (!response.ok) throw new Error(`Server error: ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            live = markAssistantComplete(live)
            setMessages(live)
            break
          }
          try {
            const event = JSON.parse(data) as {
              type: string
              content?: string
              message?: string
              toolCall?: ToolCallEvent
            }
            if (event.type === 'text-delta' && event.content) {
              fullContent += event.content
            }
            live = applyChatStreamEvent(live, event)
            setMessages(live)
          } catch {
            // ignore malformed stream chunks
          }
        }
      }

      if (ac.signal.aborted) {
        const last = live[live.length - 1]
        if (last?.role === 'assistant') {
          live = [
            ...live.slice(0, -1),
            {
              ...last,
              status: 'complete',
              content: last.content || '(stopped)',
            },
          ]
          setMessages(live)
          void saveSession(live)
        }
        return
      }

      live = markAssistantComplete(live)
      setMessages(live)
      void saveSession(live)

      fetch('/api/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages.concat({
            role: 'assistant',
            content: fullContent,
          }),
        }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.extracted?.length) {
            const count = d.extracted.length
            setMemToast(`🧠 ${count} memory entry extracted`)
            setTimeout(() => setMemToast(''), 4000)
          }
        })
        .catch(() => {})
    } catch (err) {
      if (ac.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        const last = live[live.length - 1]
        if (last?.role === 'assistant') {
          live = [
            ...live.slice(0, -1),
            {
              ...last,
              status: 'complete',
              content: last.content || '(stopped)',
            },
          ]
          setMessages(live)
          void saveSession(live)
        }
      } else {
        live = applyChatStreamEvent(live, {
          type: 'error',
          message: String(err),
        })
        setMessages(live)
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setStreaming(false)
      setPendingConfirm(false)
    }
  }, [input, messages, streaming, saveSession])

  const statusLabel = deriveChatStatus(messages, streaming, { pendingConfirm })

  return (
    <div className="chat-panel">
      <div
        className={`chat-panel__sidebar${sidebarOpen ? ' chat-panel__sidebar--open' : ' chat-panel__sidebar--closed'}`}
      >
        <div className="chat-panel__sidebar-header">
          <button
            type="button"
            onClick={newChat}
            className="chat-panel__new-chat-btn"
          >
            + New Chat
          </button>
        </div>
        <div className="chat-panel__session-list">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`chat-panel__session-item${activeId === s.id ? ' chat-panel__session-item--active' : ''}`}
            >
              <span className="chat-panel__session-title">{s.title}</span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  void deleteSession(s.id)
                }}
                className="chat-panel__session-delete"
              >
                ✕
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="chat-panel__session-empty">
              No conversations yet
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="chat-panel__sidebar-toggle"
      >
        {sidebarOpen ? '◀' : '▶'}
      </button>

      <div className="chat-panel__main">
        <div ref={scrollRef} className="chat-panel__messages">
          {messages.length === 0 ? (
            <div className="chat-panel__messages--empty">
              <div className="text-center">
                <p className="chat-panel__empty-title">Chat</p>
                <p className="chat-panel__empty-subtitle">
                  Start a new conversation or select one from the sidebar.
                </p>
              </div>
            </div>
          ) : (
            <div className="chat-panel__message-list">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </div>

        {memToast && (
          <div className="chat-panel__memory-toast">
            {memToast}
          </div>
        )}
        {statusLabel && (
          <div className="chat-panel__status">
            <span className="chat-panel__status-dot" />
            <span className="chat-panel__status-text">{statusLabel}</span>
          </div>
        )}
        <div className="chat-panel__input-area">
          <div className="chat-panel__input-wrap">
            {slashOpen && (
              <SlashSkillPicker
                skills={filteredSkills}
                selectedIndex={slashIndex}
                onSelect={selectSlashSkill}
                onHover={setSlashIndex}
              />
            )}
            <div className="chat-panel__input-row">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                onKeyDown={e => {
                  if (slashOpen) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      if (filteredSkills.length === 0) return
                      setSlashIndex((i) => (i + 1) % filteredSkills.length)
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      if (filteredSkills.length === 0) return
                      setSlashIndex(
                        (i) =>
                          (i - 1 + filteredSkills.length) % filteredSkills.length,
                      )
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (!composing && filteredSkills[slashIndex]) {
                        selectSlashSkill(filteredSkills[slashIndex].name)
                      }
                      return
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setSlashDismissed(true)
                      return
                    }
                  }
                  if (e.key === 'Enter' && !composing && !streaming) void handleSend()
                }}
                placeholder={streaming ? statusLabel ?? 'Working…' : 'Type a message...'}
                disabled={streaming}
                className="chat-panel__input"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="chat-panel__stop-btn"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                  className="chat-panel__send-btn"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }): ReactElement {
  const isUser = message.role === 'user'
  return (
    <div className={`message${isUser ? ' message--user' : ' message--assistant'}`}>
      <div
        className={`message__bubble${isUser ? ' message__bubble--user' : ' message__bubble--assistant'}`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="message__tool-calls">
            {message.toolCalls.map(tc => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        <p className="message__content">{message.content || ' '}</p>
        {message.status === 'streaming' && (
          <span className="message__streaming-cursor" />
        )}
      </div>
    </div>
  )
}

function ToolCallCard({ toolCall }: { toolCall: ToolCallEvent }): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasOutput = Boolean(toolCall.output)

  return (
    <div className="tool-call">
      <button
        type="button"
        className="tool-call__header"
        onClick={() => hasOutput && setExpanded(v => !v)}
        disabled={!hasOutput}
        aria-expanded={hasOutput ? expanded : undefined}
      >
        <span className="tool-call__chevron" data-expanded={expanded && hasOutput}>
          {hasOutput ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className="tool-call__status" data-status={toolCall.status}>
          [{toolCall.status}]
        </span>
        <span className="tool-call__name">{toolCall.toolName}</span>
      </button>
      {hasOutput && expanded && (
        <pre className="tool-call__output">
          {toolCall.output}
        </pre>
      )}
    </div>
  )
}
