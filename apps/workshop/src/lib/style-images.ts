// Style option code → image + display name mapping
// Images copied from pos-interface assets

import qallabi from "@/assets/collar-assets/collar-types/Qallabi.png";
import downCollar from "@/assets/collar-assets/collar-types/Down Collar.png";
import japanese from "@/assets/collar-assets/collar-types/Japanese.png";

import araviZarrar from "@/assets/collar-assets/collar-buttons/Aravi Zarrar.png";
import zarrarTabbagi from "@/assets/collar-assets/collar-buttons/Zarrar + Tabbagi.png";
import tabbagi from "@/assets/collar-assets/collar-buttons/Tabbagi.png";

import bainMurabba from "@/assets/jabzour-assets/Bain Murabba.png";
import bainMusallas from "@/assets/jabzour-assets/Bain Musallas.png";
import magfiMurabba from "@/assets/jabzour-assets/Magfi Murabba.png";
import magfiMusallas from "@/assets/jabzour-assets/Magfi  Musallas.png";
import shaab from "@/assets/jabzour-assets/Shaab.png";

import mudawwarMagfi from "@/assets/top-pocket-assets/Mudawwar Magfi Front Pocket.png";
import murabba from "@/assets/top-pocket-assets/Murabba Front Pocket.png";
import musallas from "@/assets/top-pocket-assets/Musallas Front Pocket.png";
import mudawwar from "@/assets/top-pocket-assets/Mudawwar Front Pocket.png";

import mudawwarSide from "@/assets/side-pocket-assets/Mudawwar Side Pocket.png";

import doubleGumsha from "@/assets/sleeves-assets/sleeves-types/Double Gumsha.png";
import murabbaKabak from "@/assets/sleeves-assets/sleeves-types/Murabba Kabak.png";
import musallasKabbak from "@/assets/sleeves-assets/sleeves-types/Musallas Kabbak.png";
import mudawarKabbak from "@/assets/sleeves-assets/sleeves-types/Mudawar Kabbak.png";

import walletIcon from "@/assets/Wallet.png";
import penIcon from "@/assets/Pen.png";
import phoneIcon from "@/assets/Phone.png";
import smallTabaggiIcon from "@/assets/collar-assets/Small Tabbagi.png";

export const STYLE_IMAGE_MAP: Record<string, { image: string; label: string }> = {
  // Collar types
  COL_QALLABI: { image: qallabi, label: "Qallabi" },
  COL_DOWN_COLLAR: { image: downCollar, label: "Round" },
  COL_JAPANESE: { image: japanese, label: "Japanese" },

  // Collar buttons
  COL_ARAVI_ZARRAR: { image: araviZarrar, label: "Aravi Zarrar" },
  COL_ZARRAR__TABBAGI: { image: zarrarTabbagi, label: "Zarrar + Tabbagi" },
  COL_TABBAGI: { image: tabbagi, label: "Tabbagi" },

  // Jabzour
  JAB_BAIN_MURABBA: { image: bainMurabba, label: "Bain Murabba" },
  JAB_BAIN_MUSALLAS: { image: bainMusallas, label: "Bain Musallas" },
  JAB_MAGFI_MURABBA: { image: magfiMurabba, label: "Magfi Murabba" },
  JAB_MAGFI_MUSALLAS: { image: magfiMusallas, label: "Magfi Musallas" },
  JAB_SHAAB: { image: shaab, label: "Shaab" },

  // Front pocket
  FRO_MUDAWWAR_MAGFI_FRONT_POCKET: { image: mudawwarMagfi, label: "Mudawwar Magfi" },
  FRO_MURABBA_FRONT_POCKET: { image: murabba, label: "Murabba" },
  FRO_MUSALLAS_FRONT_POCKET: { image: musallas, label: "Musallas" },
  FRO_MUDAWWAR_FRONT_POCKET: { image: mudawwar, label: "Mudawwar" },

  // Side pocket
  SID_MUDAWWAR_SIDE_POCKET: { image: mudawwarSide, label: "Mudawwar" },

  // Cuffs
  CUF_DOUBLE_GUMSHA: { image: doubleGumsha, label: "Double Gumsha" },
  CUF_MURABBA_KABAK: { image: murabbaKabak, label: "Murabba Kabak" },
  CUF_MUSALLAS_KABBAK: { image: musallasKabbak, label: "Musallas Kabbak" },
  CUF_MUDAWAR_KABBAK: { image: mudawarKabbak, label: "Mudawar Kabbak" },
  CUF_NO_CUFF: { image: "", label: "No Cuff" },
};

export const ACCESSORY_ICONS = { wallet: walletIcon, pen: penIcon, phone: phoneIcon, smallTabaggi: smallTabaggiIcon };

export const THICKNESS_LABELS: Record<string, string> = {
  SINGLE: "S",
  DOUBLE: "D",
  TRIPLE: "T",
  "NO HASHWA": "N",
};
