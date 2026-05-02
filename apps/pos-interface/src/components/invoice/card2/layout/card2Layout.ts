import { CARD2_MAX_LINE_ITEMS } from '../types'
import type { Card2LineItemStyle } from '../types'
import type { Card2FieldRowLayout, PdfPoint, PdfRect } from './types'
import { mmToPt } from './units'

type Card2LineItemStyleGroupId = Exclude<keyof Card2LineItemStyle, 'jabzoor2' | 'collarPosition'>

interface Card2LineItemsFixedColumn {
  id: 'fabricType' | 'meters' | 'price' | 'fabricSource' | 'type' | 'line'
  title: string
  widthPercent: number
}

interface Card2LineItemsStyleGroup {
  id: Card2LineItemStyleGroupId
  title: string
}

export type Card2FieldSlotId =
  | 'orderNumber'
  | 'customerName'
  | 'customerMobile'
  | 'orderDate'
  | 'dueDate'
  | 'brovaStatus'
  | 'collarLengthWidth'
  | 'lengthFrontBack'
  | 'shoulder'
  | 'sleeves'
  | 'armholes'
  | 'width'
  | 'upChest'
  | 'chest'
  | 'halfChest'
  | 'waistFrontBack'
  | 'bottom'
  | 'measurementUnit'
  | 'topPocketLengthWidthDistance'
  | 'jabzoorMeasurement'
  | 'elbowMeasurement'
  | 'sidePocketLengthWidthDistanceOpening'
  | 'specialRequestNotes'
  | 'fabricTotalPrice'
  | 'grandTotal'
  | 'paid'
  | 'remaining'
  | 'paymentMethods'
  | 'orderSignature'
  | 'brovaSignature'
  | 'finalSignature'
  | 'customerCopyEmployeeSignature'
  | 'customerCopyRemarks'

interface Card2FieldSlotDefinition {
  label: string
  dataPath: string | readonly string[]
}

const createRect = (
  xInMillimeters: number,
  yInMillimeters: number,
  widthInMillimeters: number,
  heightInMillimeters: number,
): PdfRect => ({
  x: mmToPt(xInMillimeters),
  y: mmToPt(yInMillimeters),
  width: mmToPt(widthInMillimeters),
  height: mmToPt(heightInMillimeters),
})

const createPoint = (xInMillimeters: number, yInMillimeters: number): PdfPoint => ({
  x: mmToPt(xInMillimeters),
  y: mmToPt(yInMillimeters),
})

const PAGE_WIDTH_MM = 297
const PAGE_HEIGHT_MM = 420
const PAGE_MARGIN_MM = 8.5
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2

const headerFrame = createRect(PAGE_MARGIN_MM, PAGE_MARGIN_MM, CONTENT_WIDTH_MM, 9)
const orderHeaderFrame = createRect(PAGE_MARGIN_MM, 20.5, CONTENT_WIDTH_MM, 31)
const lineItemsFrame = createRect(PAGE_MARGIN_MM, 54.2, CONTENT_WIDTH_MM, 92)
const measurementsFrame = createRect(PAGE_MARGIN_MM, 148.8, CONTENT_WIDTH_MM, 92)
const specialRequestFrame = createRect(PAGE_MARGIN_MM, 243.3, CONTENT_WIDTH_MM, 20)
const lowerColumnsFrame = createRect(PAGE_MARGIN_MM, 266, CONTENT_WIDTH_MM, 56)

const lowerColumnsGap = mmToPt(2.4)
const lowerColumnWidth = (lowerColumnsFrame.width - lowerColumnsGap) / 2

const pricingFrame: PdfRect = {
  x: lowerColumnsFrame.x,
  y: lowerColumnsFrame.y,
  width: lowerColumnWidth,
  height: lowerColumnsFrame.height,
}

const signaturesFrame: PdfRect = {
  x: pricingFrame.x + pricingFrame.width + lowerColumnsGap,
  y: lowerColumnsFrame.y,
  width: lowerColumnWidth,
  height: lowerColumnsFrame.height,
}

