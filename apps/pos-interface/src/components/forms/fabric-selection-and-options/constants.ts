// constants/styleOptions.ts
import japaneseCollar from "@/assets/collar-assets/collar-types/Japanese.png";
import qalabiCollar from "@/assets/collar-assets/collar-types/Qallabi.png";
import roundCollar from "@/assets/collar-assets/collar-types/Down Collar.png";

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

import mudawwarSidePocket from "@/assets/side-pocket-assets/Mudawwar Side Pocket.png";

import penIcon from "@/assets/Pen.png";
import phoneIcon from "@/assets/Phone.png";
import walletIcon from "@/assets/Wallet.png";

import doubleGumsha from "@/assets/sleeves-assets/sleeves-types/Double Gumsha.png";
import murabbaKabak from "@/assets/sleeves-assets/sleeves-types/Murabba Kabak.png";
import musallasKabbak from "@/assets/sleeves-assets/sleeves-types/Musallas Kabbak.png";
import mudawarKabbak from "@/assets/sleeves-assets/sleeves-types/Mudawar Kabbak.png";

/* ---------- Interfaces ---------- */

/** Generic option type with optional price */
export interface BaseOption {
  value: string;
  alt: string;
  displayText: string;
  image: string | null;
  price?: number;
}

/** Thickness type */
export type ThicknessValue = "SINGLE" | "DOUBLE" | "TRIPLE" | "NO HASHWA";
export type ThicknessLabel = "S" | "D" | "T" | "N";

export interface ThicknessOption {
  label: ThicknessLabel;
  value: ThicknessValue;
  className: string;
  price?: number;
}

/* ---------- Constants ---------- */

/** Thickness options */
export const thicknessOptions: ThicknessOption[] = [
  { label: "S", value: "SINGLE", className: "text-green-500" },
  { label: "D", value: "DOUBLE", className: "text-green-500"},
  { label: "T", value: "TRIPLE", className: "text-green-500"},
  { label: "N", value: "NO HASHWA", className: "text-red-500" },
];

/** Collar types */
export const collarTypes: BaseOption[] = [
  { value: "COL_QALLABI", alt: "Qallabi Collar", displayText: "Qallabi", image: qalabiCollar },
  { value: "COL_DOWN_COLLAR", alt: "Round Collar", displayText: "Round", image: roundCollar },
  { value: "COL_JAPANESE", alt: "Japanese Collar", displayText: "Japanese", image: japaneseCollar },
];

/** Collar buttons */
export const collarButtons: BaseOption[] = [
  { value: "COL_ARAVI_ZARRAR", alt: "Aravi Zarrar", displayText: "Aravi Zarrar", image: araviZarrar },
  { value: "COL_ZARRAR__TABBAGI", alt: "Zarrar + Tabbagi", displayText: "Zarrar + Tabbagi", image: zarrarTabbagi },
  { value: "COL_TABBAGI", alt: "Tabbagi", displayText: "Tabbagi", image: tabbagi },
];

/** Jabzour types */
export const jabzourTypes: BaseOption[] = [
  { value: "JAB_BAIN_MURABBA", alt: "Bain Murabba", displayText: "Bain Murabba", image: bainMurabba },
  { value: "JAB_BAIN_MUSALLAS", alt: "Bain Musallas", displayText: "Bain Musallas", image: bainMusallas },
  { value: "JAB_MAGFI_MURABBA", alt: "Magfi Murabba", displayText: "Magfi Murabba", image: magfiMurabba },
  { value: "JAB_MAGFI_MUSALLAS", alt: "Magfi  Musallas", displayText: "Magfi  Musallas", image: magfiMusallas },
  { value: "JAB_SHAAB", alt: "Shaab", displayText: "Shaab", image: shaab },
];

/** Top pocket types */
export const topPocketTypes: BaseOption[] = [
  { value: "FRO_MUDAWWAR_MAGFI_FRONT_POCKET", alt: "Mudawwar Magfi Front Pocket", displayText: "Mudawwar Magfi Front Pocket", image: mudawwarMagfiFrontPocket },
  { value: "FRO_MURABBA_FRONT_POCKET", alt: "Murabba Front Pocket", displayText: "Murabba Front Pocket", image: murabbaFrontPocket },
  { value: "FRO_MUSALLAS_FRONT_POCKET", alt: "Musallas Front Pocket", displayText: "Musallas Front Pocket", image: musallasFrontPocket },
  { value: "FRO_MUDAWWAR_FRONT_POCKET", alt: "Mudawwar Front Pocket", displayText: "Mudawwar Front Pocket", image: mudawwarFrontPocket },
];

/** Side pocket types */
export const sidePocketTypes: BaseOption[] = [
  { value: "SID_MUDAWWAR_SIDE_POCKET", alt: "Mudawwar Side Pocket", displayText: "Mudawwar Side Pocket", image: mudawwarSidePocket },
];

/** Cuff types (used for sleeves/cuffs) */
export const cuffTypes: BaseOption[] = [
  { value: "CUF_DOUBLE_GUMSHA", alt: "Double Gumsha", displayText: "Double Gumsha", image: doubleGumsha },
  { value: "CUF_MURABBA_KABAK", alt: "Murabba Kabak", displayText: "Murabba Kabak", image: murabbaKabak },
  { value: "CUF_MUSALLAS_KABBAK", alt: "Musallas Kabbak", displayText: "Musallas Kabbak", image: musallasKabbak },
  { value: "CUF_MUDAWAR_KABBAK", alt: "Mudawar Kabbak", displayText: "Mudawar Kabbak", image: mudawarKabbak },
  { value: "CUF_NO_CUFF", alt: "No Cuff", displayText: "No Cuff", image: null },
];

/** Fabric source & style types */
export const fabricSourceValues = ["IN", "OUT", ""] as const;
export const styleTypeValues = ["kuwaiti", "design"] as const;

/** Miscellaneous icons */
export { penIcon, phoneIcon, walletIcon, smallTabaggiImage };