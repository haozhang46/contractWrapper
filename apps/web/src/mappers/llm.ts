import type { ApiLLMSettings, EndpointMode } from '../types/api'

export interface LLMSettingsDTO {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  endpointMode: EndpointMode
}

export function toLLMSettings(raw: ApiLLMSettings): LLMSettingsDTO {
  return {
    provider: raw.provider,
    model: raw.model,
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey,
    endpointMode: raw.endpointMode ?? 'cloud',
  }
}
