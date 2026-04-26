import type {
  Card2BrovaStatus,
  Card2LineItem,
  Card2Locale,
  Card2PdfData,
} from './types'
import checkboxIcon from './assets/checkbox.svg'
import checkboxMarkedIcon from './assets/checkbox_marked.svg'
import {
  card2FieldSlots,
  card2Layout,
  type Card2FieldRowLayout,
  type Card2FieldSlotId,
} from './layout'
import {
  formatMeasurementTuple,
  formatPaymentMethods,
  formatValue,
  resolveCard2Locale,
} from './formatters/card2Formatters'
import informationSvg from './assets/information.svg'
import logoSvg from './assets/logo.svg'
import { Card2CustomerCopySectionHtml } from './components/Card2CustomerCopySectionHtml'
import { Card2GarmentMeasurementTemplateHtml } from './components/Card2GarmentMeasurementTemplateHtml'
import { Card2LineItemStyleMatrixTableHtml } from './components/Card2LineItemStyleMatrixTableHtml'
import { Card2MeasurementSidePanelHtml } from './components/Card2MeasurementSidePanelHtml'
import { Card2PricingPaymentStripHtml } from './components/Card2PricingPaymentStripHtml'

export interface Card2HtmlDocumentProps {
  data: Card2PdfData
  locale?: Card2Locale
  showLayoutGuides?: boolean
}

type BrovaOptionId = Extract<Card2BrovaStatus, 'yes' | 'no' | 'ok'>

const orderHeaderBrovaOptions: readonly { id: BrovaOptionId; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'ok', label: 'Ok' },
]

const resolveCheckboxIcon = (isChecked: boolean): string =>
  isChecked ? checkboxMarkedIcon : checkboxIcon

const joinClassNames = (...names: Array<string | false | undefined>): string =>
  names.filter((value) => Boolean(value)).join(' ')

const fieldValueResolvers: Readonly<
  Record<Card2FieldSlotId, (data: Card2PdfData, locale: Card2Locale) => string>
> = {
  orderNumber: (data) => formatValue(data.orderHeader?.orderNumber),
  customerName: (data) => formatValue(data.orderHeader?.customerName),
  customerMobile: (data) => formatValue(data.orderHeader?.customerMobile),
  orderDate: (data) => formatValue(data.orderHeader?.orderDate),
  dueDate: (data) => formatValue(data.orderHeader?.dueDate),
  brovaStatus: (data) => formatValue(data.orderHeader?.brovaStatus),
  collarLengthWidth: (data) =>
    formatMeasurementTuple([
      data.measurements?.onGarment?.collar?.length,
      data.measurements?.onGarment?.collar?.width,
    ]),
  lengthFrontBack: (data) =>
    formatMeasurementTuple([
      data.measurements?.onGarment?.length?.front,
      data.measurements?.onGarment?.length?.back,
    ]),
  shoulder: (data) => formatValue(data.measurements?.onGarment?.shoulder),
  sleeves: (data) => formatValue(data.measurements?.onGarment?.sleeves),
  armholes: (data) => formatValue(data.measurements?.onGarment?.armholes),
  width: (data) => formatValue(data.measurements?.onGarment?.width),
  upChest: (data) => formatValue(data.measurements?.onGarment?.upChest),
  chest: (data) => formatValue(data.measurements?.onGarment?.chest),
  halfChest: (data) => formatValue(data.measurements?.onGarment?.halfChest),
  waistFrontBack: (data) =>
    formatMeasurementTuple([
      data.measurements?.onGarment?.waist?.front,
      data.measurements?.onGarment?.waist?.back,
    ]),
  bottom: (data) => formatValue(data.measurements?.onGarment?.bottom),
  measurementUnit: (data) => formatValue(data.measurements?.unit),
  topPocketLengthWidthDistance: (data) =>
    formatMeasurementTuple([
      data.measurements?.besideGarment?.topPocket?.length,
      data.measurements?.besideGarment?.topPocket?.width,
      data.measurements?.besideGarment?.topPocket?.distance,
    ]),
  jabzoorMeasurement: (data) => formatValue(data.measurements?.besideGarment?.jabzoor),
  elbowMeasurement: (data) => formatValue(data.measurements?.besideGarment?.elbow),
  sidePocketLengthWidthDistanceOpening: (data) =>
    formatMeasurementTuple([
      data.measurements?.besideGarment?.sidePocket?.length,
      data.measurements?.besideGarment?.sidePocket?.width,
      data.measurements?.besideGarment?.sidePocket?.distance,
      data.measurements?.besideGarment?.sidePocket?.opening,
    ]),
  specialRequestNotes: (data) => formatValue(data.specialRequest),
  fabricTotalPrice: (data) => formatValue(data.pricing?.fabricTotalPrice),
  grandTotal: (data) => formatValue(data.pricing?.grandTotal),
  paid: (data) => formatValue(data.pricing?.paid),
  remaining: (data) => formatValue(data.pricing?.remaining),
  paymentMethods: (data, locale) => formatPaymentMethods(data.pricing?.paymentMethods, locale),
  orderSignature: (data) => formatValue(data.signatures?.order),
  brovaSignature: (data) => formatValue(data.signatures?.brova),
  finalSignature: (data) => formatValue(data.signatures?.final),
  customerCopyEmployeeSignature: (data) => formatValue(data.customerCopy?.employeeSignature),
  customerCopyRemarks: (data) => formatValue(data.customerCopy?.remarks),
}

