import type { WidgetDefinition } from './types.ts'

const DEFAULT_ORDER = 100
const widgets = new Map<string, WidgetDefinition>()

export function registerWidget(def: WidgetDefinition): void {
  if (widgets.has(def.id)) {
    console.warn(`[widgets] overwriting widget id="${def.id}"`)
  }
  widgets.set(def.id, def)
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return widgets.get(id)
}

export function listWidgets(): WidgetDefinition[] {
  return [...widgets.values()].sort((a, b) => {
    const oa = a.order ?? DEFAULT_ORDER
    const ob = b.order ?? DEFAULT_ORDER
    if (oa !== ob) return oa - ob
    return a.id.localeCompare(b.id)
  })
}

export function clearWidgetsForTests(): void {
  widgets.clear()
}
