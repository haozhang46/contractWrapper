type Ev = Record<string, unknown>

function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  return undefined
}

export function aggregateNdjson(stdout: string): {
  text: string
  session_id?: string
} {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const contentParts: string[] = []
  let session_id: string | undefined
  let doneText: string | undefined
  const raw: string[] = []

  for (const line of lines) {
    let ev: Ev
    try {
      ev = JSON.parse(line) as Ev
    } catch {
      raw.push(line)
      continue
    }
    const sid = asText(ev.session_id)
    if (sid) session_id = sid
    const typ = asText(ev.type)
    if (typ === 'done') {
      doneText =
        asText(ev.content) ?? asText(ev.text) ?? asText(ev.message) ?? doneText
      continue
    }
    if (typ === 'content') {
      const t = asText(ev.text) ?? asText(ev.content)
      if (t) contentParts.push(t)
    }
  }

  if (doneText != null && doneText.length > 0) {
    return session_id ? { text: doneText, session_id } : { text: doneText }
  }
  if (contentParts.length > 0) {
    const text = contentParts.join('')
    return session_id ? { text, session_id } : { text }
  }
  const text = raw.join('\n') || stdout.trim()
  return session_id ? { text, session_id } : { text }
}
