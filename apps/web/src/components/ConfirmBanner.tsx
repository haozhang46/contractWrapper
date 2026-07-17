import { useEffect, useState, type ReactElement } from 'react'

interface PendingItem {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  message: string
}

function parsePendingPayload(data: unknown): PendingItem[] {
  if (Array.isArray(data)) return data as PendingItem[]
  if (data && typeof data === 'object' && 'pending' in data) {
    const pending = (data as { pending?: unknown }).pending
    return Array.isArray(pending) ? (pending as PendingItem[]) : []
  }
  return []
}

export default function ConfirmBanner(): ReactElement | null {
  const [pending, setPending] = useState<PendingItem[]>([])
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    let closed = false
    let es: EventSource | null = null
    let pollTimer: ReturnType<typeof setInterval> | undefined

    const apply = (data: unknown) => {
      if (!closed) setPending(parsePendingPayload(data))
    }

    const poll = async () => {
      try {
        const res = await fetch('/api/pending')
        if (res.ok) apply(await res.json())
      } catch {
        // ignore transient errors
      }
    }

    const startPolling = () => {
      if (pollTimer) return
      void poll()
      pollTimer = setInterval(poll, 3000)
    }

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = undefined
      }
    }

    try {
      es = new EventSource('/api/pending/stream')
      es.onmessage = event => {
        stopPolling()
        try {
          apply(JSON.parse(event.data))
        } catch {
          // ignore malformed events
        }
      }
      es.onerror = () => {
        es?.close()
        es = null
        startPolling()
      }
    } catch {
      startPolling()
    }

    return () => {
      closed = true
      es?.close()
      stopPolling()
    }
  }, [])

  const confirm = async (requestId: string, decision: 'allow' | 'deny') => {
    setSubmitting(requestId)
    try {
      await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, decision }),
      })
    } finally {
      setSubmitting(null)
    }
  }

  const first = pending[0]
  if (!first) return null

  return (
    <div className="flex items-center gap-2 ml-auto px-3 py-1.5 bg-amber-950/50 border border-amber-700/50 rounded-lg text-sm max-w-lg">
      <span className="text-amber-200 truncate flex-1" title={first.message}>
        {first.message}
      </span>
      <button
        type="button"
        onClick={() => confirm(first.requestId, 'allow')}
        disabled={submitting === first.requestId}
        className="px-2 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded text-xs shrink-0"
      >
        Allow
      </button>
      <button
        type="button"
        onClick={() => confirm(first.requestId, 'deny')}
        disabled={submitting === first.requestId}
        className="px-2 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-xs shrink-0"
      >
        Deny
      </button>
    </div>
  )
}
