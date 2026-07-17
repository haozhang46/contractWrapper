/** JSONL encode/decode for CcbSlot ↔ child stdio protocol. */

export function encodeJsonl(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

/** Parse one line; returns null for empty or non-JSON lines. */
export function parseJsonlLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}
