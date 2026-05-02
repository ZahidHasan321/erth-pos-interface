import { Fragment, type ReactNode } from 'react'
import type {
  Card2HashwaCode,
  Card2LineItem,
  Card2Locale,
  Card2PaymentMethod,
  Card2SidePocketCarryItem,
  Card2StyleSelection,
} from '../types'
import { parseMeasurementParts } from '@repo/database'
import {
  resolveStyleGroupLabel,
  resolveStyleOptionLabel,
  type Card2StyleGroupId,
} from '../catalogs/styleCatalog'

interface LocalizedLabel {
  en: string
  ar: string
}

type PrimitiveValue = string | number | null | undefined

const EMPTY_VALUE = '-'

const resolveLocalizedLabel = (
  label: LocalizedLabel,
  locale: Card2Locale,
): string => {
  if (locale === 'ar') {
    return label.ar
  }

  return label.en
}

const yesNoLabels: Readonly<Record<'yes' | 'no', LocalizedLabel>> = {
  yes: { en: 'Yes', ar: 'نعم' },
  no: { en: 'No', ar: 'لا' },
}

const paymentMethodLabels: Readonly<Record<Card2PaymentMethod, LocalizedLabel>> = {
  link: { en: 'Payment Link', ar: 'رابط دفع' },
  cash: { en: 'Cash', ar: 'نقدي' },
  knet: { en: 'KNET', ar: 'كي نت' },
}

const stylePropertyLabels: Readonly<Record<string, LocalizedLabel>> = {
  hashwa: { en: 'Hashwa', ar: 'حشوة' },
  carryItems: { en: 'Carry Items', ar: 'الاستخدام' },
  hasPen: { en: 'Pen Slot', ar: 'مكان قلم' },
}

const hashwaCodeLabels: Readonly<Record<Card2HashwaCode, LocalizedLabel>> = {
  S: { en: 'Single', ar: 'مفرد' },
  D: { en: 'Double', ar: 'مزدوج' },
  T: { en: 'Triple', ar: 'ثلاثي' },
  N: { en: 'None', ar: 'بدون' },
}

const carryItemLabels: Readonly<Record<Card2SidePocketCarryItem, LocalizedLabel>> = {
  mobile: { en: 'Mobile', ar: 'جوال' },
  wallet: { en: 'Wallet', ar: 'محفظة' },
}

export const resolveCard2Locale = (locale?: Card2Locale): Card2Locale =>
  locale ?? 'bilingual'

export const formatValue = (value: PrimitiveValue): string => {
  if (value === null || value === undefined) {
    return EMPTY_VALUE
  }

  const normalizedValue = String(value).trim()
  return normalizedValue.length > 0 ? normalizedValue : EMPTY_VALUE
}

const StackedFraction = ({ numerator, denominator }: { numerator: number; denominator: number }) => (
  <span className="card2-frac">
    <span className="card2-frac__num">{numerator}</span>
    <span className="card2-frac__den">{denominator}</span>
  </span>
)

export const formatMeasurement = (value: PrimitiveValue): ReactNode => {
  if (value === null || value === undefined) return EMPTY_VALUE
  const parts = parseMeasurementParts(value)
  if (!parts) return EMPTY_VALUE
  const sign = parts.negative ? '-' : ''
  const deg = parts.hasDegree ? '°' : ''
  if (parts.numerator === 0) return `${sign}${parts.whole}${deg}`
  const fraction = <StackedFraction numerator={parts.numerator} denominator={parts.denominator} />
  if (parts.whole > 0) {
    return (
      <>
        {sign}
        {parts.whole}
        {' '}
        {fraction}
        {deg}
      </>
    )
  }
  return (
    <>
      {sign}
      {fraction}
      {deg}
    </>
  )
}

export const formatMeasurementTuple = (
  values: readonly PrimitiveValue[],
  separator: ReactNode = ' / ',
): ReactNode =>
  values.map((value, index) => (
    <Fragment key={index}>
      {index > 0 ? separator : null}
      {formatMeasurement(value)}
    </Fragment>
  ))

export const formatPaymentMethods = (
  paymentMethods: readonly Card2PaymentMethod[] | undefined,
  locale: Card2Locale,
): string => {
  if (!paymentMethods || paymentMethods.length === 0) {
    return EMPTY_VALUE
  }

  return paymentMethods
    .map((method) => resolveLocalizedLabel(paymentMethodLabels[method], locale))
    .join(', ')
}

const formatUnknownValue = (value: unknown, locale: Card2Locale): string => {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  if (typeof value === 'boolean') {
    return resolveLocalizedLabel(value ? yesNoLabels.yes : yesNoLabels.no, locale)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return EMPTY_VALUE
    }

    return value.map((entry) => formatUnknownValue(entry, locale)).join('/')
  }

  return formatValue(String(value))
}

