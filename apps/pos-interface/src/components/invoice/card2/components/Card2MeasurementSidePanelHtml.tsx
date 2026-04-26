import type { Card2PdfData } from '../types'
import { formatValue } from '../formatters/card2Formatters'
import { card2ArabicTerms } from '../content/card2ArabicTerms'

export interface Card2MeasurementSidePanelHtmlProps {
  data: Card2PdfData
}

interface SignatureField {
  label: string
  value: string
}

const isImageDataUrl = (value: string): boolean => value.startsWith('data:image/')

export function Card2MeasurementSidePanelHtml({
  data,
}: Card2MeasurementSidePanelHtmlProps) {
  const specialRequest = formatValue(data.specialRequest)

  const signatureFields: readonly SignatureField[] = [
    {
      label: 'Order Signature',
      value: data.signatures?.order ?? '',
    },
    {
      label: 'Brova Signature',
      value: data.signatures?.brova ?? '',
    },
    {
      label: 'Final Signature',
      value: data.signatures?.final ?? '',
    },
  ]

  return (
    <aside className="card2-measure-side" aria-label="Special request and signatures panel">
      <section className="card2-measure-side__special">
        <h2 className="card2-measure-side__special-title">Special Request</h2>
        <p className="card2-measure-side__special-text">{specialRequest}</p>

        <div className="card2-measure-side__special-lines" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={`special-line-${index}`} />
          ))}
        </div>
      </section>

      <section className="card2-measure-side__lower">
        <div className="card2-measure-side__signatures">
          {signatureFields.map((signatureField) => (
            <div className="card2-measure-side__signature" key={signatureField.label}>
              <h3 className="card2-measure-side__signature-label">{signatureField.label}</h3>
              <div className="card2-measure-side__signature-box">
                {isImageDataUrl(signatureField.value) ? (
                  <img
                    className="card2-measure-side__signature-image"
                    src={signatureField.value}
                    alt={signatureField.label}
                  />
                ) : (
                  formatValue(signatureField.value)
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="card2-measure-side__terms" dir="rtl" lang="ar">
          <h3 className="card2-measure-side__terms-title">الملاحظات والشروط</h3>
          <ul className="card2-measure-side__terms-list">
            {card2ArabicTerms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </div>
      </section>
    </aside>
  )
}
