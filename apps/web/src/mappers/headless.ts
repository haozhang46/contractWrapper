import type { ApiHeadlessSettings } from '../types/api'

export interface HeadlessSettingsDTO {
  autoAllow: boolean
  unsafeMode: boolean
}

export function toHeadlessSettings(raw: ApiHeadlessSettings): HeadlessSettingsDTO {
  return {
    autoAllow: Boolean(raw.autoAllow),
    unsafeMode: Boolean(raw.unsafeMode),
  }
}
