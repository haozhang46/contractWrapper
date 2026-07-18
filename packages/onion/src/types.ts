import type { OnionLayerConfig, OnionLayerType } from '@harness/protocol'

export type { OnionLayerConfig, OnionLayerType }

export type LayerDecision = 'allow' | 'deny' | 'ask'

export interface AuditEntry {
  timestamp: string
  layerId: string
  layerType: OnionLayerType
  toolName: string
  decision: LayerDecision
  reason?: string
  detail?: string
}

export interface OnionEvaluateContext {
  toolName: string
  input: Record<string, unknown>
  decision: LayerDecision | null
  auditTrail: AuditEntry[]
  message?: string
}

export type OnionMiddleware = (
  ctx: OnionEvaluateContext,
  next: () => Promise<void>,
) => Promise<void>

export interface EvaluateResult {
  decision: LayerDecision
  auditTrail: AuditEntry[]
  message?: string
}
