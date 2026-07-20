import { createElement } from 'react'
import { registerWidget } from '../src/registry.ts'
import { DeepTutorPanel } from './DeepTutorPanel.tsx'

registerWidget({
  id: 'deeptutor',
  title: 'DeepTutor',
  order: 60,
  mount: () => createElement(DeepTutorPanel),
})
