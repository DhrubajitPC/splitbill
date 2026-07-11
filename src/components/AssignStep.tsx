import type { Bill } from '../lib/types'
import { formatMoney } from '../lib/split'
import { PersonChips } from './PersonChips'
import './AssignStep.css'

interface Props {
  bill: Bill
  unassignedIds: string[]
  unassignedAmount: number
  onToggleAssignee: (itemId: string, personId: string) => void
  onAssignAll: (itemId: string) => void
  onSplitUnassignedEqually: () => void
}

export function AssignStep({
  bill,
  unassignedIds,
  unassignedAmount,
  onToggleAssignee,
  onAssignAll,
  onSplitUnassignedEqually,
}: Props) {
  return (
    <div className="assign">
      <p className="assign__hint">
        Tap who shared each item. People left out are not charged for it.
      </p>

      {unassignedAmount > 0 && (
        <div className="assign-unassigned" role="status">
          <div className="assign-unassigned__text">
            <p className="assign-unassigned__label">Unassigned</p>
            <p className="assign-unassigned__amount">
              {formatMoney(unassignedAmount, bill.currency)}
              <span className="assign-unassigned__count">
                {' '}
                · {unassignedIds.length} item{unassignedIds.length === 1 ? '' : 's'}
              </span>
            </p>
            <p className="assign-unassigned__suggest">
              Split equally among everyone?
            </p>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onSplitUnassignedEqually}
          >
            Split equally
          </button>
        </div>
      )}

      <ul className="assign-list">
        {bill.items.map((item) => {
          const flagged = unassignedIds.includes(item.id)
          return (
            <li
              key={item.id}
              className={`assign-row${flagged ? ' assign-row--warn' : ''}`}
            >
              <div className="assign-row__head">
                <div>
                  <p className="assign-row__name">{item.name || 'Untitled item'}</p>
                  <p className="assign-row__price">
                    {bill.currency}
                    {item.price.toFixed(2)}
                    {flagged && <span className="assign-row__flag"> Unassigned</span>}
                  </p>
                </div>
              </div>
              <PersonChips
                people={bill.people}
                selectedIds={item.assigneeIds}
                onToggle={(pid) => onToggleAssignee(item.id, pid)}
                onSelectAll={() => onAssignAll(item.id)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
