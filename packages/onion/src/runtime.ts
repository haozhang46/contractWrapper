import type { ContractOnion, OnionLayerConfig } from '@harness/protocol'
import { classifyToolCapability } from './classifyToolCapability.ts'
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

export class OnionRuntime {
  private layers: OnionLayerConfig[] = []
  private middlewares: OnionMiddleware[] = []
  private initialized = false

  load(contract: ContractOnion | null): void {
    const raw = contract?.layers?.length
      ? contract.layers
      : DEFAULT_ONION_LAYERS
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

  getLayers(): OnionLayerConfig[] {
    return this.layers
  }

  updateLayers(layers: OnionLayerConfig[]): void {
    this.applyLayers(layers)
  }

  toContract(): ContractOnion {
    return {
      version: 1,
      layers: this.layers,
    }
  }

  private applyLayers(raw: OnionLayerConfig[]): void {
    const hasAudit = raw.some(l => l.type === 'audit' && l.enabled)
    this.layers = hasAudit
      ? [...raw].sort((a, b) => a.priority - b.priority)
      : [...DEFAULT_ONION_LAYERS.filter(l => l.type === 'audit'), ...raw].sort(
          (a, b) => a.priority - b.priority,
        )

    this.rebuildMiddlewares()
    this.initialized = true
  }

  private rebuildMiddlewares(): void {
    const enabled = this.layers.filter(l => l.enabled)
    const nonAuditEnabled = enabled.filter(l => l.type !== 'audit')
    if (nonAuditEnabled.length === 0) {
      this.middlewares = [this.createDenyAllMiddleware()]
    } else {
      this.middlewares = enabled.map(l => this.layerToMiddleware(l))
    }
  }

  private layerToMiddleware(layer: OnionLayerConfig): OnionMiddleware {
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

  private createAuditMiddleware(layer: OnionLayerConfig): OnionMiddleware {
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
    _layer: OnionLayerConfig,
  ): OnionMiddleware {
    return async (ctx, next) => {
      const toolCapabilityLevel = classifyToolCapability(ctx.toolName)

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
    layer: OnionLayerConfig,
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

}
