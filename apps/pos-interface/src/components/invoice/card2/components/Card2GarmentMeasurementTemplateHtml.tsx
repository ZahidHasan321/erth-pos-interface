import type { Card2PdfData } from '../types'
import measGarmentSvg from '../assets/meas_garment.svg'
import { formatMeasurement } from '../formatters/card2Formatters'

interface Card2GarmentMeasurementTemplateHtmlProps {
  data: Card2PdfData
}

interface MeasurementOverlayBox {
  left: number
  top: number
  width: number
  height: number
}

const measurementOverlayBoxes = {
  frontPocketDistance: { left: 25.112, top: 4.08, width: 12.682, height: 5.903 },
  lengthFront: { left: 25.112, top: 18.876, width: 12.682, height: 5.903 },
  lengthBack: { left: 39.69, top: 18.876, width: 12.682, height: 5.903 },
  shoulder: { left: 32.011, top: 31.272, width: 13.459, height: 6.266 },
  sleeves: { left: 23.558, top: 44.341, width: 8.482, height: 4.836 },
  armholes: { left: 34.713, top: 44.341, width: 8.482, height: 4.836 },
  width: { left: 45.278, top: 44.341, width: 8.482, height: 4.836 },
  upChest: { left: 32.011, top: 56.062, width: 13.459, height: 6.266 },
  chest: { left: 25.112, top: 67.171, width: 12.682, height: 5.903 },
  halfChest: { left: 39.69, top: 67.171, width: 12.682, height: 5.903 },
  waistFront: { left: 25.112, top: 80.684, width: 12.682, height: 5.903 },
  waistBack: { left: 39.69, top: 80.684, width: 12.682, height: 5.903 },
  bottom: { left: 32.011, top: 92.14, width: 13.459, height: 6.266 },
  topPocketLength: { left: 88.041, top: 11.964, width: 11.871, height: 6.362 },
  topPocketWidth: { left: 88.041, top: 18.326, width: 11.871, height: 6.362 },
  topPocketDistance: { left: 88.041, top: 24.688, width: 11.871, height: 6.362 },
  jabzoor: { left: 88.041, top: 34.479, width: 11.871, height: 5.533 },
  elbow: { left: 88.041, top: 42.95, width: 11.871, height: 5.576 },
  sidePocketLength: { left: 88.041, top: 55.053, width: 11.871, height: 6.364 },
  sidePocketWidth: { left: 88.041, top: 61.417, width: 11.871, height: 6.362 },
  sidePocketDistance: { left: 88.041, top: 67.779, width: 11.871, height: 6.362 },
  sidePocketOpening: { left: 88.041, top: 74.141, width: 11.871, height: 6.246 },
} as const satisfies Record<string, MeasurementOverlayBox>

type MeasurementOverlayKey = keyof typeof measurementOverlayBoxes

const buildMeasurementOverlayValues = (
  data: Card2PdfData,
): Record<MeasurementOverlayKey, string> => {
  const onGarment = data.measurements?.onGarment
  const besideGarment = data.measurements?.besideGarment

  return {
    frontPocketDistance: formatMeasurement(besideGarment?.topPocket?.distance),
    lengthFront: formatMeasurement(onGarment?.length?.front),
    lengthBack: formatMeasurement(onGarment?.length?.back),
    shoulder: formatMeasurement(onGarment?.shoulder),
    sleeves: formatMeasurement(onGarment?.sleeves),
    armholes: formatMeasurement(onGarment?.armholes),
    width: formatMeasurement(onGarment?.width),
    upChest: formatMeasurement(onGarment?.upChest),
    chest: formatMeasurement(onGarment?.chest),
    halfChest: formatMeasurement(onGarment?.halfChest),
    waistFront: formatMeasurement(onGarment?.waist?.front),
    waistBack: formatMeasurement(onGarment?.waist?.back),
    bottom: formatMeasurement(onGarment?.bottom),
    topPocketLength: formatMeasurement(besideGarment?.topPocket?.length),
    topPocketWidth: formatMeasurement(besideGarment?.topPocket?.width),
    topPocketDistance: formatMeasurement(besideGarment?.topPocket?.distance),
    jabzoor: formatMeasurement(besideGarment?.jabzoor),
    elbow: formatMeasurement(besideGarment?.elbow),
    sidePocketLength: formatMeasurement(besideGarment?.sidePocket?.length),
    sidePocketWidth: formatMeasurement(besideGarment?.sidePocket?.width),
    sidePocketDistance: formatMeasurement(besideGarment?.sidePocket?.distance),
    sidePocketOpening: formatMeasurement(besideGarment?.sidePocket?.opening),
  }
}

export function Card2GarmentMeasurementTemplateHtml({
  data,
}: Card2GarmentMeasurementTemplateHtmlProps) {
  const measurementOverlayValues = buildMeasurementOverlayValues(data)

  return (
    <div className="card2-measurements-html">
      <div className="card2-measurements-html__canvas">
        <img className="card2-measurements-html__image" src={measGarmentSvg} alt="Garment template" />

        {Object.entries(measurementOverlayBoxes).map(([measurementKey, measurementBox]) => (
          <span
            className="card2-measurements-html__value"
            key={measurementKey}
            style={{
              left: `${measurementBox.left}%`,
              top: `${measurementBox.top}%`,
              width: `${measurementBox.width}%`,
              height: `${measurementBox.height}%`,
            }}
          >
            {measurementOverlayValues[measurementKey as MeasurementOverlayKey]}
          </span>
        ))}
      </div>
    </div>
  )
}
