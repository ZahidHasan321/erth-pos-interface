const POINTS_PER_INCH = 72
const MILLIMETERS_PER_INCH = 25.4

export const POINTS_PER_MILLIMETER = POINTS_PER_INCH / MILLIMETERS_PER_INCH

export const mmToPt = (valueInMillimeters: number): number =>
  Number((valueInMillimeters * POINTS_PER_MILLIMETER).toFixed(3))