export const card2FieldSlots: Readonly<Record<Card2FieldSlotId, Card2FieldSlotDefinition>> = {
  orderNumber: {
    label: 'No.',
    dataPath: 'orderHeader.orderNumber',
  },
  customerName: {
    label: 'Name',
    dataPath: 'orderHeader.customerName',
  },
  customerMobile: {
    label: 'Mobile',
    dataPath: 'orderHeader.customerMobile',
  },
  orderDate: {
    label: 'Date',
    dataPath: 'orderHeader.orderDate',
  },
  dueDate: {
    label: 'Due Date',
    dataPath: 'orderHeader.dueDate',
  },
  brovaStatus: {
    label: 'Brova',
    dataPath: 'orderHeader.brovaStatus',
  },
  collarLengthWidth: {
    label: 'Collar L/W',
    dataPath: [
      'measurements.onGarment.collar.length',
      'measurements.onGarment.collar.width',
    ],
  },
  lengthFrontBack: {
    label: 'Length Front/Back',
    dataPath: [
      'measurements.onGarment.length.front',
      'measurements.onGarment.length.back',
    ],
  },
  shoulder: {
    label: 'Shoulder',
    dataPath: 'measurements.onGarment.shoulder',
  },
  sleeves: {
    label: 'Sleeves',
    dataPath: 'measurements.onGarment.sleeves',
  },
  armholes: {
    label: 'Armholes',
    dataPath: 'measurements.onGarment.armholes',
  },
  width: {
    label: 'Width',
    dataPath: 'measurements.onGarment.width',
  },
  upChest: {
    label: 'Up Chest',
    dataPath: 'measurements.onGarment.upChest',
  },
  chest: {
    label: 'Chest',
    dataPath: 'measurements.onGarment.chest',
  },
  halfChest: {
    label: 'Half Chest',
    dataPath: 'measurements.onGarment.halfChest',
  },
  waistFrontBack: {
    label: 'Waist Front/Back',
    dataPath: [
      'measurements.onGarment.waist.front',
      'measurements.onGarment.waist.back',
    ],
  },
  bottom: {
    label: 'Bottom',
    dataPath: 'measurements.onGarment.bottom',
  },
  measurementUnit: {
    label: 'Unit',
    dataPath: 'measurements.unit',
  },
  topPocketLengthWidthDistance: {
    label: 'Top Pocket L/W/D',
    dataPath: [
      'measurements.besideGarment.topPocket.length',
      'measurements.besideGarment.topPocket.width',
      'measurements.besideGarment.topPocket.distance',
    ],
  },
  jabzoorMeasurement: {
    label: 'Jabzoor',
    dataPath: 'measurements.besideGarment.jabzoor',
  },
  elbowMeasurement: {
    label: 'Elbow',
    dataPath: 'measurements.besideGarment.elbow',
  },
  sidePocketLengthWidthDistanceOpening: {
    label: 'Side Pocket L/W/D/O',
    dataPath: [
      'measurements.besideGarment.sidePocket.length',
      'measurements.besideGarment.sidePocket.width',
      'measurements.besideGarment.sidePocket.distance',
      'measurements.besideGarment.sidePocket.opening',
    ],
  },
  specialRequestNotes: {
    label: 'Notes',
    dataPath: 'specialRequest',
  },
  fabricTotalPrice: {
    label: 'Fabric Total',
    dataPath: 'pricing.fabricTotalPrice',
  },
  grandTotal: {
    label: 'Grand Total',
    dataPath: 'pricing.grandTotal',
  },
  paid: {
    label: 'Paid',
    dataPath: 'pricing.paid',
  },
  remaining: {
    label: 'Remaining',
    dataPath: 'pricing.remaining',
  },
  paymentMethods: {
    label: 'Payment Methods',
    dataPath: 'pricing.paymentMethods',
  },
  orderSignature: {
    label: 'Order',
    dataPath: 'signatures.order',
  },
  brovaSignature: {
    label: 'Brova',
    dataPath: 'signatures.brova',
  },
  finalSignature: {
    label: 'Final',
    dataPath: 'signatures.final',
  },
  customerCopyEmployeeSignature: {
    label: 'Customer Copy Signature',
    dataPath: 'customerCopy.employeeSignature',
  },
  customerCopyRemarks: {
    label: 'Customer Copy Remarks',
    dataPath: 'customerCopy.remarks',
  },
}

const orderHeaderRows: readonly Card2FieldRowLayout<Card2FieldSlotId>[] = [
  [{ slotId: 'orderNumber' }],
  [
    { slotId: 'customerName' },
    { slotId: 'customerMobile' },
  ],
  [
    { slotId: 'orderDate' },
    { slotId: 'dueDate' },
    { slotId: 'brovaStatus' },
  ],
]

const measurementRows: readonly Card2FieldRowLayout<Card2FieldSlotId>[] = [
  [
    { slotId: 'collarLengthWidth' },
    { slotId: 'lengthFrontBack' },
    { slotId: 'shoulder' },
    { slotId: 'sleeves' },
  ],
  [
    { slotId: 'armholes' },
    { slotId: 'width' },
    { slotId: 'upChest' },
    { slotId: 'chest' },
  ],
  [
    { slotId: 'halfChest' },
    { slotId: 'waistFrontBack' },
    { slotId: 'bottom' },
    { slotId: 'measurementUnit' },
  ],
  [
    { slotId: 'topPocketLengthWidthDistance', grow: 2 },
    { slotId: 'jabzoorMeasurement' },
    { slotId: 'elbowMeasurement' },
  ],
  [{ slotId: 'sidePocketLengthWidthDistanceOpening' }],
]

const specialRequestRows: readonly Card2FieldRowLayout<Card2FieldSlotId>[] = [
  [{ slotId: 'specialRequestNotes' }],
]

const pricingRows: readonly Card2FieldRowLayout<Card2FieldSlotId>[] = [
  [
    { slotId: 'fabricTotalPrice' },
    { slotId: 'grandTotal' },
  ],
  [
    { slotId: 'paid' },
    { slotId: 'remaining' },
  ],
  [{ slotId: 'paymentMethods' }],
]

