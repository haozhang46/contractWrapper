import type {
  ContractOnion,
  NamedOnion,
  OnionLayer,
  OnionLayerConfig,
} from '@harness/protocol'
import { toBuiltinLayer } from '@harness/protocol'
import { compileJsLayer } from './compileJsLayer.ts'
import { DEFAULT_ONION_LAYERS } from './defaultLayers.ts'
import type {
  AuditEntry,
  EvaluateResult,
  OnionEvaluateContext,
  OnionMiddleware,
} from './types.ts'

function compose(middlewares: OnionMiddleware[]): OnionMiddleware {
  return async (ctx: OnionEvaluateContext, next: () => Promise<void>) => {
    let index = -1
    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times in onion layer')
      }
      index = i
      if (i >= middlewares.length) {
        await next()
        return
      }
      const fn = middlewares[i]
      if (fn) {
        await fn(ctx, () => dispatch(i + 1))
      } else {
        await dispatch(i + 1)
      }
    }
    await dispatch(0)
  }
}

function isBuiltinAudit(layer: OnionLayer): boolean {
  return layer.kind === 'builtin' && layer.type === 'audit'
}

function isNonAuditLayer(layer: OnionLayer): boolean {
  return layer.kind === 'js' || (layer.kind === 'builtin' && layer.type !== 'audit')
}

function toLegacyConfig(layer: OnionLayer): OnionLayerConfig {
  if (layer.kind !== 'builtin') {
    throw new Error(`Cannot convert ${layer.kind} layer to OnionLayerConfig`)
  }
  return {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    enabled: layer.enabled,
    priority: layer.priority,
    config: layer.config,
  }
}

export class OnionRuntime {
  private layers: OnionLayer[] = []
  private middlewares: OnionMiddleware[] = []
  private initialized = false

  load(contract: ContractOnion | null): void {
    const raw = contract?.layers?.length
      ? contract.layers.map(toBuiltinLayer)
      : DEFAULT_ONION_LAYERS
    this.applyLayers(raw)
  }

  loadNamed(onion: NamedOnion | null): void {
    const raw = onion?.layers?.length ? onion.layers : DEFAULT_ONION_LAYERS
    this.applyLayers(raw)
  }

  async evaluate(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<EvaluateResult> {
    if (!this.initialized) {
      this.load(null)
    }

    const ctx: OnionEvaluateContext = {
      toolName,
      input,
      decision: null,
      auditTrail: [],
    }

    if (this.middlewares.length === 0) {
      return this.denyAllResult(toolName)
    }

    const composed = compose(this.middlewares)

    await composed(ctx, async () => {
      ctx.decision = ctx.decision ?? 'allow'
    })

    const decision = ctx.decision ?? 'deny'

    return {
      decision,
      auditTrail: ctx.auditTrail,
      message: ctx.message,
    }
  }

  getLayers(): OnionLayer[] {
    return this.layers
  }

  updateLayers(layers: OnionLayerConfig[]): void {
    this.applyLayers(layers.map(toBuiltinLayer))
  }

  toContract(): ContractOnion {
    return {
      version: 1,
      layers: this.layers
        .filter((l): l is Extract<OnionLayer, { kind: 'builtin' }> => l.kind === 'builtin')
        .map(toLegacyConfig),
    }
  }

  private applyLayers(raw: OnionLayer[]): void {
    const hasAudit = raw.some(l => isBuiltinAudit(l) && l.enabled)
    this.layers = hasAudit
      ? [...raw].sort((a, b) => a.priority - b.priority)
      : [
          ...DEFAULT_ONION_LAYERS.filter(isBuiltinAudit),
          ...raw,
        ].sort((a, b) => a.priority - b.priority)

    this.rebuildMiddlewares()
    this.initialized = true
  }

  private rebuildMiddlewares(): void {
    const enabled = this.layers.filter(l => l.enabled)
    const nonAuditEnabled = enabled.filter(isNonAuditLayer)
    if (nonAuditEnabled.length === 0) {
      this.middlewares = [this.createDenyAllMiddleware()]
    } else {
      this.middlewares = enabled.map(l => this.layerToMiddleware(l))
    }
  }

  private layerToMiddleware(layer: OnionLayer): OnionMiddleware {
    if (layer.kind === 'js') {
      return this.createJsMiddleware(layer)
    }

    switch (layer.type) {
      case 'audit':
        return this.createAuditMiddleware(layer)
      case 'capability-gate':
        return this.createCapabilityGateMiddleware(layer)
      case 'require-confirm':
        return this.createRequireConfirmMiddleware(layer)
      default:
        return async (_ctx, next) => {
          await next()
        }
    }
  }

  private createJsMiddleware(
    layer: Extract<OnionLayer, { kind: 'js' }>,
  ): OnionMiddleware {
    return async (ctx, next) => {
      try {
        const mw = compileJsLayer(layer.source)
        await mw(ctx, next)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ctx.decision = 'deny'
        ctx.message = message
        ctx.auditTrail.push({
          timestamp: new Date().toISOString(),
          layerId: layer.id,
          layerType: 'custom',
          toolName: ctx.toolName,
          decision: 'deny',
          reason: message,
        })
      }
    }
  }

  private createAuditMiddleware(
    layer: Extract<OnionLayer, { kind: 'builtin' }>,
  ): OnionMiddleware {
    return async (ctx, next) => {
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        layerId: layer.id,
        layerType: 'audit',
        toolName: ctx.toolName,
        decision: 'allow',
      }
      await next()
      entry.decision = ctx.decision ?? 'deny'
      entry.reason = ctx.message
      ctx.auditTrail.push(entry)
    }
  }

