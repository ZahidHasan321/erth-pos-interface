export type TemplateFieldOrientation = "horizontal" | "vertical";

export type TemplateField = {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  orientation?: TemplateFieldOrientation;
};

export const defaultTemplateFieldLayout = [
  {
    id: "collar",
    label: "Collar",
    left: 46.1,
    top: 7.1,
    width: 8.8,
    height: 3.1,
  },
  { id: "wk1", label: "Wk1", left: 54.8, top: 10.9, width: 10.6, height: 3.1 },
  {
    id: "lengthFront",
    label: "Length Front",
    left: 36.6,
    top: 26.7,
    width: 10.6,
    height: 3.3,
  },
  {
    id: "lengthBack",
    label: "Length Back",
    left: 52.9,
    top: 26.7,
    width: 10.6,
    height: 3.3,
  },
  {
    id: "elbow",
    label: "Elbow",
    left: 18.8,
    top: 35.1,
    width: 9.6,
    height: 3.4,
  },
  {
    id: "shoulder",
    label: "Shoulder",
    left: 44.2,
    top: 36.6,
    width: 12.0,
    height: 3.4,
  },
  {
    id: "sideUpper",
    label: "Side Upper",
    left: 70.0,
    top: 28.5,
    width: 4.7,
    height: 12.8,
    orientation: "vertical",
  },
  {
    id: "sleeves",
    label: "Sleeves",
    left: 34.2,
    top: 47.3,
    width: 10.2,
    height: 3.4,
  },
  {
    id: "armhole",
    label: "Armhole",
    left: 46.2,
    top: 47.3,
    width: 10.2,
    height: 3.4,
  },
  {
    id: "width",
    label: "Width",
    left: 58.0,
    top: 47.3,
    width: 10.2,
    height: 3.4,
  },
  {
    id: "sideLower",
    label: "Side Lower",
    left: 70.0,
    top: 44.7,
    width: 4.9,
    height: 13.3,
    orientation: "vertical",
  },
  {
    id: "upperChest",
    label: "Upper Chest",
    left: 45.1,
    top: 59.2,
    width: 11.7,
    height: 3.4,
  },
  {
    id: "chest",
    label: "Chest",
    left: 35.8,
    top: 68.5,
    width: 10.8,
    height: 3.4,
  },
  {
    id: "halfChest",
    label: "Half Chest",
    left: 53.6,
    top: 68.5,
    width: 10.8,
    height: 3.4,
  },
  {
    id: "waistFront",
    label: "Waist Front",
    left: 35.6,
    top: 79.5,
    width: 10.8,
    height: 3.4,
  },
  {
    id: "waistBack",
    label: "Waist Back",
    left: 54.2,
    top: 79.5,
    width: 10.8,
    height: 3.4,
  },
  {
    id: "bottom",
    label: "Bottom",
    left: 44.2,
    top: 88.3,
    width: 13.7,
    height: 3.6,
  },
] as const satisfies readonly TemplateField[];

export type MeasurementFieldId =
  (typeof defaultTemplateFieldLayout)[number]["id"];

export type MeasurementValues = Partial<Record<MeasurementFieldId, string>>;
