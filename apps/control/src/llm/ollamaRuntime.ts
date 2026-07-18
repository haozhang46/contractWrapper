import { LOCAL_OLLAMA_ORIGIN, normalizeOllamaOrigin } from './settings.ts'

export type OllamaRuntimeStatus = 'running' | 'stopped' | 'starting' | 'error'

export type OllamaStartResult = {
  status: OllamaRuntimeStatus
  message?: string
}

export async function isOllamaReachable(
  origin: string = LOCAL_OLLAMA_ORIGIN,
  init?: { fetch?: typeof fetch; timeoutMs?: number },
): Promise<boolean> {
  const fetchFn = init?.fetch ?? globalThis.fetch
  const originNorm = normalizeOllamaOrigin(origin)
  const timeoutMs = init?.timeoutMs ?? 1500
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchFn(`${originNorm}/api/tags`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Ensure local Ollama is up. If not, launch via `open -a Ollama` (macOS)
 * and/or detached `ollama serve`, then poll until reachable.
 */
export async function ensureLocalOllamaRunning(init?: {
  fetch?: typeof fetch
  spawn?: typeof Bun.spawn
  platform?: NodeJS.Platform
  pollMs?: number
  attempts?: number
}): Promise<OllamaStartResult> {
  const fetchFn = init?.fetch
  const spawnFn = init?.spawn ?? Bun.spawn.bind(Bun)
  const platform = init?.platform ?? process.platform
  const pollMs = init?.pollMs ?? 500
  const attempts = init?.attempts ?? 20

  if (await isOllamaReachable(LOCAL_OLLAMA_ORIGIN, { fetch: fetchFn })) {
    return { status: 'running', message: 'Ollama is already running' }
  }

  const launchErrors: string[] = []

  if (platform === 'darwin') {
    try {
      const proc = spawnFn(['open', '-a', 'Ollama'], {
        stdout: 'ignore',
        stderr: 'ignore',
        stdin: 'ignore',
      })
      proc.unref()
    } catch (e) {
      launchErrors.push(
        `open -a Ollama: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  try {
    const proc = spawnFn(['ollama', 'serve'], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    })
    proc.unref()
  } catch (e) {
    launchErrors.push(
      `ollama serve: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  for (let i = 0; i < attempts; i++) {
    await sleep(pollMs)
    if (await isOllamaReachable(LOCAL_OLLAMA_ORIGIN, { fetch: fetchFn })) {
      return { status: 'running', message: 'Ollama started' }
    }
  }

  if (launchErrors.length > 0) {
    return {
      status: 'error',
      message: `Could not start Ollama (${launchErrors.join('; ')}). Install from https://ollama.com`,
    }
  }

  return {
    status: 'starting',
    message:
      'Start signal sent; Ollama is not reachable yet. Wait a few seconds and refresh models.',
  }
}
