export function mapSkillFactoryError(err: unknown): {
  status: number
  body: { ok: false; error: { code?: string; message: string } }
} {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : undefined
  const name = err instanceof Error ? err.name : undefined

  if (code === 'FROZEN_PATH' || name === 'FrozenPathError') {
    return {
      status: 403,
      body: { ok: false, error: { code: 'FROZEN_PATH', message } },
    }
  }

  if (message.includes('skill not found')) {
    return {
      status: 404,
      body: { ok: false, error: { message } },
    }
  }

  if (
    message.includes('invalid zone') ||
    message.includes('no cases found') ||
    message.includes('path escapes') ||
    message.includes('report path must') ||
    message.includes('invalid skill id')
  ) {
    return {
      status: 400,
      body: { ok: false, error: { message } },
    }
  }

  return {
    status: 500,
    body: { ok: false, error: { message } },
  }
}
