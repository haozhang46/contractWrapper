import { describe, expect, test } from 'bun:test'
import { isChatPanelHidden, isNonChatShellTab } from '../shellChatVisibility'

describe('shellChatVisibility', () => {
  test('chat tab keeps panel visible and is not a non-chat tab', () => {
    expect(isChatPanelHidden('chat')).toBe(false)
    expect(isNonChatShellTab('chat')).toBe(false)
  })

  test('settings / skills / widget tabs hide chat and count as non-chat', () => {
    for (const tab of ['settings', 'skills', 'skill-factory'] as const) {
      expect(isChatPanelHidden(tab)).toBe(true)
      expect(isNonChatShellTab(tab)).toBe(true)
    }
  })
})
