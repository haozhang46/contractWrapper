import { useState, type ReactElement, type ReactNode } from 'react'
import ChatPanel from './components/ChatPanel'
import ConfirmBanner from './components/ConfirmBanner'
import SettingsPanel from './components/SettingsPanel'

type Tab = 'chat' | 'settings'

export default function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="text-sm font-semibold text-orange-400 mr-4">Harness</span>
        <nav className="flex gap-1">
          <TabButton
            active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </TabButton>
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </TabButton>
        </nav>
        <ConfirmBanner />
      </header>

      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? <ChatPanel /> : <SettingsPanel />}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        active
          ? 'bg-zinc-800 text-white'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
      }`}
    >
      {children}
    </button>
  )
}
