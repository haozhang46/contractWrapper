export type CapabilityLevel = 'L1' | 'L2' | 'L3'

export type OnionLayerType =
  | 'audit'
  | 'capability-gate'
  | 'require-confirm'
  | 'path-sandbox'
  | 'network-allowlist'
  | 'deny-pattern'
  | 'custom'

export interface OnionLayerConfig {
  id: string
  type: OnionLayerType
  name: string
  enabled: boolean
  priority: number
  config: Record<string, unknown>
}

export interface ContractOnion {
  version: 1
  layers: OnionLayerConfig[]
}

export type OnionLayer =
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'builtin'
      type: OnionLayerType
      config: Record<string, unknown>
    }
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'js'
      source: string
    }

export interface NamedOnion {
  version: 1
  id: string
  name: string
  layers: OnionLayer[]
}

export interface OnionListItem {
  id: string
  name: string
  layerCount: number
  isDefault: boolean
}

export function isDefaultOnionId(id: string): boolean {
  return id === 'default'
}

export function toBuiltinLayer(legacy: OnionLayerConfig): OnionLayer {
  return {
    id: legacy.id,
    name: legacy.name,
    enabled: legacy.enabled,
    priority: legacy.priority,
    kind: 'builtin',
    type: legacy.type,
    config: legacy.config,
  }
}

export interface CapabilityGateConfig {
  level: CapabilityLevel
  allowedTools?: string[]
  disallowedTools?: string[]
}

export interface AuthorizeRequest {
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  /** optional display hint */
  description?: string
  onionId?: string
}

export type AuthorizeDecision = 'allow' | 'deny' | 'needs_confirm'

export interface AuthorizeResult {
  decision: AuthorizeDecision
  requestId?: string
  message?: string
  reason?: string
}

export interface WaitResolveRequest {
  requestId: string
  /** ms; default 60000 on server */
  timeoutMs?: number
}

export interface WaitResolveResult {
  decision: 'allow' | 'deny'
  reason?: string
}

export function isAuthorizeResult(v: unknown): v is AuthorizeResult {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.decision !== 'allow' && o.decision !== 'deny' && o.decision !== 'needs_confirm') {
    return false
  }
  if (o.decision === 'needs_confirm' && typeof o.requestId !== 'string') {
    return false
  }
  return true
}
