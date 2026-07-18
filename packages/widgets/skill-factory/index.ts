import { createElement } from 'react'
import { registerWidget } from '../src/registry.ts'
import { SkillFactoryPanel } from './SkillFactoryPanel.tsx'

registerWidget({
  id: 'skill-factory',
  title: 'Skill Factory',
  order: 50,
  mount: () => createElement(SkillFactoryPanel),
})
