import { useEffect, useState, type ReactElement } from 'react'
import { toHeadlessSettings, type HeadlessSettingsDTO } from '../mappers/headless'

export default function HeadlessSettings(): ReactElement {
  const [settings, setSettings] = useState<HeadlessSettingsDTO | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(function loadHeadlessSettings() {
    fetch('/api/headless')
      .then(r => r.json())
      .then((data: HeadlessSettingsDTO) => setSettings(toHeadlessSettings(data)))
      .catch(() => setSettings({ autoAllow: false, unsafeMode: false }))
  }, [])

  const save = async (next: HeadlessSettingsDTO) => {
    if (saving) return
    const prev = settings
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
      if (prev) setSettings(prev)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p className="form-field__loading">Loading...</p>

  return (
    <div className="form-field flex flex-col gap-4">
      <div className="toggle-setting">
        <button
          type="button"
          onClick={() =>
            void save({ ...settings, autoAllow: !settings.autoAllow })
          }
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
          <p className="toggle-setting__label">Headless auto-allow</p>
          <p className="toggle-setting__desc">
            When on, any onion <code>ask</code> skips the Allow dialog
            (including Bash / WebSearch at L2). <code>deny</code> is never
            auto-allowed.
          </p>
        </div>
      </div>

      <div className="toggle-setting">
        <button
          type="button"
          onClick={() =>
            void save({ ...settings, unsafeMode: !settings.unsafeMode })
          }
          disabled={saving}
          className={`toggle mt-0.5${settings.unsafeMode ? ' toggle--on' : ' toggle--off'}`}
          aria-label={
            settings.unsafeMode ? 'Disable unsafe mode' : 'Enable unsafe mode'
          }
        >
          <span
            className={`toggle__knob${settings.unsafeMode ? ' toggle__knob--on' : ' toggle__knob--off'}`}
          />
        </button>
        <div className="toggle-setting__info">
          <p className="toggle-setting__label">Unsafe mode</p>
          <p className="toggle-setting__desc">
            Unused by onion authorize (auto-allow alone covers all{' '}
            <code>ask</code>). Kept for UI / env compatibility —{' '}
            <code>HARNESS_AUTO_ALLOW=1</code> / <code>HARNESS_HEADLESS=1</code>{' '}
            still turn both toggles on.
          </p>
        </div>
      </div>
    </div>
  )
}
