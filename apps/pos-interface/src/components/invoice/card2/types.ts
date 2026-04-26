export const CARD2_MAX_LINE_ITEMS = 8 as const

export type Card2Locale = 'ar' | 'en' | 'bilingual'
export type Card2DateValue = string
export type Card2MeasurementValue = number | string | null
export type Card2AmountValue = number | string | null
export type Card2SignatureValue = string | null

export type Card2BrovaStatus = 'yes' | 'no' | 'ok' | 'pending'
export type Card2PaymentMethod = 'link' | 'cash' | 'knet'
export type Card2FabricSource = 'in-house' | 'out'
export type Card2FabricType = 'K' | 'S'
export type Card2FabricLine = 1 | 2
export type Card2LineNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Card2HashwaCode = 'S' | 'D' | 'T' | 'N'
export type Card2SidePocketCarryItem = 'mobile' | 'wallet'

export interface Card2StyleSelection<
  TProperties extends object = Record<string, never>,
> {
  id: string
  properties?: TProperties
}

export interface Card2JabzoorStyleProperties {
  hashwa?: Card2HashwaCode
}

export interface Card2SidePocketStyleProperties {
  hashwa?: Card2HashwaCode
  carryItems?: Card2SidePocketCarryItem[]
}

export interface Card2TopPocketStyleProperties {
  hashwa?: Card2HashwaCode
  hasPen?: boolean
}

export interface Card2SleeveShapeStyleProperties {
  hashwa?: Card2HashwaCode
}

export interface Card2LineItemStyle {
  collarShape?: Card2StyleSelection
  button?: Card2StyleSelection
  jabzoor?: Card2StyleSelection<Card2JabzoorStyleProperties>
  sidePocket?: Card2StyleSelection<Card2SidePocketStyleProperties>
  topPocket?: Card2StyleSelection<Card2TopPocketStyleProperties>
  sleeveShape?: Card2StyleSelection<Card2SleeveShapeStyleProperties>
}

export interface Card2LineItemFabric {
  fabricType?: string
  meters?: Card2MeasurementValue
  price?: Card2AmountValue
  source?: Card2FabricSource
  type?: Card2FabricType
  line?: Card2FabricLine
}

export interface Card2LineItem {
  lineNumber: Card2LineNumber
  fabric?: Card2LineItemFabric
  style?: Card2LineItemStyle
}

export interface Card2OrderHeader {
  orderNumber?: string
  customerName?: string
  customerMobile?: string
  orderDate?: Card2DateValue
  dueDate?: Card2DateValue
  brovaStatus?: Card2BrovaStatus
}

export interface Card2OnGarmentMeasurements {
  collar?: {
    length?: Card2MeasurementValue
    width?: Card2MeasurementValue
  }
  length?: {
    front?: Card2MeasurementValue
    back?: Card2MeasurementValue
  }
  shoulder?: Card2MeasurementValue
  sleeves?: Card2MeasurementValue
  armholes?: Card2MeasurementValue
  width?: Card2MeasurementValue
  upChest?: Card2MeasurementValue
  chest?: Card2MeasurementValue
  halfChest?: Card2MeasurementValue
  waist?: {
    front?: Card2MeasurementValue
    back?: Card2MeasurementValue
  }
  bottom?: Card2MeasurementValue
}

export interface Card2TopPocketMeasurements {
  length?: Card2MeasurementValue
  width?: Card2MeasurementValue
  distance?: Card2MeasurementValue
}

export interface Card2SidePocketMeasurements {
  length?: Card2MeasurementValue
  width?: Card2MeasurementValue
  distance?: Card2MeasurementValue
  opening?: Card2MeasurementValue
}

export interface Card2BesideGarmentMeasurements {
  topPocket?: Card2TopPocketMeasurements
  jabzoor?: Card2MeasurementValue
  elbow?: Card2MeasurementValue
  sidePocket?: Card2SidePocketMeasurements
}

export interface Card2Measurements {
  unit?: string
  onGarment?: Card2OnGarmentMeasurements
  besideGarment?: Card2BesideGarmentMeasurements
}

export interface Card2Pricing {
  fabricTotalPrice?: Card2AmountValue
  grandTotal?: Card2AmountValue
  paid?: Card2AmountValue
  remaining?: Card2AmountValue
  paymentMethods?: Card2PaymentMethod[]
}

export interface Card2Signatures {
  order?: Card2SignatureValue
  brova?: Card2SignatureValue
  final?: Card2SignatureValue
}

export interface Card2CustomerCopyFabricSummary {
  fabric?: string
  inHouse?: Card2MeasurementValue
  out?: Card2MeasurementValue
  totalQuantity?: Card2MeasurementValue
}

export interface Card2CustomerCopyPaymentSummary {
  total?: Card2AmountValue
  paid?: Card2AmountValue
  remaining?: Card2AmountValue
  paymentMethods?: Card2PaymentMethod[]
}

export interface Card2CustomerCopy {
  employeeSignature?: Card2SignatureValue
  fabricSummary?: Card2CustomerCopyFabricSummary
  paymentSummary?: Card2CustomerCopyPaymentSummary
  remarks?: string
}

export interface Card2PdfMeta {
  templateId?: string
  templateVersion?: string
  locale?: Card2Locale
}

export interface Card2PdfData {
  meta?: Card2PdfMeta
  orderHeader?: Card2OrderHeader
  lineItems?: Card2LineItem[]
  measurements?: Card2Measurements
  specialRequest?: string
  pricing?: Card2Pricing
  signatures?: Card2Signatures
  customerCopy?: Card2CustomerCopy
}

export interface Card2PdfProps {
  data: Card2PdfData
}
