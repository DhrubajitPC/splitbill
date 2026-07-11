import type { Person, PersonId } from '../lib/types'
import './PersonChips.css'

interface Props {
  people: Person[]
  selectedIds: PersonId[]
  onToggle: (id: PersonId) => void
  onSelectAll?: () => void
}

function initial(name: string): string {
  const t = name.trim()
  return t ? t[0]!.toUpperCase() : '?'
}

export function PersonChips({ people, selectedIds, onToggle, onSelectAll }: Props) {
  if (people.length === 0) {
    return <p className="chips-empty">Add people first.</p>
  }

  return (
    <div className="chips" role="group" aria-label="People on this item">
      {people.map((person) => {
        const selected = selectedIds.includes(person.id)
        return (
          <button
            key={person.id}
            type="button"
            className={`chip${selected ? ' chip--on' : ''}`}
            aria-pressed={selected}
            onClick={() => onToggle(person.id)}
          >
            <span className="chip__avatar" aria-hidden="true">
              {initial(person.name)}
            </span>
            <span className="chip__name">{person.name}</span>
          </button>
        )
      })}
      {onSelectAll && (
        <button type="button" className="chip chip--ghost" onClick={onSelectAll}>
          Everyone
        </button>
      )}
    </div>
  )
}
