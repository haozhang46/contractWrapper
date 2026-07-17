import type { ApiHeadlessSettings } from '../types/api'

export interface HeadlessSettingsDTO {
  autoAllow: boolean
}

export function toHeadlessSettings(raw: ApiHeadlessSettings): HeadlessSettingsDTO {
  return {
    autoAllow: raw.autoAllow,
  }
}
