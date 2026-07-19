import { join, resolve } from 'node:path'
import type {
  AgentSlot,
  SlotEvent,
  SlotSessionConfig,
} from '@harness/slot'
import {
  DEFAULT_BUILD_FEATURES,
  getMacroDefines,
} from '../../../../ccb/scripts/defines.ts'
import { encodeJsonl, parseJsonlLine } from './jsonl.ts'

export interface CcbSlotOptions {
  workspaceRoot: string
  /** Override spawn binary (tests inject bun + fake-agent). */
  spawnCommand?: string
  spawnArgs?: string[]
  env?: Record<string, string | undefined>
  cwd?: string
  /**
   * Max concurrent CCB child processes. Extra turns queue until a worker is free.
   * Default: `HARNESS_CCB_POOL_SIZE` or 2.
   */
  poolSize?: number
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

type Waiter = {
  onEvent: (event: SlotEvent) => void
  resolve: () => void
  reject: (err: Error) => void
}

type PoolWorker = {
  index: number
  child: ReturnType<typeof Bun.spawn> | null
  stdoutBuffer: string
  busy: boolean
  currentTurnId: string | null
  currentTurnSignal: AbortSignal | null
  turnAbort: AbortController | null
  waiters: Map<string, Waiter>
}

type QueuedTurn = {
  messages: Array<{ role: string; content: string }>
  onEvent: (event: SlotEvent) => void
  signal?: AbortSignal
  resolve: () => void
}

/** Absolute path to CCB stdio bridge entry (monorepo-anchored, not workspaceRoot). */
export function resolveCcbBridgePath(): string {
  if (process.env.HARNESS_CCB_BRIDGE) {
    return process.env.HARNESS_CCB_BRIDGE
  }
  // This file: apps/control/src/slot → monorepo root is ../../../..
  return resolve(import.meta.dir, '../../../../ccb/src/harness/stdioBridge.ts')
}

/**
 * Default `bun` argv for the CCB bridge: MACRO.* `-d` defines, `--feature`
 * flags (same set as `ccb` `bun run dev`), then bridge path.
 */
export function defaultCcbSpawnArgs(
  bridgePath: string = resolveCcbBridgePath(),
): string[] {
  const defineArgs = Object.entries(getMacroDefines()).flatMap(([k, v]) => [
    '-d',
    `${k}:${v}`,
  ])
  const envFeatures = Object.entries(process.env)
    .filter(([k, v]) => k.startsWith('FEATURE_') && v === '1')
    .map(([k]) => k.replace('FEATURE_', ''))
  const allFeatures = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]
  const featureArgs = allFeatures.flatMap(name => ['--feature', name])
  return [...defineArgs, ...featureArgs, bridgePath]
}

function defaultEnv(workspaceRoot: string): Record<string, string> {
  const port = process.env.CONTROL_PORT || '3100'
  return {
    HARNESS_ONION_MCP: '1',
    HARNESS_CONTROL_MCP: 'stdio',
    HARNESS_CONTROL_URL: `http://127.0.0.1:${port}`,
    HARNESS_WORKSPACE: workspaceRoot,
    CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: join(workspaceRoot, '.harness', 'memory'),
  }
}

