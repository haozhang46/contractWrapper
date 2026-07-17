import { useEffect, useState, type ReactElement } from 'react'
import { toHeadlessSettings, type HeadlessSettingsDTO } from '../mappers/headless'

export default function HeadlessSettings(): ReactElement {
  const [settings, setSettings] = useState<HeadlessSettingsDTO | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(function loadHeadlessSettings() {
    fetch('/api/headless')
      .then(r => r.json())
      .then((data: HeadlessSettingsDTO) => setSettings(toHeadlessSettings(data)))
      .catch(() => setSettings({ autoAllow: false }))
  }, [])

  const toggle = async () => {
    if (!settings || saving) return
    const next = { autoAllow: !settings.autoAllow }
    setSettings(next)
    setSaving(true)
    try {
      const res = await fetch('/api/headless', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = (await res.json()) as HeadlessSettingsDTO
      setSettings(toHeadlessSettings(data))
    } catch {
      setSettings(settings)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p className="form-field__loading">Loading...</p>

  return (
    <div className="form-field">
      <div className="toggle-setting">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={saving}
          className={`toggle mt-0.5${settings.autoAllow ? ' toggle--on' : ' toggle--off'}`}
          aria-label={
            settings.autoAllow ? 'Disable auto-allow' : 'Enable auto-allow'
          }
        >
          <span
            className={`toggle__knob${settings.autoAllow ? ' toggle__knob--on' : ' toggle__knob--off'}`}
          />
        </button>
        <div className="toggle-setting__info">
          <p className="toggle-setting__label">
            Headless auto-allow
          </p>
          <p className="toggle-setting__desc">
            When on, L3 tools (WebSearch, Bash, …) skip the Allow dialog and run
            immediately. Equivalent to{' '}
            <code>HARNESS_AUTO_ALLOW=1</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
