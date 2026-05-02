import type { Fabric, Measurement } from '@repo/database'
import type {
  Card2HashwaCode,
  Card2LineItem,
  Card2PaymentMethod,
  Card2PdfData,
  Card2SidePocketCarryItem,
} from './types'
import type { GarmentSchema } from '@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema'

export interface MapToCard2Input {
  invoiceNumber?: string | number | null
  customer: {
    name?: string | null
    phone?: string | null
  }
  orderDate?: string | null
  deliveryDate?: string | null
  garments: GarmentSchema[]
  fabrics: Fabric[]
  measurement: Measurement | null | undefined
  measurementDisplayById?: Record<string, string>
  charges: {
    fabric?: number
    stitching?: number
    style?: number
    delivery?: number
    shelf?: number
  }
  orderTotal?: number
  paid?: number
  paymentType?: string | null
  specialRequest?: string | null
  orderTakerName?: string | null
  customerSignature?: string | null
}

const hashwaByDbValue: Record<string, Card2HashwaCode> = {
  SINGLE: 'S',
  DOUBLE: 'D',
  TRIPLE: 'T',
  'NO HASHWA': 'N',
}

const paymentMethodByDbValue: Record<string, Card2PaymentMethod> = {
  link_payment: 'link',
  cash: 'cash',
  knet: 'knet',
}

const toHashwa = (value?: string | null): Card2HashwaCode | undefined => {
  if (!value) return undefined
  return hashwaByDbValue[value]
}

