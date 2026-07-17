import type { ReactElement } from 'react'
import LLMSettings from './LLMSettings'
import MemorySettings from './MemorySettings'
import OnionEditor from './OnionEditor'

export default function SettingsPanel(): ReactElement {
  return (
    <div className="max-w-2xl mx-auto p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-semibold mb-6">Settings</h2>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">
          LLM Configuration
        </h3>
        <LLMSettings />
      </section>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Memory</h3>
        <MemorySettings />
      </section>

      <section>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Contract Onion</h3>
        <OnionEditor />
      </section>
    </div>
  )
}
