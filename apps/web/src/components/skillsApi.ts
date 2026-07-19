const BASE = '/api/skills'

export type SkillSource = 'runtime' | 'factory'
export type SkillZone = 'staging' | 'published'

export type SkillListItem = {
  id: string
  name: string
  description: string
  source: SkillSource
  zone?: SkillZone
  enabled: boolean
  installed: boolean
}

export type SkillDetail = SkillListItem & {
  skillMd: string
}

export type SkillsOk<T> = { ok: true; data: T }
export type SkillsErr = {
  ok: false
  status: number
  error: { code?: string; message: string }
}
export type SkillsResult<T> = SkillsOk<T> | SkillsErr

export function skillsRunError(err: unknown): { code?: string; message: string } {
  return { message: err instanceof Error ? err.message : String(err) }
}

export async function skillsFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<SkillsResult<T>> {
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

export function listSkills(opts?: {
  enabledOnly?: boolean
}): Promise<SkillsResult<SkillListItem[]>> {
  return skillsFetch<SkillListItem[]>(
    opts?.enabledOnly ? '?enabled=true' : '',
  )
}

export function getSkill(
  id: string,
  opts?: { source?: SkillSource; zone?: SkillZone },
): Promise<SkillsResult<SkillDetail>> {
  const params = new URLSearchParams()
  if (opts?.source) params.set('source', opts.source)
  if (opts?.zone) params.set('zone', opts.zone)
  const qs = params.toString()
  return skillsFetch<SkillDetail>(
    `/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
  )
}

export function enableSkill(
  id: string,
  body: { source: SkillSource; zone?: SkillZone },
): Promise<SkillsResult<SkillListItem>> {
  return skillsFetch<SkillListItem>(`/${encodeURIComponent(id)}/enable`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function disableSkill(id: string): Promise<SkillsResult<SkillListItem>> {
  return skillsFetch<SkillListItem>(`/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
  })
}
