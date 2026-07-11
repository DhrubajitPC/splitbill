import type { Bill, LineItem } from '../lib/types'
import { formatMoney } from '../lib/split'
import './ItemEditor.css'

interface Props {
  bill: Bill
  onChangeItem: (id: string, patch: Partial<Pick<LineItem, 'name' | 'price'>>) => void
  onRemoveItem: (id: string) => void
  onAddItem: () => void
  onTax: (n: number) => void
  onServiceCharge: (n: number) => void
  onTip: (n: number) => void
}

function parseAmount(value: string): number {
  const n = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

export function ItemEditor({
  bill,
  onChangeItem,
  onRemoveItem,
  onAddItem,
  onTax,
  onServiceCharge,
  onTip,
}: Props) {
  const itemsSum = bill.items.reduce((s, i) => s + i.price, 0)
  const service = bill.serviceCharge ?? 0
  const billTotal = itemsSum + service + bill.tax + bill.tip

  return (
    <div className="item-editor">
      <ul className="item-list" aria-label="Line items">
        {bill.items.length === 0 && (
          <li className="item-list__empty">No items yet — add one or scan a receipt.</li>
        )}
        {bill.items.map((item) => (
          <li key={item.id} className="item-row">
            <label className="sr-only" htmlFor={`name-${item.id}`}>
              Item name
            </label>
            <input
              id={`name-${item.id}`}
              className="field field--name"
              value={item.name}
              onChange={(e) => onChangeItem(item.id, { name: e.target.value })}
              placeholder="Item"
              autoComplete="off"
            />
            <label className="sr-only" htmlFor={`price-${item.id}`}>
              Price
            </label>
            <div className="price-wrap">
              <span aria-hidden="true">{bill.currency}</span>
              <input
                id={`price-${item.id}`}
                className="field field--price"
                inputMode="decimal"
                value={item.price === 0 ? '' : String(item.price)}
                onChange={(e) =>
                  onChangeItem(item.id, { price: parseAmount(e.target.value) })
                }
                placeholder="0.00"
              />
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${item.name || 'item'}`}
              onClick={() => onRemoveItem(item.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="btn btn--ghost" onClick={onAddItem}>
        + Add item
      </button>

      <div className="extras">
        <label className="extra">
          <span>Service</span>
          <div className="price-wrap">
            <span aria-hidden="true">{bill.currency}</span>
            <input
              className="field field--price"
              inputMode="decimal"
              value={service === 0 ? '' : String(service)}
              onChange={(e) => onServiceCharge(parseAmount(e.target.value))}
              placeholder="0.00"
              aria-describedby="service-hint"
            />
          </div>
        </label>
        <label className="extra">
          <span>Tax</span>
          <div className="price-wrap">
            <span aria-hidden="true">{bill.currency}</span>
            <input
              className="field field--price"
              inputMode="decimal"
              value={bill.tax === 0 ? '' : String(bill.tax)}
              onChange={(e) => onTax(parseAmount(e.target.value))}
              placeholder="0.00"
            />
          </div>
        </label>
        <label className="extra">
          <span>Tip</span>
          <div className="price-wrap">
            <span aria-hidden="true">{bill.currency}</span>
            <input
              className="field field--price"
              inputMode="decimal"
              value={bill.tip === 0 ? '' : String(bill.tip)}
              onChange={(e) => onTip(parseAmount(e.target.value))}
              placeholder="0.00"
            />
          </div>
        </label>
      </div>
      <p id="service-hint" className="extras__hint">
        Service is usually % of items; tax often applies on items + service.
      </p>

      <p className="items-sum">
        Items {formatMoney(itemsSum, bill.currency)}
        {service > 0 && <> · svc {formatMoney(service, bill.currency)}</>}
        {bill.tax > 0 && <> · tax {formatMoney(bill.tax, bill.currency)}</>}
        {(service > 0 || bill.tax > 0 || bill.tip > 0) && (
          <> · Bill {formatMoney(billTotal, bill.currency)}</>
        )}
      </p>
    </div>
  )
}