  private createCapabilityGateMiddleware(
    _layer: Extract<OnionLayer, { kind: 'builtin' }>,
  ): OnionMiddleware {
    return async (ctx, next) => {
      const toolCapabilityLevel = this.classifyToolCapability(ctx.toolName)

      if (toolCapabilityLevel === 'L1') {
        await next()
        return
      }

      if (toolCapabilityLevel === 'L3') {
        ctx.decision = 'ask'
        ctx.message = `The operation "${ctx.toolName}" requires your explicit confirmation before execution.`
        return
      }

      await next()
    }
  }

  private createRequireConfirmMiddleware(
    layer: Extract<OnionLayer, { kind: 'builtin' }>,
  ): OnionMiddleware {
    return async (ctx, next) => {
      const tools = layer.config.tools as string[] | undefined
      if (tools !== undefined && tools.includes(ctx.toolName)) {
        ctx.decision = 'ask'
        ctx.message =
          (layer.config.confirmMessage as string | undefined) ??
          `Confirm ${ctx.toolName}?`
        return
      }
      await next()
    }
  }

  private createDenyAllMiddleware(): OnionMiddleware {
    return async (ctx, _next) => {
      ctx.decision = 'deny'
      ctx.message = `Permission denied: no active contract layers for ${ctx.toolName}.`
    }
  }

  private denyAllResult(toolName: string): EvaluateResult {
    return {
      decision: 'deny',
      auditTrail: [],
      message: `Permission denied: no active contract layers for ${toolName}.`,
    }
  }

  private classifyToolCapability(toolName: string): 'L1' | 'L2' | 'L3' {
    const L1_TOOLS = new Set([
      'FileRead',
      'Read',
      'FileWrite',
      'FileEdit',
      'Glob',
      'Grep',
      'TaskCreate',
      'TaskUpdate',
      'TaskList',
      'TaskGet',
      'EnterPlanMode',
      'ExitPlanModeV2',
    ])
    const L3_TOOLS = new Set([
      'Bash',
      'PowerShell',
      'REPL',
      'Agent',
      'WebFetch',
      'WebSearch',
      'CronCreate',
      'CronDelete',
      'Skill',
      'MCP',
      'EnterWorktree',
      'ExitWorktree',
    ])
    if (L3_TOOLS.has(toolName)) return 'L3'
    if (L1_TOOLS.has(toolName)) return 'L1'
    return 'L2'
  }
}
