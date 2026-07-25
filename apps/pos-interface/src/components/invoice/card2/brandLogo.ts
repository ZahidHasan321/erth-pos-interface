// The card's logo, resolved from the active brand (same source as the
// invoices). ERTH keeps the card-specific artwork that the layout was tuned
// around; the other brands use their standard dark-ink logo.
import { getInvoiceBrand } from '../brand'
import erthCardLogo from './assets/logo.svg'

export const getCard2BrandLogo = (): { src: string; alt: string } => {
  const brand = getInvoiceBrand()
  return {
    src: brand.key === 'ERTH' ? erthCardLogo : brand.logo,
    alt: `${brand.name} Logo`,
  }
}