const formatStylePropertyValue = (
  key: string,
  value: unknown,
  locale: Card2Locale,
): string => {
  if (key === 'hashwa' && typeof value === 'string') {
    const hashwaLabel = hashwaCodeLabels[value as Card2HashwaCode]
    if (hashwaLabel) {
      return resolveLocalizedLabel(hashwaLabel, locale)
    }
  }

  if (key === 'carryItems' && Array.isArray(value)) {
    if (value.length === 0) {
      return EMPTY_VALUE
    }

    return value
      .map((entry) => {
        const itemLabel = carryItemLabels[entry as Card2SidePocketCarryItem]
        if (!itemLabel) {
          return formatUnknownValue(entry, locale)
        }

        return resolveLocalizedLabel(itemLabel, locale)
      })
      .join('/')
  }

  return formatUnknownValue(value, locale)
}

const formatStyleProperties = (
  properties: object,
  locale: Card2Locale,
): string => {
  const entries = Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const propertyLabel = stylePropertyLabels[key]
      const localizedLabel = propertyLabel
        ? resolveLocalizedLabel(propertyLabel, locale)
        : key

      return `${localizedLabel}: ${formatStylePropertyValue(key, value, locale)}`
    })

  if (entries.length === 0) {
    return ''
  }

  return entries.join(', ')
}

const formatStyleSelection = <TProperties extends object>(
  groupId: Card2StyleGroupId,
  selection: Card2StyleSelection<TProperties>,
  locale: Card2Locale,
): string => {
  const optionLabel = resolveStyleOptionLabel(groupId, selection.id, locale)

  if (!selection.properties) {
    return optionLabel
  }

  const propertiesSummary = formatStyleProperties(selection.properties, locale)
  if (propertiesSummary.length === 0) {
    return optionLabel
  }

  return `${optionLabel} [${propertiesSummary}]`
}

export const formatLineItemFabricSummary = (lineItem?: Card2LineItem): string => {
  const fabric = lineItem?.fabric

  if (!fabric) {
    return EMPTY_VALUE
  }

  const parts = [
    fabric.fabricType,
    fabric.source,
    fabric.type,
    fabric.line ? `line ${fabric.line}` : undefined,
    fabric.meters !== undefined ? `${formatValue(fabric.meters)} m` : undefined,
  ]
    .filter((part) => part !== undefined && part !== null && String(part).trim().length > 0)
    .map((part) => String(part))

  return parts.length > 0 ? parts.join(' | ') : EMPTY_VALUE
}

export const formatLineItemStyleSummary = (
  lineItem: Card2LineItem | undefined,
  locale: Card2Locale,
): string => {
  const style = lineItem?.style

  if (!style) {
    return EMPTY_VALUE
  }

  const parts: string[] = []

  if (style.collarShape) {
    parts.push(
      `${resolveStyleGroupLabel('collarShape', locale)}: ${formatStyleSelection('collarShape', style.collarShape, locale)}`,
    )
  }

  if (style.collarPosition) {
    parts.push(`Collar: ${style.collarPosition === 'up' ? 'UP' : 'DOWN'}`)
  }

  if (style.button) {
    parts.push(
      `${resolveStyleGroupLabel('button', locale)}: ${formatStyleSelection('button', style.button, locale)}`,
    )
  }

  if (style.jabzoor) {
    const primary = formatStyleSelection('jabzoor', style.jabzoor, locale)
    const secondary = style.jabzoor2
      ? formatStyleSelection('jabzoor', style.jabzoor2, locale)
      : null
    const value = secondary ? `${primary} + ${secondary}` : primary
    parts.push(`${resolveStyleGroupLabel('jabzoor', locale)}: ${value}`)
  }

  if (style.sidePocket) {
    parts.push(
      `${resolveStyleGroupLabel('sidePocket', locale)}: ${formatStyleSelection('sidePocket', style.sidePocket, locale)}`,
    )
  }

  if (style.topPocket) {
    parts.push(
      `${resolveStyleGroupLabel('topPocket', locale)}: ${formatStyleSelection('topPocket', style.topPocket, locale)}`,
    )
  }

  if (style.sleeveShape) {
    parts.push(
      `${resolveStyleGroupLabel('sleeveShape', locale)}: ${formatStyleSelection('sleeveShape', style.sleeveShape, locale)}`,
    )
  }

  return parts.length > 0 ? parts.join(' | ') : EMPTY_VALUE
}

export const formatLineItemPriceSummary = (lineItem?: Card2LineItem): string =>
  formatValue(lineItem?.fabric?.price)
