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
