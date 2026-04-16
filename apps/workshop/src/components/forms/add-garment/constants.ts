// Style option constants, image-less port of POS constants.ts.
// Workshop UI doesn't carry the same asset pipeline, so options render
// as labelled buttons/selects. Values must match POS exactly — they're
// written to garments.{collar_type, jabzour_1, cuffs_type, …} and read
// back by the same filtering/display logic.

export interface BaseOption {
  value: string;
  displayText: string;
}

export const thicknessOptions = [
  { value: "SINGLE", label: "Single" },
  { value: "DOUBLE", label: "Double" },
  { value: "TRIPLE", label: "Triple" },
  { value: "NO HASHWA", label: "No Hashwa" },
] as const;

export const collarTypes: BaseOption[] = [
  { value: "COL_QALLABI", displayText: "Qallabi" },
  { value: "COL_DOWN_COLLAR", displayText: "Round" },
  { value: "COL_JAPANESE", displayText: "Japanese" },
  { value: "COL_STRAIT_COLLAR", displayText: "Strait" },
];

export const collarButtons: BaseOption[] = [
  { value: "COL_ARAVI_ZARRAR", displayText: "Aravi Zarrar" },
  { value: "COL_ZARRAR__TABBAGI", displayText: "Zarrar + Tabbagi" },
  { value: "COL_TABBAGI", displayText: "Tabbagi" },
];

export const jabzourTypes: BaseOption[] = [
  { value: "JAB_BAIN_MURABBA", displayText: "Bain Murabba" },
  { value: "JAB_BAIN_MUSALLAS", displayText: "Bain Musallas" },
  { value: "JAB_MAGFI_MURABBA", displayText: "Magfi Murabba" },
  { value: "JAB_MAGFI_MUSALLAS", displayText: "Magfi Musallas" },
  { value: "JAB_SHAAB", displayText: "Shaab" },
];

export const topPocketTypes: BaseOption[] = [
  { value: "FRO_MUDAWWAR_MAGFI_FRONT_POCKET", displayText: "Mudawwar Magfi" },
  { value: "FRO_MURABBA_FRONT_POCKET", displayText: "Murabba" },
  { value: "FRO_MUSALLAS_FRONT_POCKET", displayText: "Musallas" },
  { value: "FRO_MUDAWWAR_FRONT_POCKET", displayText: "Mudawwar" },
];

export const cuffTypes: BaseOption[] = [
  { value: "CUF_DOUBLE_GUMSHA", displayText: "Double Gumsha" },
  { value: "CUF_MURABBA_KABAK", displayText: "Murabba Kabak" },
  { value: "CUF_MUSALLAS_KABBAK", displayText: "Musallas Kabbak" },
  { value: "CUF_MUDAWAR_KABBAK", displayText: "Mudawar Kabbak" },
  { value: "CUF_NO_CUFF", displayText: "No Cuff" },
];

export const fabricSourceValues = ["IN", "OUT"] as const;
export type FabricSource = (typeof fabricSourceValues)[number];

// Measurement fields grouped for the form. Order matches POS layout.
// Keys must match the measurements table columns (see schema.ts).
export const MEASUREMENT_GROUPS: {
  title: string;
  fields: { key: string; label: string }[];
}[] = [
  {
    title: "Collar",
    fields: [
      { key: "collar_width", label: "Collar Width" },
      { key: "collar_height", label: "Collar Height" },
    ],
  },
  {
    title: "Shoulder & Arm",
    fields: [
      { key: "shoulder", label: "Shoulder" },
      { key: "armhole", label: "Armhole" },
      { key: "armhole_front", label: "Armhole Front" },
      { key: "armhole_provision", label: "Armhole Provision" },
      { key: "sleeve_length", label: "Sleeve Length" },
      { key: "sleeve_width", label: "Sleeve Width" },
      { key: "elbow", label: "Elbow" },
    ],
  },
  {
    title: "Chest",
    fields: [
      { key: "chest_upper", label: "Chest Upper" },
      { key: "chest_full", label: "Chest Full" },
      { key: "chest_front", label: "Chest Front" },
      { key: "chest_back", label: "Chest Back" },
      { key: "chest_provision", label: "Chest Provision" },
    ],
  },
  {
    title: "Pockets",
    fields: [
      { key: "top_pocket_length", label: "Top Pocket Length" },
      { key: "top_pocket_width", label: "Top Pocket Width" },
      { key: "top_pocket_distance", label: "Top Pocket Distance" },
      { key: "side_pocket_length", label: "Side Pocket Length" },
      { key: "side_pocket_width", label: "Side Pocket Width" },
      { key: "side_pocket_distance", label: "Side Pocket Distance" },
      { key: "side_pocket_opening", label: "Side Pocket Opening" },
    ],
  },
  {
    title: "Waist & Length",
    fields: [
      { key: "waist_full", label: "Waist Full" },
      { key: "waist_front", label: "Waist Front" },
      { key: "waist_back", label: "Waist Back" },
      { key: "waist_provision", label: "Waist Provision" },
      { key: "length_front", label: "Length Front" },
      { key: "length_back", label: "Length Back" },
      { key: "bottom", label: "Bottom" },
    ],
  },
  {
    title: "Jabzour",
    fields: [
      { key: "jabzour_length", label: "Jabzour Length" },
      { key: "jabzour_width", label: "Jabzour Width" },
    ],
  },
];

export const ALL_MEASUREMENT_KEYS: string[] = MEASUREMENT_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key),
);
