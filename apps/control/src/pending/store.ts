import { randomUUID } from 'node:crypto'

export type PendingDecision = 'allow' | 'deny'

export interface PendingMeta {
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  message: string
}

interface Entry {
  meta: PendingMeta
  result?: { decision: PendingDecision; reason?: string }
  resolveWait?: (r: { decision: PendingDecision; reason?: string }) => void
  timer?: ReturnType<typeof setTimeout>
}

export class PendingStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<
    (list: Array<{ requestId: string } & PendingMeta>) => void
  >()

  constructor(private opts: { defaultTimeoutMs: number }) {}

  create(meta: PendingMeta): { requestId: string } {
    const requestId = `req_${randomUUID()}`
    this.entries.set(requestId, { meta })
    this.emit()
    return { requestId }
  }

  wait(
    requestId: string,
    timeoutMs?: number,
  ): Promise<{ decision: PendingDecision; reason?: string }> {
    const entry = this.entries.get(requestId)
    if (!entry) {
      return Promise.resolve({ decision: 'deny', reason: 'unknown_request' })
    }

    if (entry.result) {
      const result = entry.result
      this.entries.delete(requestId)
      return Promise.resolve(result)
    }

    const ms = timeoutMs ?? this.opts.defaultTimeoutMs
    return new Promise(resolve => {
      entry.resolveWait = r => {
        clearTimeout(entry.timer)
        this.entries.delete(requestId)
        this.emit()
        resolve(r)
      }

      entry.timer = setTimeout(() => {
        if (!entry.resolveWait) return
        const finish = entry.resolveWait
        entry.resolveWait = undefined
        finish({ decision: 'deny', reason: 'timeout' })
      }, ms)
    })
  }

  resolve(requestId: string, decision: PendingDecision): boolean {
    const entry = this.entries.get(requestId)
    if (!entry || entry.result) return false

    const result = { decision }
    if (entry.resolveWait) {
      const finish = entry.resolveWait
      entry.resolveWait = undefined
      clearTimeout(entry.timer)
      finish(result)
      return true
    }

    entry.result = result
    this.emit()
    return true
  }

  list(): Array<{ requestId: string } & PendingMeta> {
    return [...this.entries.entries()]
      .filter(([, entry]) => !entry.result)
      .map(([requestId, entry]) => ({
        requestId,
        ...entry.meta,
      }))
  }

  subscribe(
    fn: (list: Array<{ requestId: string } & PendingMeta>) => void,
  ): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    const list = this.list()
    for (const fn of this.listeners) fn(list)
  }
}
