import { listWidgets, type WidgetDefinition } from '@harness/widgets'

export type FixedTab = 'chat' | 'settings' | 'skills'
export type ShellTab = FixedTab | string

export function getDynamicWidgets(): WidgetDefinition[] {
  return listWidgets()
}

export function isFixedTab(tab: ShellTab): tab is FixedTab {
  return tab === 'chat' || tab === 'settings' || tab === 'skills'
}
