import { useEffect, useMemo, useState } from 'react'
import { AssignStep } from './components/AssignStep'
import { BillSummary } from './components/BillSummary'
import { ItemEditor } from './components/ItemEditor'
import { ScanCapture } from './components/ScanCapture'
import { computeBillSplit } from './lib/split'
import type { ParseResult } from './lib/parseReceipt'
import { clearBill, loadBill, saveBill } from './lib/storage'
import {
  createEmptyBill,
  createId,
  type Bill,
  type LineItem,
  type Step,
} from './lib/types'
import './App.css'

const STEPS: { id: Step; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'scan', label: 'Scan' },
  { id: 'review', label: 'Items' },
  { id: 'assign', label: 'Assign' },
  { id: 'totals', label: 'Totals' },
]

function App() {
  const [bill, setBill] = useState<Bill>(() => loadBill() ?? createEmptyBill())
  const [step, setStep] = useState<Step>('people')
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    saveBill(bill)
  }, [bill])

  const split = useMemo(() => computeBillSplit(bill), [bill])

  function update(patch: Partial<Bill> | ((prev: Bill) => Bill)) {
    setBill((prev) =>
      typeof patch === 'function' ? patch(prev) : { ...prev, ...patch },
    )
  }

  function addPerson() {
    const name = nameDraft.trim()
    if (!name) return
    update({
      people: [...bill.people, { id: createId('p'), name }],
    })
    setNameDraft('')
  }

  function removePerson(id: string) {
    update({
      people: bill.people.filter((p) => p.id !== id),
      items: bill.items.map((item) => ({
        ...item,
        assigneeIds: item.assigneeIds.filter((pid) => pid !== id),
      })),
    })
  }

  function applyOcr(result: ParseResult) {
    const items: LineItem[] = result.items
      .filter((item) => !/sv[ry]\s*chrg|service\s*ch/i.test(item.name))
      .map((item) => ({
        id: createId('i'),
        name: item.name,
        price: item.price,
        assigneeIds: [],
      }))
    update({
      items: items.length > 0 ? items : bill.items,
      tax: result.detectedTax ?? bill.tax,
      serviceCharge:
        result.detectedServiceCharge != null
          ? result.detectedServiceCharge
          : bill.serviceCharge,
      tip: result.detectedTip != null ? result.detectedTip : bill.tip,
    })
    setStep('review')
  }

  function addItem() {
    update({
      items: [
        ...bill.items,
        { id: createId('i'), name: '', price: 0, assigneeIds: [] },
      ],
    })
  }

  function changeItem(id: string, patch: Partial<Pick<LineItem, 'name' | 'price'>>) {
    update({
      items: bill.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }

  function removeItem(id: string) {
    update({ items: bill.items.filter((item) => item.id !== id) })
  }

  function toggleAssignee(itemId: string, personId: string) {
    update({
      items: bill.items.map((item) => {
        if (item.id !== itemId) return item
        const has = item.assigneeIds.includes(personId)
        return {
          ...item,
          assigneeIds: has
            ? item.assigneeIds.filter((id) => id !== personId)
            : [...item.assigneeIds, personId],
        }
      }),
    })
  }

  function assignAll(itemId: string) {
    update({
      items: bill.items.map((item) =>
        item.id === itemId
          ? { ...item, assigneeIds: bill.people.map((p) => p.id) }
          : item,
      ),
    })
  }

  function splitUnassignedEqually() {
    const everyone = bill.people.map((p) => p.id)
    if (everyone.length === 0) return
    update({
      items: bill.items.map((item) =>
        item.assigneeIds.length === 0 && item.price > 0
          ? { ...item, assigneeIds: everyone }
          : item,
      ),
    })
  }

  function resetBill() {
    clearBill()
    setBill(createEmptyBill())
    setStep('people')
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const canAdvancePeople = bill.people.length >= 2
  const canAdvanceReview = bill.items.length > 0

  function goNext() {
    if (step === 'people' && canAdvancePeople) setStep('scan')
    else if (step === 'review' && canAdvanceReview) setStep('assign')
    else if (step === 'assign') setStep('totals')
  }

  function goBack() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!.id)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__top">
          <h1 className="brand">Splitbill</h1>
          <button type="button" className="text-btn" onClick={resetBill}>
            New
          </button>
        </div>
        <label className="title-field">
          <span className="sr-only">Bill title</span>
          <input
            value={bill.title}
            onChange={(e) => update({ title: e.target.value })}
            aria-label="Bill title"
          />
        </label>
        <nav className="steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`steps__dot${s.id === step ? ' steps__dot--on' : ''}${i < stepIndex ? ' steps__dot--done' : ''}`}
              onClick={() => {
                if (i <= stepIndex || (s.id === 'scan' && canAdvancePeople)) setStep(s.id)
              }}
              aria-current={s.id === step ? 'step' : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {step === 'people' && (
          <section className="panel" aria-labelledby="people-heading">
            <h2 id="people-heading">Who&apos;s splitting?</h2>
            <p className="panel__lead">Add at least two people.</p>
            <ul className="people-list">
              {bill.people.map((person) => (
                <li key={person.id} className="people-row">
                  <span>{person.name}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${person.name}`}
                    onClick={() => removePerson(person.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="add-person"
              onSubmit={(e) => {
                e.preventDefault()
                addPerson()
              }}
            >
              <label className="sr-only" htmlFor="person-name">
                Name
              </label>
              <input
                id="person-name"
                className="field"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Name"
                autoComplete="off"
              />
              <button type="submit" className="btn btn--secondary">
                Add
              </button>
            </form>
          </section>
        )}

        {step === 'scan' && (
          <section className="panel" aria-labelledby="scan-heading">
            <div className="panel__nav">
              <button type="button" className="text-btn" onClick={() => setStep('people')}>
                ← People
              </button>
            </div>
            <h2 id="scan-heading">Scan receipt</h2>
            <ScanCapture onParsed={applyOcr} onSkip={() => setStep('review')} />
          </section>
        )}

        {step === 'review' && (
          <section className="panel" aria-labelledby="review-heading">
            <h2 id="review-heading">Review items</h2>
            <p className="panel__lead">Fix OCR mistakes before assigning.</p>
            <ItemEditor
              bill={bill}
              onChangeItem={changeItem}
              onRemoveItem={removeItem}
              onAddItem={addItem}
              onTax={(tax) => update({ tax })}
              onServiceCharge={(serviceCharge) => update({ serviceCharge })}
              onTip={(tip) => update({ tip })}
            />
          </section>
        )}

        {step === 'assign' && (
          <section className="panel" aria-labelledby="assign-heading">
            <h2 id="assign-heading">Who had what?</h2>
            <AssignStep
              bill={bill}
              unassignedIds={split.unassignedItemIds}
              unassignedAmount={split.unassignedAmount}
              onToggleAssignee={toggleAssignee}
              onAssignAll={assignAll}
              onSplitUnassignedEqually={splitUnassignedEqually}
            />
          </section>
        )}

        {step === 'totals' && (
          <section className="panel" aria-labelledby="totals-heading">
            <h2 id="totals-heading" className="sr-only">
              Totals
            </h2>
            <BillSummary bill={bill} onSplitUnassignedEqually={splitUnassignedEqually} />
          </section>
        )}
      </main>

      {step !== 'scan' && step !== 'totals' && (
        <footer className="bottom-bar">
          {stepIndex > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={goBack}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={
              (step === 'people' && !canAdvancePeople) ||
              (step === 'review' && !canAdvanceReview)
            }
            onClick={goNext}
          >
            {step === 'assign' ? 'See totals' : 'Continue'}
          </button>
        </footer>
      )}

      {step === 'totals' && (
        <footer className="bottom-bar">
          <button type="button" className="btn btn--ghost" onClick={() => setStep('assign')}>
            Back
          </button>
          <button type="button" className="btn btn--primary" onClick={resetBill}>
            New bill
          </button>
        </footer>
      )}
    </div>
  )
}

export default App
