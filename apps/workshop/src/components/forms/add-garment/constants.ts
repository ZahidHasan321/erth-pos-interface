// Style option constants. Values mirror POS exactly — they're written to
// garments.{collar_type, jabzour_1, …} and read back by the same filtering
// / display logic. Images live in apps/workshop/src/assets (mirrored from
// POS so the two apps stay visually consistent).

import japaneseCollar from "@/assets/collar-assets/collar-types/Japanese.png";
import qalabiCollar from "@/assets/collar-assets/collar-types/Qallabi.png";
import roundCollar from "@/assets/collar-assets/collar-types/Down Collar.png";
import straitCollar from "@/assets/collar-assets/collar-types/Strait Collar.png";

import araviZarrar from "@/assets/collar-assets/collar-buttons/Aravi Zarrar.png";
import zarrarTabbagi from "@/assets/collar-assets/collar-buttons/Zarrar + Tabbagi.png";
import tabbagi from "@/assets/collar-assets/collar-buttons/Tabbagi.png";

import smallTabaggiImage from "@/assets/collar-assets/Small Tabbagi.png";

import bainMurabba from "@/assets/jabzour-assets/Bain Murabba.png";
import bainMusallas from "@/assets/jabzour-assets/Bain Musallas.png";
import magfiMurabba from "@/assets/jabzour-assets/Magfi Murabba.png";
import magfiMusallas from "@/assets/jabzour-assets/Magfi  Musallas.png";
import shaab from "@/assets/jabzour-assets/Shaab.png";

import mudawwarMagfiFrontPocket from "@/assets/top-pocket-assets/Mudawwar Magfi Front Pocket.png";
import murabbaFrontPocket from "@/assets/top-pocket-assets/Murabba Front Pocket.png";
import musallasFrontPocket from "@/assets/top-pocket-assets/Musallas Front Pocket.png";
import mudawwarFrontPocket from "@/assets/top-pocket-assets/Mudawwar Front Pocket.png";

import doubleGumsha from "@/assets/sleeves-assets/sleeves-types/Double Gumsha.png";
import murabbaKabak from "@/assets/sleeves-assets/sleeves-types/Murabba Kabak.png";
import musallasKabbak from "@/assets/sleeves-assets/sleeves-types/Musallas Kabbak.png";
import mudawarKabbak from "@/assets/sleeves-assets/sleeves-types/Mudawar Kabbak.png";

import penIcon from "@/assets/Pen.png";
import phoneIcon from "@/assets/Phone.png";
import walletIcon from "@/assets/Wallet.png";

export interface BaseOption {
  value: string;
  displayText: string;
  image: string | null;
  alt?: string;
}

export const thicknessOptions = [
  { value: "SINGLE", label: "S", full: "Single" },
  { value: "DOUBLE", label: "D", full: "Double" },
  { value: "TRIPLE", label: "T", full: "Triple" },
  { value: "NO HASHWA", label: "N", full: "No Hashwa" },
] as const;

export const collarTypes: BaseOption[] = [
  { value: "COL_QALLABI", displayText: "Qallabi", image: qalabiCollar },
  { value: "COL_DOWN_COLLAR", displayText: "Round", image: roundCollar },
  { value: "COL_JAPANESE", displayText: "Japanese", image: japaneseCollar },
  { value: "COL_STRAIT_COLLAR", displayText: "Strait", image: straitCollar },
];

export const collarButtons: BaseOption[] = [
  { value: "COL_ARAVI_ZARRAR", displayText: "Aravi Zarrar", image: araviZarrar },
  { value: "COL_ZARRAR__TABBAGI", displayText: "Zarrar + Tabbagi", image: zarrarTabbagi },
  { value: "COL_TABBAGI", displayText: "Tabbagi", image: tabbagi },
];

export const jabzourTypes: BaseOption[] = [
  { value: "JAB_BAIN_MURABBA", displayText: "Bain Murabba", image: bainMurabba },
  { value: "JAB_BAIN_MUSALLAS", displayText: "Bain Musallas", image: bainMusallas },
  { value: "JAB_MAGFI_MURABBA", displayText: "Magfi Murabba", image: magfiMurabba },
  { value: "JAB_MAGFI_MUSALLAS", displayText: "Magfi Musallas", image: magfiMusallas },
  { value: "JAB_SHAAB", displayText: "Zipper", image: shaab },
];

export const topPocketTypes: BaseOption[] = [
  { value: "FRO_MUDAWWAR_MAGFI_FRONT_POCKET", displayText: "Mudawwar Magfi", image: mudawwarMagfiFrontPocket },
  { value: "FRO_MURABBA_FRONT_POCKET", displayText: "Murabba", image: murabbaFrontPocket },
  { value: "FRO_MUSALLAS_FRONT_POCKET", displayText: "Musallas", image: musallasFrontPocket },
  { value: "FRO_MUDAWWAR_FRONT_POCKET", displayText: "Mudawwar", image: mudawwarFrontPocket },
];

export const cuffTypes: BaseOption[] = [
  { value: "CUF_DOUBLE_GUMSHA", displayText: "French Cuff", image: doubleGumsha },
  { value: "CUF_MURABBA_KABAK", displayText: "Murabba Kabak", image: murabbaKabak },
  { value: "CUF_MUSALLAS_KABBAK", displayText: "Musallas Kabbak", image: musallasKabbak },
  { value: "CUF_MUDAWAR_KABBAK", displayText: "Mudawar Kabbak", image: mudawarKabbak },
  { value: "CUF_NO_CUFF", displayText: "No Cuff", image: null },
];

export { smallTabaggiImage, penIcon, phoneIcon, walletIcon };

export const fabricSourceValues = ["IN", "OUT"] as const;
export type FabricSource = (typeof fabricSourceValues)[number];

// Measurement groups — laid out as columns so each card renders as a
// small table (label row + input row), matching POS new-work-order. Field
// labels come from the central spec (getLabel) at the render site so naming
// stays in lock-step with QC and the new-measurement form.
export const MEASUREMENT_GROUPS: {
  title: string;
  fields: { key: string }[];
}[] = [
  {
    title: "Collar",
    fields: [
      { key: "collar_width" },
      { key: "collar_height" },
    ],
  },
  {
    title: "Shoulder & Arm",
    fields: [
      { key: "shoulder" },
      { key: "armhole_front" },
      { key: "sleeve_length" },
      { key: "sleeve_width" },
      { key: "elbow" },
    ],
  },
  {
    title: "Chest",
    fields: [
      { key: "chest_upper" },
      { key: "chest_full" },
      { key: "chest_front" },
      { key: "chest_back" },
      { key: "chest_provision" },
    ],
  },
  {
    title: "Pockets",
    fields: [
      { key: "top_pocket_length" },
      { key: "top_pocket_width" },
      { key: "top_pocket_distance" },
      { key: "side_pocket_length" },
      { key: "side_pocket_width" },
      { key: "side_pocket_distance" },
      { key: "side_pocket_opening" },
    ],
  },
  {
    title: "Waist & Length",
    fields: [
      { key: "waist_full" },
      { key: "waist_front" },
      { key: "waist_back" },
      { key: "waist_provision" },
      { key: "length_front" },
      { key: "length_back" },
      { key: "bottom" },
    ],
  },
  {
    title: "Jabzour",
    fields: [
      { key: "jabzour_length" },
      { key: "jabzour_width" },
    ],
  },
];

export const ALL_MEASUREMENT_KEYS: string[] = MEASUREMENT_GROUPS.flatMap((g) =>
  g.fields.map((f) => f.key),
);