function resolvePoolSize(opts: CcbSlotOptions): number {
  if (typeof opts.poolSize === 'number' && opts.poolSize >= 1) {
    return Math.floor(opts.poolSize)
  }
  const fromEnv = Number(process.env.HARNESS_CCB_POOL_SIZE)
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.floor(fromEnv)
  return 2
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
  private readonly poolSize: number
  private session: SlotSessionConfig | null = null
  private readonly workers: PoolWorker[] = []
  private readonly queue: QueuedTurn[] = []

  constructor(opts: CcbSlotOptions) {
    this.opts = opts
    this.poolSize = resolvePoolSize(opts)
  }

  async initSession(config: SlotSessionConfig): Promise<void> {
    this.session = config
  }

  getSession(): SlotSessionConfig | null {
    return this.session
  }

  abort(signal?: AbortSignal): void {
    if (signal !== undefined) {
      // Drop matching queued turns without touching in-flight workers.
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const item = this.queue[i]
        if (item?.signal === signal) {
          this.queue.splice(i, 1)
          this.emitAborted(item.onEvent)
          item.resolve()
        }
      }
      const worker = this.workers.find(w => w.currentTurnSignal === signal)
      if (worker) this.abortWorker(worker)
      return
    }
    for (const worker of this.workers) {
      if (worker.busy) this.abortWorker(worker)
    }
  }

  /** Kill all child processes (tests / shutdown). Not part of AgentSlot. */
  dispose(): void {
    for (const item of this.queue.splice(0)) {
      this.emitAborted(item.onEvent)
      item.resolve()
    }
    for (const worker of this.workers) {
      worker.turnAbort?.abort()
      if (worker.child) {
        try {
          worker.child.kill()
        } catch {
          // already dead
        }
        worker.child = null
      }
      for (const [, w] of worker.waiters) {
        w.resolve()
      }
      worker.waiters.clear()
      worker.busy = false
      worker.currentTurnId = null
      worker.currentTurnSignal = null
    }
    this.workers.length = 0
  }

  async sendMessageWithHistory(
    messages: Array<{ role: string; content: string }>,
    onEvent: (event: SlotEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      this.emitAborted(onEvent)
      return
    }

    return new Promise<void>(resolve => {
      const tryStart = () => {
        if (signal?.aborted) {
          this.emitAborted(onEvent)
          resolve()
          return
        }
        const worker = this.acquireWorker()
        if (!worker) {
          this.queue.push({ messages, onEvent, signal, resolve })
          return
        }
        void this.runTurnOnWorker(worker, messages, onEvent, signal).finally(
          () => {
            this.releaseWorker(worker)
            resolve()
            this.pumpQueue()
          },
        )
      }
      tryStart()
    })
  }

  private pumpQueue(): void {
    while (this.queue.length > 0) {
      const worker = this.acquireWorker()
      if (!worker) return
      const next = this.queue.shift()
      if (!next) {
        this.releaseWorker(worker)
        return
      }
      if (next.signal?.aborted) {
        this.emitAborted(next.onEvent)
        next.resolve()
        this.releaseWorker(worker)
        continue
      }
      void this.runTurnOnWorker(
        worker,
        next.messages,
        next.onEvent,
        next.signal,
      ).finally(() => {
        this.releaseWorker(worker)
        next.resolve()
        this.pumpQueue()
      })
    }
  }

  private acquireWorker(): PoolWorker | null {
    const idle = this.workers.find(w => !w.busy)
    if (idle) {
      idle.busy = true
      return idle
    }
    if (this.workers.length >= this.poolSize) return null
    const worker: PoolWorker = {
      index: this.workers.length,
      child: null,
      stdoutBuffer: '',
      busy: true,
      currentTurnId: null,
      currentTurnSignal: null,
      turnAbort: null,
      waiters: new Map(),
    }
    this.workers.push(worker)
    return worker
  }

  private releaseWorker(worker: PoolWorker): void {
    worker.busy = false
    worker.currentTurnId = null
    worker.currentTurnSignal = null
    worker.turnAbort = null
  }

  private abortWorker(worker: PoolWorker): void {
    const id = worker.currentTurnId
    if (id && worker.child?.stdin) {
      try {
        const cmd: AbortCommand = { type: 'abort', id }
        worker.child.stdin.write(encodeJsonl(cmd))
      } catch {
        // ignore write failures on abort
      }
    }
    worker.turnAbort?.abort()
  }

  private emitAborted(onEvent: (event: SlotEvent) => void): void {
    onEvent({ type: 'error', message: 'Agent Slot / CCB 不可用: aborted' })
  }

  private clearWorkerTurn(worker: PoolWorker, id: string): void {
    if (worker.currentTurnId === id) {
      worker.currentTurnId = null
      worker.currentTurnSignal = null
    }
  }

  private async runTurnOnWorker(
    worker: PoolWorker,
    messages: Array<{ role: string; content: string }>,
    onEvent: (event: SlotEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const workspaceRoot =
      this.session?.workspaceRoot ?? this.opts.workspaceRoot
    const id = crypto.randomUUID()
    worker.currentTurnId = id
    worker.currentTurnSignal = signal ?? null
    worker.turnAbort = new AbortController()
    const localAbort = worker.turnAbort

    const onAbort = () => this.abortWorker(worker)
    if (signal) {
      if (signal.aborted) {
        this.emitAborted(onEvent)
        this.clearWorkerTurn(worker, id)
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      await this.ensureWorkerChild(worker, workspaceRoot)
    } catch (err) {
      onEvent({
        type: 'error',
        message: `Agent Slot / CCB 不可用: ${err instanceof Error ? err.message : String(err)}`,
      })
      this.clearWorkerTurn(worker, id)
      if (signal) signal.removeEventListener('abort', onAbort)
      return
    }

    if (signal?.aborted || localAbort.signal.aborted) {
      this.emitAborted(onEvent)
      this.clearWorkerTurn(worker, id)
      if (signal) signal.removeEventListener('abort', onAbort)
      return
    }

    const child = worker.child
    if (!child?.stdin) {
      onEvent({
        type: 'error',
        message: 'Agent Slot / CCB 不可用: child stdin unavailable',
      })
      this.clearWorkerTurn(worker, id)
      if (signal) signal.removeEventListener('abort', onAbort)
      return
    }

    await new Promise<void>((resolve, reject) => {
      const settleAbort = () => {
        const w = worker.waiters.get(id)
        if (!w) {
          resolve()
          return
        }
        worker.waiters.delete(id)
        w.onEvent({
          type: 'error',
          message: 'Agent Slot / CCB 不可用: aborted',
        })
        w.resolve()
      }

      if (localAbort.signal.aborted || signal?.aborted) {
        this.emitAborted(onEvent)
        resolve()
        return
      }

      worker.waiters.set(id, { onEvent, resolve, reject })
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
        worker.waiters.delete(id)
        onEvent({
          type: 'error',
          message: `Agent Slot / CCB 不可用: ${err instanceof Error ? err.message : String(err)}`,
        })
        resolve()
        return
      }

      if (localAbort.signal.aborted || signal?.aborted) {
        settleAbort()
      }
    }).finally(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      this.clearWorkerTurn(worker, id)
    })
  }

  private async ensureWorkerChild(
    worker: PoolWorker,
    workspaceRoot: string,
  ): Promise<void> {
    if (worker.child && !worker.child.killed) {
      const exitCode = worker.child.exitCode
      if (exitCode === null) return
      worker.child = null
    }

    const command = this.opts.spawnCommand ?? process.execPath
    const args = this.opts.spawnArgs ?? defaultCcbSpawnArgs()
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
      throw new Error(err instanceof Error ? err.message : String(err))
    }

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

    worker.child = child
    void this.pumpStdout(worker, child)
    void child.exited.then(() => {
      if (worker.child === child) worker.child = null
      for (const [tid, w] of worker.waiters) {
        worker.waiters.delete(tid)
        w.onEvent({
          type: 'error',
          message: 'Agent Slot / CCB 不可用: child process exited',
        })
        w.resolve()
      }
    })
  }

  private async pumpStdout(
    worker: PoolWorker,
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
        worker.stdoutBuffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = worker.stdoutBuffer.indexOf('\n')) >= 0) {
          const line = worker.stdoutBuffer.slice(0, nl)
          worker.stdoutBuffer = worker.stdoutBuffer.slice(nl + 1)
          this.handleStdoutLine(worker, line)
        }
      }
    } catch {
      // reader cancelled / process killed
    }
  }

  private handleStdoutLine(worker: PoolWorker, line: string): void {
    const parsed = parseJsonlLine(line)
    if (!parsed || typeof parsed !== 'object') return
    const raw = parsed as ChildEvent
    const id = raw.id
    if (typeof id !== 'string') return
    const waiter = worker.waiters.get(id)
    if (!waiter) return
    const event = toSlotEvent(raw)
    if (!event) return
    waiter.onEvent(event)
    if (event.type === 'done' || event.type === 'error') {
      worker.waiters.delete(id)
      waiter.resolve()
    }
  }
}
