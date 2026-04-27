import type { Card2BrovaStatus, Card2PaymentMethod, Card2PdfData } from '../types'
import checkboxIcon from '../assets/checkbox.svg'
import checkboxMarkedIcon from '../assets/checkbox_marked.svg'
import customerCopyHeaderSvg from '../assets/customer_copy_header.svg'
import logoSvg from '../assets/logo.svg'
import { card2ArabicTerms } from '../content/card2ArabicTerms'
import { formatValue } from '../formatters/card2Formatters'

export interface Card2CustomerCopySectionHtmlProps {
  data: Card2PdfData
}

type BrovaOptionId = Extract<Card2BrovaStatus, 'yes' | 'no' | 'ok'>

interface CheckboxOption<TId extends string> {
  id: TId
  label: string
}

const brovaOptions: readonly CheckboxOption<BrovaOptionId>[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'ok', label: 'Ok' },
]

const paymentMethodOptions: readonly CheckboxOption<Card2PaymentMethod>[] = [
  { id: 'link', label: 'Link' },
  { id: 'knet', label: 'Knet' },
  { id: 'cash', label: 'Cash' },
]

const resolveCheckedIcon = (isChecked: boolean): string =>
  isChecked ? checkboxMarkedIcon : checkboxIcon

const hasMarkedFabricQuantity = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'number') {
    return value > 0
  }

  const normalizedValue = String(value).trim()

  if (normalizedValue.length === 0 || normalizedValue === '-') {
    return false
  }

  const numericValue = Number(normalizedValue)

  if (!Number.isNaN(numericValue)) {
    return numericValue > 0
  }

  return true
}

