import type { ReactElement } from 'react'
import HeadlessSettings from './HeadlessSettings'
import LLMSettings from './LLMSettings'
import MemorySettings from './MemorySettings'
import OnionsPanel from './OnionsPanel'

export default function SettingsPanel(): ReactElement {
  return (
    <div className="settings">
      <h2 className="settings__title">Settings</h2>

      <section className="settings__section">
        <h3 className="settings__section-title">
          LLM Configuration
        </h3>
        <LLMSettings />
      </section>

      <section className="settings__section">
        <h3 className="settings__section-title">Agent</h3>
        <HeadlessSettings />
      </section>

      <section className="settings__section">
        <h3 className="settings__section-title">Memory</h3>
        <MemorySettings />
      </section>

      <section className="settings__section">
        <h3 className="settings__section-title">Onions</h3>
        <OnionsPanel />
      </section>
    </div>
  )
}
