import type { OnionLayerConfig } from '@harness/protocol'
import type { AuditEntry, OnionMiddleware } from '../types.ts'

export function createAuditMiddleware(layer: OnionLayerConfig): OnionMiddleware {
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
