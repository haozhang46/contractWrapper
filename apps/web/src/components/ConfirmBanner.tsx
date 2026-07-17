import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
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

/** Blocking confirm dialog for onion `needs_confirm` (Headless UI). */
export default function ConfirmBanner(): ReactElement | null {
  const [pending, setPending] = useState<PendingItem[]>([])
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(function syncPendingStream() {
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
      pollTimer = setInterval(poll, 1500)
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

    // Always poll as a fallback — SSE can silently stall behind proxies.
    startPolling()

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
      setPending(prev => prev.filter(p => p.requestId !== requestId))
    } finally {
      setSubmitting(null)
    }
  }

  const first = pending[0]
  const open = Boolean(first)

  return (
    <Dialog open={open} onClose={() => {}} className="relative" style={{ zIndex: 'var(--z-modal)' }}>
      <div className="confirm-dialog__overlay" aria-hidden="true" />
      <div className="confirm-dialog__wrapper">
        <DialogPanel className="confirm-dialog__panel">
          <DialogTitle className="confirm-dialog__title">
            Tool confirmation required
          </DialogTitle>
          {first && (
            <>
              <p className="confirm-dialog__message">
                {first.message}
              </p>
              <p className="confirm-dialog__tool-name">
                {first.toolName}
              </p>
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  onClick={() => void confirm(first.requestId, 'deny')}
                  disabled={submitting === first.requestId}
                  className="confirm-dialog__btn--deny"
                >
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => void confirm(first.requestId, 'allow')}
                  disabled={submitting === first.requestId}
                  className="confirm-dialog__btn--allow"
                >
                  Allow
                </button>
              </div>
            </>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
