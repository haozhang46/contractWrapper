import { join } from 'node:path'
import type {
  AgentSlot,
  SlotEvent,
  SlotSessionConfig,
} from '@harness/slot'
import { encodeJsonl, parseJsonlLine } from './jsonl.ts'

export interface CcbSlotOptions {
  workspaceRoot: string
  /** Override spawn binary (tests inject bun + fake-agent). */
  spawnCommand?: string
  spawnArgs?: string[]
  env?: Record<string, string | undefined>
  cwd?: string
}

type TurnCommand = {
  type: 'turn'
  id: string
  messages: Array<{ role: string; content: string }>
  workspaceRoot: string
}

type AbortCommand = {
  type: 'abort'
  id: string
}

type ChildEvent = SlotEvent & { id?: string }

function bridgePath(workspaceRoot: string): string {
  return join(workspaceRoot, 'ccb/src/harness/stdioBridge.ts')
}

function defaultEnv(workspaceRoot: string): Record<string, string> {
  const port = process.env.CONTROL_PORT || '3100'
  return {
    HARNESS_ONION_MCP: '1',
    // stdio gates getControlMcpClient in CCB; onion transport to Control is HTTP (Task 5).
    HARNESS_CONTROL_MCP: 'stdio',
    HARNESS_CONTROL_URL: `http://127.0.0.1:${port}`,
    HARNESS_WORKSPACE: workspaceRoot,
  }
}

function toSlotEvent(raw: ChildEvent): SlotEvent | null {
  const { id: _id, ...rest } = raw
  if (!rest || typeof rest !== 'object' || !('type' in rest)) return null
  const type = (rest as { type: unknown }).type
  if (
    type === 'text-delta' ||
    type === 'tool-call' ||
    type === 'tool-result' ||
    type === 'done' ||
    type === 'error'
  ) {
    return rest as SlotEvent
  }
  return null
}

export class CcbSlot implements AgentSlot {
  private readonly opts: CcbSlotOptions
  private session: SlotSessionConfig | null = null
  private child: ReturnType<typeof Bun.spawn> | null = null
  private stdoutBuffer = ''
  // Serial turn queue. Turn timeout (abort + error after N ms) is deferred —
  // out of this slice; callers may still abort via AbortSignal / abort().
  private turnChain: Promise<void> = Promise.resolve()
  private currentTurnId: string | null = null
  private currentTurnSignal: AbortSignal | null = null
  private turnAbort: AbortController | null = null
  private readonly waiters = new Map<
    string,
    {
      onEvent: (event: SlotEvent) => void
      resolve: () => void
      reject: (err: Error) => void
    }
  >()

  constructor(opts: CcbSlotOptions) {
    this.opts = opts
  }

  async initSession(config: SlotSessionConfig): Promise<void> {
    this.session = config
  }

  getSession(): SlotSessionConfig | null {
    return this.session
  }

  abort(signal?: AbortSignal): void {
    // Scoped abort: ignore disconnects that belong to a queued (non-current) turn.
    if (signal !== undefined && this.currentTurnSignal !== signal) {
      return
    }
    const id = this.currentTurnId
    if (id && this.child?.stdin) {
      try {
        const cmd: AbortCommand = { type: 'abort', id }
        this.child.stdin.write(encodeJsonl(cmd))
      } catch {
        // ignore write failures on abort
      }
    }
    this.turnAbort?.abort()
  }

  /** Kill the child process (tests / shutdown). Not part of AgentSlot. */
  dispose(): void {
    this.turnAbort?.abort()
    if (this.child) {
      try {
        this.child.kill()
      } catch {
        // already dead
      }
      this.child = null
    }
    for (const [, w] of this.waiters) {
      w.resolve()
    }
    this.waiters.clear()
  }

