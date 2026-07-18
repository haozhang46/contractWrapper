import { useState, type ReactElement } from 'react'
import {
  BUILTIN_LAYER_TYPES,
  JS_LAYER_TEMPLATE,
  type AddableBuiltinLayerType,
  type OnionLayerType,
} from '../types/onion'

const BUILTIN_TYPE_LABELS: Record<AddableBuiltinLayerType, string> = {
  'capability-gate': 'Capability Gate',
  'require-confirm': 'Require Confirm',
}

interface AddBuiltinProps {
  mode: 'add-builtin'
  onAdd: (type: AddableBuiltinLayerType, name: string) => void
  onCancel: () => void
}

interface AddJsProps {
  mode: 'add-js'
  onAdd: (name: string, source: string) => void
  onCancel: () => void
}

interface EditJsProps {
  mode: 'edit-js'
  source: string
  onChange: (source: string) => void
}

export type OnionLayerFormProps = AddBuiltinProps | AddJsProps | EditJsProps

function EditJsSource({
  source,
  onChange,
}: Pick<EditJsProps, 'source' | 'onChange'>): ReactElement {
  return (
    <textarea
      value={source}
      onChange={e => onChange(e.target.value)}
      className="onion-editor__js-textarea"
      rows={8}
      spellCheck={false}
    />
  )
}

function AddLayerForm(props: AddBuiltinProps | AddJsProps): ReactElement {
  const [name, setName] = useState('')
  const [type, setType] = useState<AddableBuiltinLayerType>('capability-gate')
  const [source, setSource] = useState(JS_LAYER_TEMPLATE)

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (props.mode === 'add-builtin') {
      props.onAdd(type, trimmed)
    } else {
      props.onAdd(trimmed, source)
    }
  }

  return (
    <div className="onion-editor__add-form">
      <div>
        <label className="form-field__label">Layer name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="form-field__input"
          placeholder="My layer"
        />
      </div>

      {props.mode === 'add-builtin' && (
        <div>
          <label className="form-field__label">Builtin type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as AddableBuiltinLayerType)}
            className="form-field__select"
          >
            {BUILTIN_LAYER_TYPES.map(t => (
              <option key={t} value={t}>
                {BUILTIN_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      )}

      {props.mode === 'add-js' && (
        <div>
          <label className="form-field__label">JS source</label>
          <textarea
            value={source}
            onChange={e => setSource(e.target.value)}
            className="onion-editor__js-textarea"
            rows={8}
            spellCheck={false}
          />
        </div>
      )}

      <div className="onion-editor__add-actions">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className="form-field__save-btn"
        >
          Add layer
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="onion-editor__cancel-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function OnionLayerForm(props: OnionLayerFormProps): ReactElement {
  if (props.mode === 'edit-js') {
    return <EditJsSource source={props.source} onChange={props.onChange} />
  }

  return <AddLayerForm {...props} />
}
