import type { ShellTab } from './shellTabs'

/** Chat stays mounted; wrapper uses HTML `hidden` when this is true. */
export function isChatPanelHidden(activeTab: ShellTab): boolean {
  return activeTab !== 'chat'
}

/** True when Settings / Skills / a widget tab is active (not Chat). */
export function isNonChatShellTab(activeTab: ShellTab): boolean {
  return activeTab !== 'chat'
}