const buildLineItemsGrid = (data: Card2PdfData): Card2LineItem[] =>
  [...(data.lineItems ?? [])]
    .sort((left, right) => left.lineNumber - right.lineNumber)
    .slice(0, card2Layout.lineItemsTable.rowCount)

const renderFieldRows = (
  rows: readonly Card2FieldRowLayout<Card2FieldSlotId>[],
  data: Card2PdfData,
  locale: Card2Locale,
) =>
  rows.map((row, rowIndex) => (
    <div className="card2-html-row" key={`row-${rowIndex}`}>
      {row.map((cell) => {
        if (cell.slotId === 'brovaStatus') {
          const brovaStatus = data.orderHeader?.brovaStatus

          return (
            <div className="card2-html-field card2-order-brova" key={cell.slotId} style={{ flex: cell.grow ?? 1 }}>
              <span className="card2-order-brova__label">{card2FieldSlots[cell.slotId].label}</span>

              {orderHeaderBrovaOptions.map((option) => (
                <span className="card2-order-brova__option" key={`brova-option-${option.id}`}>
                  <span>{option.label}</span>
                  <img
                    className="card2-order-brova__icon"
                    src={resolveCheckboxIcon(brovaStatus === option.id)}
                    alt=""
                    aria-hidden
                  />
                </span>
              ))}
            </div>
          )
        }

        return (
          <div
            className="card2-html-field card2-html-field--underlined"
            key={cell.slotId}
            style={{ flex: cell.grow ?? 1 }}
          >
            <span className="card2-html-field__label">{card2FieldSlots[cell.slotId].label}</span>
            <span className="card2-html-field__value">
              {fieldValueResolvers[cell.slotId](data, locale)}
            </span>
          </div>
        )
      })}
    </div>
  ))

export function Card2HtmlDocument({
  data,
  locale,
  showLayoutGuides = false,
}: Card2HtmlDocumentProps) {
  const resolvedLocale = resolveCard2Locale(locale ?? data.meta?.locale)
  const lineItems = buildLineItemsGrid(data)

  return (
    <article
      className={joinClassNames(
        'card2-html-sheet',
        'card2-html-sheet--max-compact',
        showLayoutGuides && 'card2-html-sheet--guides',
      )}
    >
      <header className="card2-html-header">
        <img className="card2-html-header__information" src={informationSvg} alt="Information" />
        <img className="card2-html-header__logo" src={logoSvg} alt="Logo" />
      </header>

      <section className="card2-html-section">
        {renderFieldRows(card2Layout.sections.orderHeader.rows, data, resolvedLocale)}
      </section>

      <section className="card2-html-section">
        <Card2LineItemStyleMatrixTableHtml lineItems={lineItems} />
        <Card2PricingPaymentStripHtml data={data} />
      </section>

      <section className="card2-html-section">
        <div className="card2-measurements-layout">
          <Card2GarmentMeasurementTemplateHtml data={data} />
          <Card2MeasurementSidePanelHtml data={data} />
        </div>
      </section>

      <section className="card2-html-section">
        <Card2CustomerCopySectionHtml data={data} />
      </section>
    </article>
  )
}
