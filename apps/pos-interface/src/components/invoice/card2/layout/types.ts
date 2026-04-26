export interface PdfPoint {
  x: number
  y: number
}

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Card2FieldCellLayout<TSlotId extends string = string> {
  slotId: TSlotId
  grow?: number
}

export type Card2FieldRowLayout<TSlotId extends string = string> =
  readonly Card2FieldCellLayout<TSlotId>[]
