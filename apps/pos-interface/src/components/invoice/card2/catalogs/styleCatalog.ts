import type { Card2LineItemStyle, Card2Locale } from '../types'

interface LocalizedLabel {
  en: string
  ar: string
}

interface Card2StyleGroupCatalog {
  label: LocalizedLabel
  options: Readonly<Record<string, LocalizedLabel>>
}

export type Card2StyleGroupId = Exclude<keyof Card2LineItemStyle, 'jabzoor2'>

const resolveLocalizedLabel = (
  label: LocalizedLabel,
  locale: Card2Locale,
): string => {
  if (locale === 'ar') {
    return label.ar
  }

  return label.en
}

const humanizeId = (value: string): string =>
  value
    .split(/[-_]/)
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(' ')

export const card2StyleCatalog: Readonly<
  Record<Card2StyleGroupId, Card2StyleGroupCatalog>
> = {
  collarShape: {
    label: { en: 'Collar', ar: 'الياقة' },
    options: {
      'collar-classic': { en: 'Classic', ar: 'كلاسيكية' },
      'collar-soft': { en: 'Soft', ar: 'ناعمة' },
      'collar-sharp': { en: 'Sharp', ar: 'حادة' },
      'collar-rounded': { en: 'Rounded', ar: 'دائرية' },
    },
  },
  button: {
    label: { en: 'Buttons', ar: 'الأزرار' },
    options: {
      'button-hidden': { en: 'Hidden Placket', ar: 'مخفية' },
      'button-visible': { en: 'Visible Placket', ar: 'ظاهرة' },
      'button-press': { en: 'Press Buttons', ar: 'كبسات' },
    },
  },
  jabzoor: {
    label: { en: 'Jabzoor', ar: 'الجبزور' },
    options: {
      'jabzoor-straight': { en: 'Straight', ar: 'مستقيم' },
      'jabzoor-concealed': { en: 'Concealed', ar: 'مخفي' },
      'jabzoor-wide': { en: 'Wide', ar: 'عريض' },
    },
  },
  sidePocket: {
    label: { en: 'Side Pocket', ar: 'الجيب الجانبي' },
    options: {
      'side-pocket-single': { en: 'Single', ar: 'مفرد' },
      'side-pocket-double': { en: 'Double', ar: 'مزدوج' },
      'side-pocket-concealed': { en: 'Concealed', ar: 'مخفي' },
    },
  },
  topPocket: {
    label: { en: 'Top Pocket', ar: 'الجيب العلوي' },
    options: {
      'top-pocket-square': { en: 'Square', ar: 'مربع' },
      'top-pocket-angled': { en: 'Angled', ar: 'مائل' },
      'top-pocket-round': { en: 'Rounded', ar: 'دائري' },
    },
  },
  sleeveShape: {
    label: { en: 'Sleeves', ar: 'الأكمام' },
    options: {
      'sleeve-rounded': { en: 'Rounded Cuff', ar: 'كفة دائرية' },
      'sleeve-straight': { en: 'Straight Cuff', ar: 'كفة مستقيمة' },
      'sleeve-french': { en: 'French Cuff', ar: 'كفة فرنسية' },
    },
  },
}

export const resolveStyleGroupLabel = (
  groupId: Card2StyleGroupId,
  locale: Card2Locale,
): string => resolveLocalizedLabel(card2StyleCatalog[groupId].label, locale)

export const resolveStyleOptionLabel = (
  groupId: Card2StyleGroupId,
  optionId: string,
  locale: Card2Locale,
): string => {
  const option = card2StyleCatalog[groupId].options[optionId]

  if (!option) {
    return locale === 'ar' ? optionId : humanizeId(optionId)
  }

  return resolveLocalizedLabel(option, locale)
}
