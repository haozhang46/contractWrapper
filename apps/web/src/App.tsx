import { Component, useState, type ReactElement, type ReactNode } from 'react'
import { listWidgets } from '@harness/widgets'
import ChatPanel from './components/ChatPanel'
import ConfirmBanner from './components/ConfirmBanner'
import SettingsPanel from './components/SettingsPanel'
import { captureComponentError } from './monitoring/error-reporting'
import { type ShellTab } from './shellTabs'

export default function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<ShellTab>('chat')
  const widgets = listWidgets()

  return (
    <ErrorBoundary>
      <div className="shell">
        <header className="shell__header">
          <span className="shell__brand">Harness</span>
          <nav className="shell__nav">
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
            {widgets.map((widget) => (
              <TabButton
                key={widget.id}
                active={activeTab === widget.id}
                onClick={() => setActiveTab(widget.id)}
              >
                {widget.title}
              </TabButton>
            ))}
          </nav>
        </header>

        <main className="shell__main">
          {activeTab === 'chat' ? (
            <ChatPanel />
          ) : activeTab === 'settings' ? (
            <SettingsPanel />
          ) : (
            widgets.find((widget) => widget.id === activeTab)?.mount() ?? null
          )}
        </main>
        <ConfirmBanner />
      </div>
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureComponentError(error, {
      componentStack: info.componentStack ?? '',
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="shell">
          <header className="shell__header">
            <span className="shell__brand">Harness</span>
          </header>
          <main className="shell__main flex items-center justify-center">
            <div className="text-center text-zinc-400">
              <p className="text-lg mb-2">Something went wrong</p>
              <p className="text-sm">Reload the page to try again.</p>
            </div>
          </main>
        </div>
      )
    }
    return this.props.children
  }
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
      className={`shell__tab${active ? ' shell__tab--active' : ''}`}
    >
      {children}
    </button>
  )
}
