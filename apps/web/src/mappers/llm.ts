import type { ApiLLMSettings } from '../types/api'

export interface LLMSettingsDTO {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

export function toLLMSettings(raw: ApiLLMSettings): LLMSettingsDTO {
  return {
    provider: raw.provider,
    model: raw.model,
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey,
  }
}
