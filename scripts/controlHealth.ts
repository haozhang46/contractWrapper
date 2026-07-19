export type ControlHealthResult =
  | { ok: true }
  | { ok: false; error: string }

/** Probe Control HTTP health endpoint. */
export async function checkControlHealth(
  baseUrl: string,
  opts?: { timeoutMs?: number },
): Promise<ControlHealthResult> {
  const timeoutMs = opts?.timeoutMs ?? 2_000
  const url = `${baseUrl.replace(/\/$/, '')}/api/health`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ac.signal })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as { ok?: unknown }
    if (body?.ok !== true) {
      return { ok: false, error: 'unexpected body' }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}
