import { describe, expect, test } from 'bun:test'
import {
  defaultCliRunner,
  probeStatus,
  runCapability,
  type CliRunner,
} from '../spawn.ts'

describe('defaultCliRunner', () => {
  test('TIMEOUT when process exceeds timeoutMs', async () => {
    const prev = process.env.DEEPTUTOR_BIN
    process.env.DEEPTUTOR_BIN = 'bun'
    try {
      await defaultCliRunner(['-e', 'await Bun.sleep(30000)'], {
        timeoutMs: 200,
        env: process.env,
      })
      throw new Error('expected throw')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('TIMEOUT')
    } finally {
      if (prev === undefined) delete process.env.DEEPTUTOR_BIN
      else process.env.DEEPTUTOR_BIN = prev
    }
  })
})

describe('probeStatus', () => {
  test('CLI_NOT_FOUND when runner fails to start', async () => {
    const runner: CliRunner = async () => {
      throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    }
    const r = await probeStatus({ check_web: false, runner })
    expect(r.cli_ok).toBe(false)
    expect(r.error?.code).toBe('CLI_NOT_FOUND')
  })

  test('cli_ok with version from --version stdout', async () => {
    const runner: CliRunner = async (argv) => {
      expect(argv).toEqual(['--version'])
      return { exitCode: 0, stdout: 'deeptutor 1.5.2\n', stderr: '' }
    }
    const r = await probeStatus({ check_web: false, runner })
    expect(r.cli_ok).toBe(true)
    expect(r.version).toContain('1.5.2')
    expect(r.error).toBeNull()
  })
})

describe('runCapability', () => {
  test('aggregates NDJSON on success', async () => {
    const runner: CliRunner = async (argv) => {
      expect(argv[0]).toBe('run')
      expect(argv).toContain('--format')
      return {
        exitCode: 0,
        stdout:
          JSON.stringify({
            type: 'done',
            session_id: 's9',
            content: 'ok',
          }) + '\n',
        stderr: '',
      }
    }
    const r = await runCapability(
      { capability: 'chat', message: 'hi' },
      { runner },
    )
    expect(r.ok).toBe(true)
    expect(r.text).toBe('ok')
    expect(r.session_id).toBe('s9')
  })

  test('TIMEOUT when runner throws timeout code', async () => {
    const runner: CliRunner = async () => {
      throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
    }
    const r = await runCapability(
      { capability: 'chat', message: 'hi' },
      { runner },
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('TIMEOUT')
  })

  test('non-zero exit returns summary', async () => {
    const runner: CliRunner = async () => ({
      exitCode: 2,
      stdout: '',
      stderr: 'boom',
    })
    const r = await runCapability(
      { capability: 'chat', message: 'hi' },
      { runner },
    )
    expect(r.ok).toBe(false)
    expect(r.exit_code).toBe(2)
    expect(r.text).toContain('boom')
  })
})
