/**
 * Fake CCB stdio agent for CcbSlot tests.
 * Reads JSONL from stdin; on `turn`, emits text-delta + done with matching id.
 */
const decoder = new TextDecoder()
let buffer = ''

async function processLine(line: string): Promise<void> {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg: { type?: string; id?: string }
  try {
    msg = JSON.parse(trimmed) as { type?: string; id?: string }
  } catch {
    return
  }
  if (msg.type === 'turn' && typeof msg.id === 'string') {
    process.stdout.write(
      JSON.stringify({ type: 'text-delta', content: 'pong', id: msg.id }) + '\n',
    )
    process.stdout.write(
      JSON.stringify({ type: 'done', messageId: 'x', id: msg.id }) + '\n',
    )
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
