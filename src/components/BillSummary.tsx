import { useState } from 'react'
import type { Bill } from '../lib/types'
import { computeBillSplit, formatMoney, summaryText } from '../lib/split'
import './BillSummary.css'

interface Props {
  bill: Bill
  onSplitUnassignedEqually?: () => void
}

export function BillSummary({ bill, onSplitUnassignedEqually }: Props) {
  const split = computeBillSplit(bill)
  const [copied, setCopied] = useState(false)

  async function copy() {
    const text = summaryText(bill, split)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy summary:', text)
    }
  }

  return (
    <div className="summary">
      <p className="summary__lead">Who owes what</p>
      <ul className="summary-list">
        {split.people.map((person) => (
          <li key={person.personId} className="summary-row">
            <span className="summary-row__name">{person.name}</span>
            <span className="summary-row__amount">
              {formatMoney(person.total, bill.currency)}
            </span>
            <span className="summary-row__detail">
              items {formatMoney(person.itemsSubtotal, bill.currency)}
              {person.serviceShare > 0 &&
                ` · svc ${formatMoney(person.serviceShare, bill.currency)}`}
              {person.taxShare > 0 &&
                ` · tax ${formatMoney(person.taxShare, bill.currency)}`}
              {person.tipShare > 0 &&
                ` · tip ${formatMoney(person.tipShare, bill.currency)}`}
            </span>
          </li>
        ))}
      </ul>

      {split.unassignedAmount > 0 && (
        <div className="summary-unassigned" role="status">
          <div>
            <p className="summary-unassigned__label">Unassigned</p>
            <p className="summary-unassigned__amount">
              {formatMoney(split.unassignedAmount, bill.currency)}
              <span className="summary-unassigned__note">
                {' '}
                · not in personal totals yet
              </span>
            </p>
          </div>
          {onSplitUnassignedEqually && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onSplitUnassignedEqually}
            >
              Split equally
            </button>
          )}
        </div>
      )}

      <div className="summary-total">
        <span>Bill total</span>
        <strong>{formatMoney(split.grandTotal, bill.currency)}</strong>
      </div>

      <button type="button" className="btn btn--secondary" onClick={copy}>
        {copied ? 'Copied' : 'Copy summary'}
      </button>
    </div>
  )
}
