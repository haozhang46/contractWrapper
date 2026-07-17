import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { ChatMessage, ToolCallEvent } from '../types/chat'

interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export default function ChatPanel(): ReactElement {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [composing, setComposing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [memToast, setMemToast] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current &&
      (scrollRef.current.scrollTop = scrollRef.current.scrollHeight)
  }, [messages])

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat-sessions')
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {
      // chat API may be unavailable until later tasks
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const openSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat-sessions/${id}`)
      const data = await res.json()
      if (data.messages) {
        setActiveId(id)
        setMessages(
          data.messages.map(
            (m: { role: ChatMessage['role']; content: string }) => ({
              id: crypto.randomUUID(),
              role: m.role,
              content: m.content,
              timestamp: new Date().toISOString(),
              status: 'complete' as const,
            }),
          ),
        )
      }
    } catch {
      // ignore
    }
  }, [])

  const saveSession = useCallback(
    async (msgs: ChatMessage[], title?: string) => {
      const id = activeId ?? `chat_${Date.now()}`
      if (!activeId) setActiveId(id)
      try {
        const apiMessages = msgs
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content }))
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

  const newChat = () => {
    setActiveId(null)
    setMessages([])
  }

  const deleteSession = async (id: string) => {
    await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' })
    if (activeId === id) newChat()
    void loadSessions()
  }

  const handleSend = async () => {
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
    setMessages([...history, assistantMsg])
    setInput('')
    setStreaming(true)

    try {
      const apiMessages = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
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
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last?.role === 'assistant') last.status = 'complete'
              return updated
            })
            break
          }
          try {
            const event = JSON.parse(data) as {
              type: string
              content?: string
              message?: string
              toolCall?: ToolCallEvent
            }
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (!last || last.role !== 'assistant') return prev
              if (event.type === 'text-delta' && event.content) {
                last.content += event.content
                fullContent += event.content
              } else if (event.type === 'tool-call' && event.toolCall) {
                if (!last.toolCalls) last.toolCalls = []
                last.toolCalls.push(event.toolCall)
              } else if (event.type === 'error') {
                last.content += `\n\n[Error: ${event.message ?? 'unknown'}]`
                last.status = 'error'
              }
              return updated
            })
          } catch {
            // ignore malformed stream chunks
          }
        }
      }

      const finalHistory: ChatMessage[] = [
        ...history,
        {
          id: assistantMsg.id,
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
          status: 'complete',
        },
      ]
      void saveSession(finalHistory)

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
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          last.content += `\n\n[Error: ${String(err)}]`
          last.status = 'error'
        }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex h-full">
      <div
        className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-200 border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0 overflow-hidden`}
      >
        <div className="p-3 border-b border-zinc-800">
          <button
            type="button"
            onClick={newChat}
            className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded-lg transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                activeId === s.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span className="flex-1 truncate">{s.title}</span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  void deleteSession(s.id)
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-8">
              No conversations yet
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="text-zinc-500 hover:text-zinc-300 px-1 text-xs shrink-0"
      >
        {sidebarOpen ? '◀' : '▶'}
      </button>

      <div className="flex-1 flex flex-col min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <div className="text-center">
                <p className="text-lg mb-2">Chat</p>
                <p className="text-sm">
                  Start a new conversation or select one from the sidebar.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </div>

        {memToast && (
          <div className="px-4 py-1.5 text-xs text-orange-300 bg-orange-500/10 text-center">
            {memToast}
          </div>
        )}
        <div className="border-t border-zinc-800 p-4 shrink-0">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !composing && !streaming) void handleSend()
              }}
              placeholder={streaming ? 'Waiting...' : 'Type a message...'}
              disabled={streaming}
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || streaming}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors"
            >
              {streaming ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }): ReactElement {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${isUser ? 'bg-orange-600/20 text-orange-100' : 'bg-zinc-800 text-zinc-200'}`}
      >
        <p className="whitespace-pre-wrap">{message.content || ' '}</p>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map(tc => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.status === 'streaming' && (
          <span className="inline-block w-2 h-4 bg-orange-400 animate-pulse ml-1" />
        )}
      </div>
    </div>
  )
}

function ToolCallCard({ toolCall }: { toolCall: ToolCallEvent }): ReactElement {
  const colors = {
    pending: 'text-zinc-400',
    running: 'text-blue-400',
    complete: 'text-green-400',
    error: 'text-red-400',
  }
  return (
    <div className="text-xs bg-zinc-900/50 rounded px-2 py-1 border border-zinc-700/50">
      <span className={colors[toolCall.status]}>[{toolCall.status}]</span>{' '}
      <span className="text-zinc-300 font-medium">{toolCall.toolName}</span>
      {toolCall.output && (
        <pre className="mt-1 text-zinc-500 truncate max-w-xs">{toolCall.output}</pre>
      )}
    </div>
  )
}
