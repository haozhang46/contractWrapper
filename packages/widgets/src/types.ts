import type { ReactElement } from 'react'

export type WidgetDefinition = {
  id: string
  title: string
  order?: number
  /** Sync factory; shell calls on each render of the active tab. */
  mount: () => ReactElement
}
