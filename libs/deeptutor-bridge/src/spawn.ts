import { buildRunArgs } from './args.ts'
import { aggregateNdjson } from './ndjson.ts'
import type { RunInput, RunResult, StatusResult } from './types.ts'

export type CliRunner = (
  argv: string[],
  opts: { timeoutMs: number; env: NodeJS.ProcessEnv },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export function getBridgeConfig(): {
  bin: string
  webUrl: string
  timeoutMs: number
} {
  const timeoutRaw = process.env.DEEPTUTOR_MCP_TIMEOUT_MS
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 120_000
  return {
    bin: process.env.DEEPTUTOR_BIN?.trim() || 'deeptutor',
    webUrl: process.env.DEEPTUTOR_WEB_URL?.trim() || 'http://127.0.0.1:3782',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000,
  }
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.env.DEEPTUTOR_HOME) {
    env.DEEPTUTOR_HOME = process.env.DEEPTUTOR_HOME
  }
  return env
}

export const defaultCliRunner: CliRunner = async (argv, opts) => {
  const { bin } = getBridgeConfig()
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([bin, ...argv], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: opts.env,
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'ENOENT' || /ENOENT/i.test(String(err.message))) {
      throw Object.assign(new Error(String(err.message ?? e)), { code: 'ENOENT' })
    }
    throw e
  }
  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
  }, opts.timeoutMs)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode === null) {
      throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
    }
    return { exitCode, stdout, stderr }
  } finally {
    clearTimeout(timer)
  }
}

async function withTimeoutKill(
  runner: CliRunner,
  argv: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const started = Date.now()
  try {
    return await runner(argv, { timeoutMs, env: childEnv() })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'ENOENT' || /ENOENT/i.test(String(err.message))) {
      throw Object.assign(new Error(String(err.message)), { code: 'CLI_NOT_FOUND' })
    }
    if (err.code === 'TIMEOUT' || Date.now() - started >= timeoutMs) {
      throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
    }
    throw e
  }
}

export async function probeStatus(opts?: {
  check_web?: boolean
  runner?: CliRunner
}): Promise<StatusResult> {
  const { webUrl, timeoutMs } = getBridgeConfig()
  const runner = opts?.runner ?? defaultCliRunner
  const checkWeb = opts?.check_web !== false
  let cli_ok = false
  let version: string | null = null
  let error: StatusResult['error'] = null
  try {
    const r = await withTimeoutKill(runner, ['--version'], Math.min(timeoutMs, 15_000))
    if (r.exitCode === 0) {
      cli_ok = true
      version = (r.stdout || r.stderr).trim() || null
    } else {
      error = {
        code: 'CLI_FAILED',
        message: (r.stderr || r.stdout || `exit ${r.exitCode}`).trim(),
      }
    }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    error = {
      code: err.code === 'TIMEOUT' ? 'TIMEOUT' : 'CLI_NOT_FOUND',
      message: String(err.message ?? e),
    }
  }

  let web_ok: boolean | null = null
  if (checkWeb) {
    try {
      const res = await fetch(webUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      web_ok = res.ok || res.status < 500
    } catch {
      web_ok = false
    }
  }

  return { cli_ok, version, web_ok, web_url: webUrl, error }
}

export async function runCapability(
  input: RunInput,
  opts?: { runner?: CliRunner },
): Promise<RunResult> {
  const { timeoutMs } = getBridgeConfig()
  const runner = opts?.runner ?? defaultCliRunner
  const argv = buildRunArgs(input)
  try {
    const r = await withTimeoutKill(runner, argv, timeoutMs)
    if (r.exitCode !== 0) {
      const text = [r.stderr, r.stdout].filter(Boolean).join('\n').trim()
      return {
        ok: false,
        text,
        exit_code: r.exitCode,
        error: {
          code: 'EXIT_NONZERO',
          message: `deeptutor exited with ${r.exitCode}`,
        },
      }
    }
    const agg = aggregateNdjson(r.stdout)
    return { ok: true, text: agg.text, session_id: agg.session_id, exit_code: 0 }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    const code = err.code === 'TIMEOUT' ? 'TIMEOUT' : 'CLI_NOT_FOUND'
    return {
      ok: false,
      text: '',
      error: { code, message: String(err.message ?? e) },
    }
  }
}
