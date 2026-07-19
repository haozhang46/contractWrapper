import type { ReactElement } from 'react'
import type { SlashSkillItem } from './slashSkill'

export type SlashSkillPickerProps = {
  skills: SlashSkillItem[]
  selectedIndex: number
  onSelect: (name: string) => void
  onHover: (index: number) => void
}

export default function SlashSkillPicker({
  skills,
  selectedIndex,
  onSelect,
  onHover,
}: SlashSkillPickerProps): ReactElement {
  if (skills.length === 0) {
    return (
      <div className="slash-skill-picker" role="listbox" aria-label="Skills">
        <div className="slash-skill-picker__empty">No matching skills</div>
      </div>
    )
  }

  return (
    <div className="slash-skill-picker" role="listbox" aria-label="Skills">
      {skills.map((skill, index) => {
        const active = index === selectedIndex
        return (
          <button
            key={skill.name}
            type="button"
            role="option"
            aria-selected={active}
            className={`slash-skill-picker__item${active ? ' slash-skill-picker__item--active' : ''}`}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(skill.name)
            }}
          >
            <span className="slash-skill-picker__name">/{skill.name}</span>
            {skill.description ? (
              <span className="slash-skill-picker__desc">{skill.description}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
