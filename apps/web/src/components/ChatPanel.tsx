import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { ChatMessage, ToolCallEvent } from '../types/chat'
import { toSessionMetaList, toSessionDetail, type SessionMetaDTO } from '../mappers/chat-sessions'
import {
  applyChatStreamEvent,
  finalizeChatStream,
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
import HeadlessPagesPanel from './HeadlessPagesPanel'
import { randomId } from '../lib/randomId'

type OpenTab = {
  id: string
  title: string
  messages: ChatMessage[]
  streaming: boolean
}

function mapMessagesFromDetail(
  detailMessages: Array<{
    role: string
    content: string
    toolCalls?: ToolCallEvent[]
  }>,
): ChatMessage[] {
  return detailMessages.map(m => ({
    id: randomId(),
    role: m.role as ChatMessage['role'],
    content: m.content,
    timestamp: new Date().toISOString(),
    status: 'complete' as const,
    toolCalls: m.toolCalls,
  }))
}

export default function ChatPanel(): ReactElement {
  const [sessions, setSessions] = useState<SessionMetaDTO[]>([])
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [composing, setComposing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [memToast, setMemToast] = useState('')
  const [enabledSkills, setEnabledSkills] = useState<SkillListItem[]>([])
  const [activePage, setActivePage] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortByTabRef = useRef(new Map<string, AbortController>())
  const openTabsRef = useRef(openTabs)
  openTabsRef.current = openTabs

  const activeTab = openTabs.find(t => t.id === activeId) ?? null
  const messages = activeTab?.messages ?? []
  const streaming = activeTab?.streaming ?? false

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

  const updateTab = useCallback(function updateTab(
    id: string,
    patch: Partial<OpenTab> | ((tab: OpenTab) => OpenTab),
  ) {
    setOpenTabs(prev =>
      prev.map(t => {
        if (t.id !== id) return t
        return typeof patch === 'function' ? patch(t) : { ...t, ...patch }
      }),
    )
  }, [])

  const refreshEnabledSkills = useCallback(async function refreshEnabledSkills() {
    try {
      const result = await listSkills({ enabledOnly: true })
      if (result.ok) setEnabledSkills(result.data)
    } catch {
      // picker is best-effort
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
  }, [messages, activeId])

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
        // advisory
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
      // ignore
    }
  }, [])

  useEffect(function loadSessionsOnMount() {
    void loadSessions()
  }, [loadSessions])

  const saveSession = useCallback(
    async function saveSession(
      tabId: string,
      msgs: ChatMessage[],
      title?: string,
    ) {
      const id = tabId.startsWith('draft_') ? `chat_${Date.now()}` : tabId
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
        if (id !== tabId) {
          // Promote draft tab id to persisted session id.
          const ac = abortByTabRef.current.get(tabId)
          if (ac) {
            abortByTabRef.current.delete(tabId)
            abortByTabRef.current.set(id, ac)
          }
          setOpenTabs(prev =>
            prev.map(t =>
              t.id === tabId ? { ...t, id, title: sessionTitle } : t,
            ),
          )
          setActiveId(prev => (prev === tabId ? id : prev))
        } else {
          updateTab(id, { title: sessionTitle })
        }
        void loadSessions()
        return id
      } catch {
        return tabId
      }
    },
    [loadSessions, updateTab],
  )

  const openSession = useCallback(async function openSession(id: string) {
    if (openTabsRef.current.some(t => t.id === id)) {
      setActiveId(id)
      return
    }
    try {
      const res = await fetch(`/api/chat-sessions/${id}`)
      const data = await res.json()
      const detail = toSessionDetail(data)
      const title = sessions.find(s => s.id === id)?.title || 'Chat'
      const tab: OpenTab = {
        id: detail.id,
        title,
        messages: mapMessagesFromDetail(detail.messages),
        streaming: false,
      }
      setOpenTabs(prev => (prev.some(t => t.id === detail.id) ? prev : [...prev, tab]))
      setActiveId(detail.id)
    } catch {
      // ignore
    }
  }, [sessions])

  const newChat = useCallback(function newChat() {
    const id = `draft_${Date.now()}`
    const tab: OpenTab = {
      id,
      title: 'New Chat',
      messages: [],
      streaming: false,
    }
    setOpenTabs(prev => [...prev, tab])
    setActiveId(id)
    setInput('')
  }, [])

  const closeTab = useCallback(
    function closeTab(id: string) {
      abortByTabRef.current.get(id)?.abort()
      abortByTabRef.current.delete(id)
      setOpenTabs(prev => {
        const idx = prev.findIndex(t => t.id === id)
        const next = prev.filter(t => t.id !== id)
        setActiveId(cur => {
          if (cur !== id) return cur
          if (next.length === 0) return null
          const fallback = next[Math.min(idx, next.length - 1)]
          return fallback?.id ?? null
        })
        return next
      })
    },
    [],
  )

  const deleteSession = useCallback(
    async function deleteSession(id: string) {
      await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' })
      if (openTabsRef.current.some(t => t.id === id)) closeTab(id)
      void loadSessions()
    },
    [closeTab, loadSessions],
  )

  const handleStop = useCallback(
    function handleStop() {
      if (!activeId) return
      abortByTabRef.current.get(activeId)?.abort()
    },
    [activeId],
  )

  const handleSend = useCallback(async function handleSend() {
    if (!input.trim() || !activeId) return
    const tabId = activeId
    const tab = openTabsRef.current.find(t => t.id === tabId)
    if (!tab || tab.streaming) return

    const userMsg: ChatMessage = {
      id: randomId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
      status: 'complete',
    }
    const assistantMsg: ChatMessage = {
      id: randomId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'streaming',
      toolCalls: [],
    }

    const history = [...tab.messages, userMsg]
    let live: ChatMessage[] = [...history, assistantMsg]
    updateTab(tabId, { messages: live, streaming: true })
    setInput('')

    const ac = new AbortController()
    abortByTabRef.current.set(tabId, ac)

    const patchLive = (next: ChatMessage[]) => {
      live = next
      updateTab(tabId, { messages: next })
    }

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
      let receivedDone = false

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
            receivedDone = true
            patchLive(markAssistantComplete(live))
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
            patchLive(applyChatStreamEvent(live, event))
          } catch {
            // ignore malformed stream chunks
          }
        }
        if (receivedDone) break
      }

      live = finalizeChatStream(live, {
        receivedDone,
        aborted: ac.signal.aborted,
      })
      patchLive(live)
      void saveSession(tabId, live)

      if (ac.signal.aborted || !receivedDone) return

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
        live = finalizeChatStream(live, {
          receivedDone: false,
          aborted: true,
        })
        patchLive(live)
        void saveSession(tabId, live)
      } else {
        // Network drop mid-fetch (e.g. control process restart) often surfaces
        // as TypeError / Failed to fetch rather than a clean abort.
        const msg = err instanceof Error ? err.message : String(err)
        const looksLikeDrop =
          /failed to fetch|networkerror|load failed|econnrefused|connection/i.test(
            msg,
          )
        live = looksLikeDrop
          ? finalizeChatStream(live, {
              receivedDone: false,
              aborted: false,
            })
          : applyChatStreamEvent(live, {
              type: 'error',
              message: msg,
            })
        patchLive(live)
        void saveSession(tabId, live)
      }
    } finally {
      if (abortByTabRef.current.get(tabId) === ac) {
        abortByTabRef.current.delete(tabId)
      }
      updateTab(tabId, { streaming: false })
      if (activeId === tabId) setPendingConfirm(false)
    }
  }, [activeId, input, saveSession, updateTab])

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
              onClick={() => void openSession(s.id)}
              className={`chat-panel__session-item${activeId === s.id ? ' chat-panel__session-item--active' : ''}`}
            >
              <span className="chat-panel__session-title">{s.title}</span>
              {openTabs.some(t => t.id === s.id && t.streaming) && (
                <span className="chat-panel__session-streaming" title="Streaming">
                  ·
                </span>
              )}
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

        {/* ── Headless Pages ── */}
        <div className="chat-panel__pages-section">
          <HeadlessPagesPanel
            selectedPageId={activePage}
            onPageSelect={setActivePage}
          />
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
        <div className="chat-panel__tabs" role="tablist">
          {openTabs.map(tab => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeId}
              className={`chat-panel__tab${tab.id === activeId ? ' chat-panel__tab--active' : ''}`}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.streaming && (
                <span className="chat-panel__tab-dot" aria-hidden />
              )}
              <span className="chat-panel__tab-title">{tab.title}</span>
              <button
                type="button"
                className="chat-panel__tab-close"
                aria-label={`Close ${tab.title}`}
                onClick={e => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="chat-panel__tab-new"
            onClick={newChat}
            aria-label="New chat tab"
          >
            +
          </button>
        </div>

        <div ref={scrollRef} className="chat-panel__messages">
          {!activeTab ? (
            activePage ? (
              <HeadlessPagesPanel
                selectedPageId={activePage}
                onPageSelect={setActivePage}
              />
            ) : (
              <div className="chat-panel__messages--empty">
                <div className="text-center">
                  <p className="chat-panel__empty-title">Chat</p>
                  <p className="chat-panel__empty-subtitle">
                    Open a conversation from the sidebar or start a new tab.
                  </p>
                </div>
              </div>
            )
          ) : messages.length === 0 ? (
            <div className="chat-panel__messages--empty">
              <div className="text-center">
                <p className="chat-panel__empty-title">{activeTab.title}</p>
                <p className="chat-panel__empty-subtitle">
                  Send a message to begin.
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
        {activeTab && statusLabel && (
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
                  if (e.key === 'Enter' && !composing && !streaming && activeTab) {
                    void handleSend()
                  }
                }}
                placeholder={
                  !activeTab
                    ? 'Open or create a chat…'
                    : streaming
                      ? statusLabel ?? 'Working…'
                      : 'Type a message...'
                }
                disabled={!activeTab || streaming}
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
                  disabled={!activeTab || !input.trim()}
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
