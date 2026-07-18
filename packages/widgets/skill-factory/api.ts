const BASE = '/api/skill-factory'

export type SfOk<T> = { ok: true; data: T }
export type SfErr = {
  ok: false
  status: number
  error: { code?: string; message: string }
}
export type SfResult<T> = SfOk<T> | SfErr

export function sfRunError(err: unknown): { code?: string; message: string } {
  return { message: err instanceof Error ? err.message : String(err) }
}

export async function sfFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<SfResult<T>> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const body = (await res.json()) as {
    ok?: boolean
    data?: T
    error?: { code?: string; message?: string }
  }

  if (body.ok === true) {
    return { ok: true, data: body.data as T }
  }

  return {
    ok: false,
    status: res.status,
    error: {
      code: body.error?.code,
      message: body.error?.message ?? (res.statusText || 'Request failed'),
    },
  }
}