export function Card2CustomerCopySectionHtml({
  data,
}: Card2CustomerCopySectionHtmlProps) {
  const brovaStatus = data.orderHeader?.brovaStatus
  const fabricSummary = data.customerCopy?.fabricSummary
  const paymentSummary = data.customerCopy?.paymentSummary
  const paymentMethods = paymentSummary?.paymentMethods ?? data.pricing?.paymentMethods ?? []
  const selectedPaymentMethods = new Set(paymentMethods)

  return (
    <section className="card2-customer-copy" aria-label="Customer copy section">
      <header className="card2-customer-copy__header">
        <img
          className="card2-customer-copy__header-strip"
          src={customerCopyHeaderSvg}
          alt="Customer copy header"
        />
        <img className="card2-customer-copy__logo" src={logoSvg} alt="Logo" />
      </header>

      <div className="card2-customer-copy__row card2-customer-copy__row--number">
        <div className="card2-customer-copy__line-field card2-customer-copy__line-field--number">
          <span className="card2-customer-copy__line-label">No.</span>
          <span className="card2-customer-copy__line-value">
            {formatValue(data.orderHeader?.orderNumber)}
          </span>
        </div>
      </div>

      <div className="card2-customer-copy__row">
        <div className="card2-customer-copy__line-field card2-customer-copy__line-field--name">
          <span className="card2-customer-copy__line-label">Name</span>
          <span className="card2-customer-copy__line-value">
            {formatValue(data.orderHeader?.customerName)}
          </span>
        </div>

        <div className="card2-customer-copy__line-field card2-customer-copy__line-field--mobile">
          <span className="card2-customer-copy__line-label">Mobile</span>
          <span className="card2-customer-copy__line-value">
            {formatValue(data.orderHeader?.customerMobile)}
          </span>
        </div>
      </div>

      <div className="card2-customer-copy__row">
        <div className="card2-customer-copy__line-field">
          <span className="card2-customer-copy__line-label">Date</span>
          <span className="card2-customer-copy__line-value">
            {formatValue(data.orderHeader?.orderDate)}
          </span>
        </div>

        <div className="card2-customer-copy__line-field">
          <span className="card2-customer-copy__line-label">Due Date</span>
          <span className="card2-customer-copy__line-value">
            {formatValue(data.orderHeader?.dueDate)}
          </span>
        </div>

        <div className="card2-customer-copy__brova">
          <span className="card2-customer-copy__brova-label">Brova</span>

          {brovaOptions.map((option) => {
            const isChecked = brovaStatus === option.id

            return (
              <span className="card2-customer-copy__check-item" key={option.id}>
                <span>{option.label}</span>
                <img
                  className="card2-customer-copy__check-icon"
                  src={resolveCheckedIcon(isChecked)}
                  alt=""
                  aria-hidden
                />
              </span>
            )
          })}
        </div>
      </div>

      <div className="card2-customer-copy__lower">
        <div className="card2-customer-copy__main">
          <div className="card2-customer-copy__fabric-signature-row">
            <div className="card2-customer-copy__fabric-row">
              <span className="card2-customer-copy__fabric-label">fabric:</span>

              <span className="card2-customer-copy__check-item">
                <img
                  className="card2-customer-copy__check-icon"
                  src={resolveCheckedIcon(hasMarkedFabricQuantity(fabricSummary?.inHouse))}
                  alt=""
                  aria-hidden
                />
                <span>In house</span>
              </span>

              <span className="card2-customer-copy__check-item">
                <img
                  className="card2-customer-copy__check-icon"
                  src={resolveCheckedIcon(hasMarkedFabricQuantity(fabricSummary?.out))}
                  alt=""
                  aria-hidden
                />
                <span>Out</span>
              </span>

              <div className="card2-customer-copy__line-field card2-customer-copy__line-field--total-quantity">
                <span className="card2-customer-copy__line-label">Total Quantity</span>
                <span className="card2-customer-copy__line-value">
                  {formatValue(fabricSummary?.totalQuantity)}
                </span>
              </div>
            </div>

            <div className="card2-customer-copy__employee-signature">
              <span className="card2-customer-copy__employee-signature-label">Employee Signature</span>
              <div className="card2-customer-copy__employee-signature-box">
                {data.customerCopy?.employeeSignature
                  ? formatValue(data.customerCopy.employeeSignature)
                  : null}
              </div>
            </div>
          </div>

          <div className="card2-customer-copy__totals-row">
            <div className="card2-customer-copy__amount-field">
              <span className="card2-customer-copy__amount-value">
                {formatValue(paymentSummary?.total ?? data.pricing?.grandTotal)}
              </span>
              <span className="card2-customer-copy__amount-label">Total</span>
            </div>

            <div className="card2-customer-copy__amount-field">
              <span className="card2-customer-copy__amount-value">
                {formatValue(paymentSummary?.paid ?? data.pricing?.paid)}
              </span>
              <span className="card2-customer-copy__amount-label">Paid</span>
            </div>

            <div className="card2-customer-copy__amount-field">
              <span className="card2-customer-copy__amount-value">
                {formatValue(paymentSummary?.remaining ?? data.pricing?.remaining)}
              </span>
              <span className="card2-customer-copy__amount-label">Remaining</span>
            </div>

            <div className="card2-customer-copy__payment-methods">
              {paymentMethodOptions.map((methodOption) => {
                const isChecked = selectedPaymentMethods.has(methodOption.id)

                return (
                  <span className="card2-customer-copy__check-item" key={methodOption.id}>
                    <img
                      className="card2-customer-copy__check-icon"
                      src={resolveCheckedIcon(isChecked)}
                      alt=""
                      aria-hidden
                    />
                    <span>{methodOption.label}</span>
                  </span>
                )
              })}
            </div>
          </div>

          <div className="card2-customer-copy__remarks">
            <span className="card2-customer-copy__remarks-title">Remarks</span>
            <p className="card2-customer-copy__remarks-text">{formatValue(data.customerCopy?.remarks)}</p>

            <div className="card2-customer-copy__remarks-lines" aria-hidden>
              {Array.from({ length: 3 }, (_, index) => (
                <span key={`customer-copy-remark-line-${index}`} />
              ))}
            </div>
          </div>
        </div>

        <aside className="card2-customer-copy__terms" dir="rtl" lang="ar">
          <h3 className="card2-customer-copy__terms-title">الملاحظات والشروط</h3>
          <ul className="card2-customer-copy__terms-list">
            {card2ArabicTerms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}