const toNum = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toDateString = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().slice(0, 10)
}

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`

const buildLineItem = (
  garment: GarmentSchema,
  index: number,
  fabrics: Fabric[],
  measurementDisplayById: Record<string, string>,
): Card2LineItem => {
  const fabric = fabrics.find((f) => f.id === garment.fabric_id)
  const meters = toNum(garment.fabric_length)
  const pricePerMeter = toNum(fabric?.price_per_meter)
  const total = meters !== null && pricePerMeter !== null ? Number((meters * pricePerMeter).toFixed(2)) : null

  const carryItems: Card2SidePocketCarryItem[] = []
  if (garment.mobile_pocket) carryItems.push('mobile')
  if (garment.wallet_pocket) carryItems.push('wallet')

  const shopOrFabric = garment.fabric_source === 'OUT'
    ? (garment.shop_name?.trim() || undefined)
    : (fabric?.name ? truncate(fabric.name, 18) : undefined)

  const fabricStyleType = garment.style === 'kuwaiti' ? 'K' : garment.style === 'design' ? 'D' : undefined

  const measurementDisplay = garment.measurement_id
    ? measurementDisplayById[garment.measurement_id]
    : undefined

  return {
    lineNumber: ((index + 1) as Card2LineItem['lineNumber']),
    garmentId: garment.garment_id ?? undefined,
    measurementId: measurementDisplay,
    fabric: {
      fabricType: fabric?.name ?? undefined,
      shopOrFabric,
      meters: meters ?? undefined,
      price: total ?? undefined,
      source: garment.fabric_source === 'IN' ? 'in-house' : garment.fabric_source === 'OUT' ? 'out' : undefined,
      type: fabricStyleType,
      line: (garment.lines === 1 || garment.lines === 2 ? garment.lines : undefined) as 1 | 2 | undefined,
    },
    style: {
      collarShape: garment.collar_type
        ? {
            id: garment.collar_type,
            properties: {
              hashwa: toHashwa(garment.collar_thickness),
              smallTabaggi: garment.small_tabaggi ?? undefined,
            },
          }
        : undefined,
      collarPosition: garment.collar_position ?? undefined,
      button: garment.collar_button ? { id: garment.collar_button } : undefined,
      jabzoor: garment.jabzour_1
        ? { id: garment.jabzour_1, properties: { hashwa: toHashwa(garment.jabzour_thickness) } }
        : undefined,
      jabzoor2: garment.jabzour_2
        ? { id: garment.jabzour_2, properties: { hashwa: toHashwa(garment.jabzour_thickness) } }
        : undefined,
      sidePocket: carryItems.length > 0
        ? { id: 'SID_MUDAWWAR_SIDE_POCKET', properties: { carryItems } }
        : undefined,
      topPocket: garment.front_pocket_type
        ? {
            id: garment.front_pocket_type,
            properties: {
              hashwa: toHashwa(garment.front_pocket_thickness),
              hasPen: garment.pen_holder ?? undefined,
            },
          }
        : undefined,
      sleeveShape: garment.cuffs_type
        ? { id: garment.cuffs_type, properties: { hashwa: toHashwa(garment.cuffs_thickness) } }
        : undefined,
    },
  }
}

const buildMeasurements = (m: Measurement | null | undefined): Card2PdfData['measurements'] => {
  if (!m) return undefined
  return {
    unit: 'cm',
    onGarment: {
      collar: { length: toNum(m.collar_width), width: toNum(m.collar_height) },
      length: { front: toNum(m.length_front), back: toNum(m.length_back) },
      shoulder: toNum(m.shoulder),
      sleeves: toNum(m.sleeve_length),
      armholes: toNum(m.armhole),
      width: toNum(m.sleeve_width),
      upChest: toNum(m.chest_upper),
      chest: toNum(m.chest_full),
      halfChest: toNum(m.chest_front),
      waist: { front: toNum(m.waist_front), back: toNum(m.waist_back) },
      bottom: toNum(m.bottom),
    },
    besideGarment: {
      topPocket: {
        length: toNum(m.top_pocket_length),
        width: toNum(m.top_pocket_width),
        distance: toNum(m.top_pocket_distance),
      },
      jabzoor: toNum(m.jabzour_length),
      elbow: toNum(m.elbow),
      sidePocket: {
        length: toNum(m.side_pocket_length),
        width: toNum(m.side_pocket_width),
        distance: toNum(m.side_pocket_distance),
        opening: toNum(m.side_pocket_opening),
      },
    },
  }
}

export const mapToCard2Data = (input: MapToCard2Input): Card2PdfData => {
  const measurementDisplayById = input.measurementDisplayById ?? {}
  const lineItems = input.garments.slice(0, 8).map((g, i) => buildLineItem(g, i, input.fabrics, measurementDisplayById))

  const totalFabric = lineItems.reduce((sum, li) => sum + (typeof li.fabric?.price === 'number' ? li.fabric.price : 0), 0)
  const grandTotal = input.orderTotal ?? 0
  const paid = input.paid ?? 0
  const remaining = Math.max(0, grandTotal - paid)

  const paymentMethod = input.paymentType ? paymentMethodByDbValue[input.paymentType] : undefined
  const paymentMethods: Card2PaymentMethod[] = paymentMethod ? [paymentMethod] : []

  const inHouseTotal = input.garments
    .filter((g) => g.fabric_source === 'IN')
    .reduce((s, g) => s + (toNum(g.fabric_length) ?? 0), 0)
  const outTotal = input.garments
    .filter((g) => g.fabric_source === 'OUT')
    .reduce((s, g) => s + (toNum(g.fabric_length) ?? 0), 0)

  return {
    meta: { templateId: 'card2', locale: 'bilingual' },
    orderHeader: {
      orderNumber: input.invoiceNumber != null ? String(input.invoiceNumber) : undefined,
      customerName: input.customer.name ?? undefined,
      customerMobile: input.customer.phone ?? undefined,
      orderDate: toDateString(input.orderDate),
      dueDate: toDateString(input.deliveryDate),
      brovaStatus: input.garments.some((g) => g.garment_type === 'brova') ? 'yes' : 'no',
    },
    lineItems,
    measurements: buildMeasurements(input.measurement),
    specialRequest: input.specialRequest ?? undefined,
    pricing: {
      fabricTotalPrice: Number(totalFabric.toFixed(2)),
      grandTotal,
      paid,
      remaining,
      paymentMethods,
    },
    signatures: {
      order: input.customerSignature ?? null,
      brova: null,
      final: null,
    },
    customerCopy: {
      employeeSignature: input.orderTakerName ?? null,
      fabricSummary: {
        inHouse: inHouseTotal || undefined,
        out: outTotal || undefined,
        totalQuantity: input.garments.length || undefined,
      },
      paymentSummary: {
        total: grandTotal,
        paid,
        remaining,
        paymentMethods,
      },
      remarks: input.specialRequest ?? undefined,
    },
  }
}
