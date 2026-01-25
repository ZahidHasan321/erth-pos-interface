import { FABRIC_MATRIX_2D } from '../constants/fabric-matrix';

export function getFabricValue(length: number, bottom: number): number | undefined {
  const lengthIndex = FABRIC_MATRIX_2D.lengths.indexOf(length as any);
  const bottomIndex = FABRIC_MATRIX_2D.bottoms.indexOf(bottom as any);

  if (lengthIndex === -1 || bottomIndex === -1) {
    console.warn(`Length ${length} or Bottom ${bottom} not found in matrix.`);
    return undefined;
  }

  return FABRIC_MATRIX_2D.data[lengthIndex][bottomIndex];
}
