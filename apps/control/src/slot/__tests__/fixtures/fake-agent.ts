/**
 * Fake CCB stdio agent for CcbSlot tests.
 * Reads JSONL from stdin; on `turn`, emits text-delta + done with matching id.
 * Content "slow" waits until abort (or 5s timeout) before responding.
 */
const decoder = new TextDecoder()
let buffer = ''

type Pending = {
  id: string
  timer: ReturnType<typeof setTimeout>
  resolve: () => void
}

const pendingById = new Map<string, Pending>()

function writeEvent(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(event) + '\n')
}

function cancelPending(id: string): void {
  const pending = pendingById.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingById.delete(id)
  pending.resolve()
}

async function waitOrAbort(id: string, ms: number): Promise<'timeout' | 'aborted'> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingById.delete(id)
      resolve('timeout')
    }, ms)
    pendingById.set(id, {
      id,
      timer,
      resolve: () => resolve('aborted'),
    })
  })
}

async function processLine(line: string): Promise<void> {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg: {
    type?: string
    id?: string
    messages?: Array<{ role?: string; content?: string }>
  }
  try {
    msg = JSON.parse(trimmed) as typeof msg
  } catch {
    return
  }

  if (msg.type === 'abort' && typeof msg.id === 'string') {
    cancelPending(msg.id)
    return
  }

  if (msg.type === 'turn' && typeof msg.id === 'string') {
    const content = msg.messages?.[0]?.content ?? ''
    if (content === 'slow') {
      await waitOrAbort(msg.id, 5000)
      // Parent aborts; do not emit done so hang would surface without CcbSlot fix.
      return
    }
    writeEvent({ type: 'text-delta', content: 'pong', id: msg.id })
    writeEvent({ type: 'done', messageId: 'x', id: msg.id })
  }
}

for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true })
  let idx: number
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx)
    buffer = buffer.slice(idx + 1)
    await processLine(line)
  }
}
