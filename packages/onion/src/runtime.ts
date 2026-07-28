import type {
  CapabilityGateConfig,
  CapabilityLevel,
  ContractOnion,
  OnionLayerConfig,
} from '@harness/protocol'
import { createAuditMiddleware } from './layers/audit.ts'
import {
  classifyToolCapability,
  createCapabilityGateMiddleware,
  parseCapabilityGateConfig,
} from './layers/capabilityGate.ts'
import { migrateOnionLayers } from './layers/migrate.ts'
import { DEFAULT_ONION_LAYERS } from './defaultLayers.ts'
import type {
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
  private gateConfig: CapabilityGateConfig | null = null
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
      // Terminal default: allow continues through pipe; unset → allow.
      ctx.decision = ctx.decision ?? 'allow'
    })

    const decision = ctx.decision ?? 'deny'

    return {
      decision,
      auditTrail: ctx.auditTrail,
      message: ctx.message,
    }
  }

  classify(toolName: string): CapabilityLevel {
    if (!this.initialized) {
      this.load(null)
    }
    const config =
      this.gateConfig ??
      parseCapabilityGateConfig(
        DEFAULT_ONION_LAYERS.find(l => l.type === 'capability-gate')!.config,
      )
    return classifyToolCapability(toolName, config)
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
    const migrated = migrateOnionLayers(raw)
    const hasAudit = migrated.some(l => l.type === 'audit' && l.enabled)
    this.layers = hasAudit
      ? [...migrated].sort((a, b) => a.priority - b.priority)
      : [
          ...DEFAULT_ONION_LAYERS.filter(l => l.type === 'audit'),
          ...migrated,
        ].sort((a, b) => a.priority - b.priority)

    this.cacheGateConfig()
    this.rebuildMiddlewares()
    this.initialized = true
  }

  private cacheGateConfig(): void {
    const gate = this.layers.find(l => l.type === 'capability-gate' && l.enabled)
    this.gateConfig = gate
      ? parseCapabilityGateConfig(gate.config)
      : null
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
        return createAuditMiddleware(layer)
      case 'capability-gate':
        return createCapabilityGateMiddleware(layer)
      default:
        return async (_ctx, next) => {
          await next()
        }
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
