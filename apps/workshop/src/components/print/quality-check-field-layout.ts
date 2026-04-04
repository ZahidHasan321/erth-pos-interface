export type QualityTemplateFieldOrientation = "horizontal" | "vertical";

export type QualityTemplateField = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  orientation?: QualityTemplateFieldOrientation;
};

export const qualityCheckTemplateFields = [
  { id: "collar", left: 46.1, top: 7.1, width: 8.8, height: 3.1 },
  { id: "wk1", left: 54.8, top: 10.9, width: 10.6, height: 3.1 },
  { id: "lengthFront", left: 36.6, top: 26.7, width: 10.6, height: 3.3 },
  { id: "lengthBack", left: 52.9, top: 26.7, width: 10.6, height: 3.3 },
  { id: "elbow", left: 18.8, top: 35.1, width: 9.6, height: 3.4 },
  { id: "shoulder", left: 44.2, top: 36.6, width: 12.0, height: 3.4 },
  {
    id: "sideUpper",
    left: 70.0,
    top: 28.5,
    width: 4.7,
    height: 12.8,
    orientation: "vertical",
  },
  { id: "sleeves", left: 34.2, top: 47.3, width: 10.2, height: 3.4 },
  { id: "armhole", left: 46.2, top: 47.3, width: 10.2, height: 3.4 },
  { id: "width", left: 58.0, top: 47.3, width: 10.2, height: 3.4 },
  {
    id: "sideLower",
    left: 70.0,
    top: 44.7,
    width: 4.9,
    height: 13.3,
    orientation: "vertical",
  },
  { id: "upperChest", left: 45.1, top: 59.2, width: 11.7, height: 3.4 },
  { id: "chest", left: 35.8, top: 68.5, width: 10.8, height: 3.4 },
  { id: "halfChest", left: 53.6, top: 68.5, width: 10.8, height: 3.4 },
  { id: "waistFront", left: 35.6, top: 79.5, width: 10.8, height: 3.4 },
  { id: "waistBack", left: 54.2, top: 79.5, width: 10.8, height: 3.4 },
  { id: "bottom", left: 44.2, top: 88.3, width: 13.7, height: 3.6 },
] as const satisfies readonly QualityTemplateField[];

export type QualityTemplateFieldId =
  (typeof qualityCheckTemplateFields)[number]["id"];