const signaturesRows: readonly Card2FieldRowLayout<Card2FieldSlotId>[] = [
  [
    { slotId: 'orderSignature' },
    { slotId: 'brovaSignature' },
    { slotId: 'finalSignature' },
  ],
  [{ slotId: 'customerCopyEmployeeSignature' }],
  [{ slotId: 'customerCopyRemarks' }],
]

const measurementAnchors: Readonly<Record<string, PdfPoint>> = {
  collar: createPoint(140, 160),
  shoulder: createPoint(153, 173),
  sleeves: createPoint(185, 173),
  chest: createPoint(151, 193),
  waist: createPoint(152, 209),
  bottom: createPoint(151, 226),
  topPocket: createPoint(166, 189),
  sidePocket: createPoint(176, 207),
  jabzoor: createPoint(151, 201),
  elbow: createPoint(188, 199),
}

const lineItemsFixedColumns: readonly Card2LineItemsFixedColumn[] = [
  { id: 'fabricType', title: 'Fabric Type', widthPercent: 7.4 },
  { id: 'meters', title: 'Meters', widthPercent: 3.4 },
  { id: 'price', title: 'Price', widthPercent: 3.4 },
  { id: 'fabricSource', title: 'Fabric Source', widthPercent: 3.8 },
  { id: 'type', title: 'Type', widthPercent: 2.9 },
  { id: 'line', title: 'Line', widthPercent: 2.9 },
]

const lineItemsStyleGroups: readonly Card2LineItemsStyleGroup[] = [
  { id: 'collarShape', title: 'Collar Shape' },
  { id: 'button', title: 'Button' },
  { id: 'jabzoor', title: 'Jabzoor' },
  { id: 'sidePocket', title: 'Side Pocket' },
  { id: 'topPocket', title: 'Top Pocket' },
  { id: 'sleeveShape', title: 'Sleeve Shape' },
]

export const card2Layout = {
  page: {
    size: 'A3' as const,
    width: mmToPt(PAGE_WIDTH_MM),
    height: mmToPt(PAGE_HEIGHT_MM),
    padding: {
      top: mmToPt(PAGE_MARGIN_MM),
      bottom: mmToPt(PAGE_MARGIN_MM),
      horizontal: mmToPt(PAGE_MARGIN_MM),
    },
    backgroundColor: '#ffffff',
    textColor: '#1f2933',
  },
  typography: {
    baseFontFamily: 'Helvetica',
    baseFontSize: 9,
    baseLineHeight: 1.35,
    headingSize: 14,
    headingWeight: 700,
    sectionTitleSize: 10,
    sectionTitleWeight: 700,
    labelSize: 7,
    tableHeaderSize: 7,
    tableHeaderWeight: 700,
    tableCellSize: 8,
    valueSize: 9,
    footerSize: 7,
    guideSize: 6,
  },
  spacing: {
    sectionGap: mmToPt(2.4),
    titleBottomGap: mmToPt(1.6),
    rowGap: mmToPt(1.1),
    fieldHorizontalGap: mmToPt(1.4),
    dualColumnGap: lowerColumnsGap,
    footerTopGap: mmToPt(0.4),
  },
  sectionStyle: {
    borderColor: '#cfd8df',
    borderRadius: mmToPt(1),
    borderWidth: 1,
    paddingVertical: mmToPt(2),
    paddingHorizontal: mmToPt(2),
    fieldBorderColor: '#dee5ea',
    fieldBorderRadius: mmToPt(0.8),
    fieldBackgroundColor: '#f8fbfc',
    fieldPaddingVertical: mmToPt(1.4),
    fieldPaddingHorizontal: mmToPt(1.8),
  },
  header: {
    frame: headerFrame,
    title: 'Card2 | Order Sheet',
    localeLabel: 'Locale',
    templateLabel: 'Template',
    headingColor: '#0c2530',
    metaColor: '#496273',
  },
  lineItemsTable: {
    rowCount: CARD2_MAX_LINE_ITEMS,
    rowMinHeight: mmToPt(7),
    fixedColumns: lineItemsFixedColumns,
    styleGroups: lineItemsStyleGroups,
  },
  sections: {
    orderHeader: {
      title: 'Order Header',
      frame: orderHeaderFrame,
      rows: orderHeaderRows,
    },
    lineItems: {
      title: 'Line Items',
      frame: lineItemsFrame,
    },
    measurements: {
      title: 'Measurements',
      frame: measurementsFrame,
      rows: measurementRows,
    },
    specialRequest: {
      title: 'Special Request',
      frame: specialRequestFrame,
      rows: specialRequestRows,
    },
    pricing: {
      title: 'Pricing & Payment',
      frame: pricingFrame,
      rows: pricingRows,
    },
    signatures: {
      title: 'Signatures',
      frame: signaturesFrame,
      rows: signaturesRows,
    },
  },
  footer: {
    text: 'Generated by Card2 PDF Renderer from typed order payload.',
  },
  guides: {
    strokeColor: '#e45757',
    labelColor: '#8f2d2d',
    anchorColor: '#ba1d1d',
    anchorRadius: mmToPt(0.6),
  },
  measurementAnchors,
} as const
