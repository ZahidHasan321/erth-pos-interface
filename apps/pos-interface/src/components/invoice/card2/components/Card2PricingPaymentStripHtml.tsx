import type { CSSProperties } from 'react'
import type { Card2PaymentMethod, Card2PdfData } from '../types'
import checkboxIcon from '../assets/checkbox.svg'
import checkboxMarkedIcon from '../assets/checkbox_marked.svg'
import { formatValue } from '../formatters/card2Formatters'
import { card2Layout } from '../layout'

export interface Card2PricingPaymentStripHtmlProps {
  data: Card2PdfData
}

interface PaymentMethodOption {
  id: Card2PaymentMethod
  label: string
}

const paymentMethodOptions: readonly PaymentMethodOption[] = [
  { id: 'link', label: 'Link' },
  { id: 'knet', label: 'Knet' },
  { id: 'cash', label: 'Cash' },
]

const resolvePriceColumnStartPercent = (): number => {
  const fixedColumns = card2Layout.lineItemsTable.fixedColumns
  const priceColumnIndex = fixedColumns.findIndex((column) => column.id === 'price')

  if (priceColumnIndex < 0) {
    return 0
  }

  return fixedColumns
    .slice(0, priceColumnIndex)
    .reduce((totalWidth, column) => totalWidth + column.widthPercent, 0)
}

const pricingStripLayoutStyle = {
  '--card2-pricing-price-start': `${resolvePriceColumnStartPercent()}%`,
} as CSSProperties

export function Card2PricingPaymentStripHtml({
  data,
}: Card2PricingPaymentStripHtmlProps) {
  const selectedPaymentMethods = new Set(data.pricing?.paymentMethods ?? [])

  return (
    <div className="card2-pricing-strip" style={pricingStripLayoutStyle}>
      <div className="card2-pricing-strip__row">
        <div className="card2-pricing-strip__anchor">
          <div className="card2-pricing-strip__field card2-pricing-strip__field--fabric-total">
            <span className="card2-pricing-strip__label">Fabric Total Price</span>
            <span className="card2-pricing-strip__value">
              {formatValue(data.pricing?.fabricTotalPrice)}
            </span>
          </div>
        </div>

        <div className="card2-pricing-strip__edge">
          <div className="card2-pricing-strip__totals">
            <div className="card2-pricing-strip__field">
              <span className="card2-pricing-strip__label">Paid</span>
              <span className="card2-pricing-strip__value">{formatValue(data.pricing?.paid)}</span>
            </div>

            <div className="card2-pricing-strip__field">
              <span className="card2-pricing-strip__label">Remaining</span>
              <span className="card2-pricing-strip__value">{formatValue(data.pricing?.remaining)}</span>
            </div>

            <div className="card2-pricing-strip__field">
              <span className="card2-pricing-strip__label">Grand Total</span>
              <span className="card2-pricing-strip__value">{formatValue(data.pricing?.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card2-pricing-strip__row card2-pricing-strip__row--methods">
        <div className="card2-pricing-strip__edge">
          <div className="card2-pricing-strip__methods" role="group" aria-label="Payment methods">
            {paymentMethodOptions.map((methodOption) => {
              const isSelected = selectedPaymentMethods.has(methodOption.id)

              return (
                <span className="card2-pricing-strip__method" key={methodOption.id}>
                  <img
                    className="card2-pricing-strip__method-icon"
                    src={isSelected ? checkboxMarkedIcon : checkboxIcon}
                    alt=""
                    aria-hidden
                  />
                  <span>{methodOption.label}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