  async sendMessageWithHistory(
    messages: Array<{ role: string; content: string }>,
    onEvent: (event: SlotEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    // Short-circuit queued turns whose client already disconnected — do not
    // touch the in-flight turn (currentTurnId / turnAbort).
    const run = async () => {
      if (signal?.aborted) {
        this.emitAborted(onEvent)
        return
      }
      await this.runTurn(messages, onEvent, signal)
    }
    const next = this.turnChain.then(run, run)
    this.turnChain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private emitAborted(onEvent: (event: SlotEvent) => void): void {
    onEvent({ type: 'error', message: 'Agent Slot / CCB 不可用: aborted' })
  }

  private clearCurrentTurn(id: string): void {
    if (this.currentTurnId === id) {
      this.currentTurnId = null
      this.currentTurnSignal = null
    }
  }

  private async runTurn(
    messages: Array<{ role: string; content: string }>,
    onEvent: (event: SlotEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const workspaceRoot =
      this.session?.workspaceRoot ?? this.opts.workspaceRoot
    const id = crypto.randomUUID()
    this.currentTurnId = id
    this.currentTurnSignal = signal ?? null
    this.turnAbort = new AbortController()
    const localAbort = this.turnAbort

    const onAbort = () => this.abort(signal)
    if (signal) {
      if (signal.aborted) {
        this.emitAborted(onEvent)
        this.clearCurrentTurn(id)
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      await this.ensureChild(workspaceRoot)
    } catch (err) {
      onEvent({
        type: 'error',
        message: `Agent Slot / CCB 不可用: ${err instanceof Error ? err.message : String(err)}`,
      })
      this.clearCurrentTurn(id)
      if (signal) signal.removeEventListener('abort', onAbort)
      return
    }

    // Abort may have fired during ensureChild before waiter was registered.
    if (signal?.aborted || localAbort.signal.aborted) {
      this.emitAborted(onEvent)
      this.clearCurrentTurn(id)
      if (signal) signal.removeEventListener('abort', onAbort)
      return
    }

    const child = this.child
    if (!child?.stdin) {
      onEvent({
        type: 'error',
        message: 'Agent Slot / CCB 不可用: child stdin unavailable',
      })
      this.clearCurrentTurn(id)
      if (signal) signal.removeEventListener('abort', onAbort)
      return
    }

    await new Promise<void>((resolve, reject) => {
      const settleAbort = () => {
        const w = this.waiters.get(id)
        if (!w) {
          resolve()
          return
        }
        this.waiters.delete(id)
        w.onEvent({
          type: 'error',
          message: 'Agent Slot / CCB 不可用: aborted',
        })
        w.resolve()
      }

      // Account for pre-aborted controller: addEventListener('abort') never runs.
      if (localAbort.signal.aborted || signal?.aborted) {
        this.emitAborted(onEvent)
        resolve()
        return
      }

      this.waiters.set(id, { onEvent, resolve, reject })
      localAbort.signal.addEventListener('abort', settleAbort, { once: true })

      const cmd: TurnCommand = {
        type: 'turn',
        id,
        messages,
        workspaceRoot,
      }
      try {
        child.stdin!.write(encodeJsonl(cmd))
      } catch (err) {
        this.waiters.delete(id)
        onEvent({
          type: 'error',
          message: `Agent Slot / CCB 不可用: ${err instanceof Error ? err.message : String(err)}`,
        })
        resolve()
        return
      }

      // Re-check after write: abort may have raced with listener registration.
      if (localAbort.signal.aborted || signal?.aborted) {
        settleAbort()
      }
    }).finally(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      this.clearCurrentTurn(id)
    })
  }

  private async ensureChild(workspaceRoot: string): Promise<void> {
    if (this.child && !this.child.killed) {
      const exitCode = this.child.exitCode
      if (exitCode === null) return
      this.child = null
    }

    const command = this.opts.spawnCommand ?? process.execPath
    const args =
      this.opts.spawnArgs ?? [bridgePath(workspaceRoot)]
    const cwd = this.opts.cwd ?? workspaceRoot
    const env: Record<string, string | undefined> = {
      ...process.env,
      ...defaultEnv(workspaceRoot),
      ...this.opts.env,
    }

    let child: ReturnType<typeof Bun.spawn>
    try {
      child = Bun.spawn([command, ...args], {
        cwd,
        env,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      })
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : String(err),
      )
    }

    // Detect immediate spawn failure (e.g. ENOENT) via short race with exit.
    const failedFast = await Promise.race([
      child.exited.then(code => ({ kind: 'exit' as const, code })),
      Bun.sleep(50).then(() => ({ kind: 'ok' as const })),
    ])
    if (failedFast.kind === 'exit' && failedFast.code !== 0) {
      const errText = child.stderr
        ? await new Response(child.stderr).text().catch(() => '')
        : ''
      throw new Error(
        errText.trim() ||
          `spawn exited with code ${failedFast.code} (${command})`,
      )
    }

    this.child = child
    void this.pumpStdout(child)
    void child.exited.then(() => {
      if (this.child === child) this.child = null
      for (const [id, w] of this.waiters) {
        this.waiters.delete(id)
        w.onEvent({
          type: 'error',
          message: 'Agent Slot / CCB 不可用: child process exited',
        })
        w.resolve()
      }
    })
  }

  private async pumpStdout(
    child: ReturnType<typeof Bun.spawn>,
  ): Promise<void> {
    const stdout = child.stdout
    if (!stdout || typeof stdout === 'number') return
    const reader = stdout.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        this.stdoutBuffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = this.stdoutBuffer.indexOf('\n')) >= 0) {
          const line = this.stdoutBuffer.slice(0, nl)
          this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1)
          this.handleStdoutLine(line)
        }
      }
    } catch {
      // reader cancelled / process killed
    }
  }

  private handleStdoutLine(line: string): void {
    const parsed = parseJsonlLine(line)
    if (!parsed || typeof parsed !== 'object') return
    const raw = parsed as ChildEvent
    const id = raw.id
    if (typeof id !== 'string') return
    const waiter = this.waiters.get(id)
    if (!waiter) return
    const event = toSlotEvent(raw)
    if (!event) return
    waiter.onEvent(event)
    if (event.type === 'done' || event.type === 'error') {
      this.waiters.delete(id)
      waiter.resolve()
    }
  }
}
