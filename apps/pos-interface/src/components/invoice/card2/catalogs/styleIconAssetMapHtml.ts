import type { Card2LineItemStyle } from '../types'

import qallabiCollar from '@/assets/collar-assets/collar-types/Qallabi.png'
import downCollar from '@/assets/collar-assets/collar-types/Down Collar.png'
import japaneseCollar from '@/assets/collar-assets/collar-types/Japanese.png'
import straitCollar from '@/assets/collar-assets/collar-types/Strait Collar.png'

import araviZarrar from '@/assets/collar-assets/collar-buttons/Aravi Zarrar.png'
import zarrarTabbagi from '@/assets/collar-assets/collar-buttons/Zarrar + Tabbagi.png'
import tabbagi from '@/assets/collar-assets/collar-buttons/Tabbagi.png'
import smallTabbagi from '@/assets/collar-assets/Small Tabbagi.png'

import bainMurabba from '@/assets/jabzour-assets/Bain Murabba.png'
import bainMusallas from '@/assets/jabzour-assets/Bain Musallas.png'
import magfiMurabba from '@/assets/jabzour-assets/Magfi Murabba.png'
import magfiMusallas from '@/assets/jabzour-assets/Magfi  Musallas.png'
import shaab from '@/assets/jabzour-assets/Shaab.png'

import mudawwarSidePocket from '@/assets/side-pocket-assets/Mudawwar Side Pocket.png'

import mudawwarMagfiFront from '@/assets/top-pocket-assets/Mudawwar Magfi Front Pocket.png'
import murabbaFront from '@/assets/top-pocket-assets/Murabba Front Pocket.png'
import musallasFront from '@/assets/top-pocket-assets/Musallas Front Pocket.png'
import mudawwarFront from '@/assets/top-pocket-assets/Mudawwar Front Pocket.png'

import doubleGumsha from '@/assets/sleeves-assets/sleeves-types/Double Gumsha.png'
import murabbaKabak from '@/assets/sleeves-assets/sleeves-types/Murabba Kabak.png'
import musallasKabbak from '@/assets/sleeves-assets/sleeves-types/Musallas Kabbak.png'
import mudawarKabbak from '@/assets/sleeves-assets/sleeves-types/Mudawar Kabbak.png'

export type Card2StyleGroupId = Exclude<keyof Card2LineItemStyle, 'jabzoor2' | 'collarPosition'>

const styleIconUrlMapByGroup: Record<Card2StyleGroupId, Record<string, string>> = {
  collarShape: {
    COL_QALLABI: qallabiCollar,
    COL_DOWN_COLLAR: downCollar,
    COL_JAPANESE: japaneseCollar,
    COL_STRAIT_COLLAR: straitCollar,
  },
  button: {
    COL_ARAVI_ZARRAR: araviZarrar,
    COL_ZARRAR__TABBAGI: zarrarTabbagi,
    COL_TABBAGI: tabbagi,
    COL_SMALL_TABBAGI: smallTabbagi,
  },
  jabzoor: {
    JAB_BAIN_MURABBA: bainMurabba,
    JAB_BAIN_MUSALLAS: bainMusallas,
    JAB_MAGFI_MURABBA: magfiMurabba,
    JAB_MAGFI_MUSALLAS: magfiMusallas,
    JAB_SHAAB: shaab,
  },
  sidePocket: {
    SID_MUDAWWAR_SIDE_POCKET: mudawwarSidePocket,
  },
  topPocket: {
    FRO_MUDAWWAR_MAGFI_FRONT_POCKET: mudawwarMagfiFront,
    FRO_MURABBA_FRONT_POCKET: murabbaFront,
    FRO_MUSALLAS_FRONT_POCKET: musallasFront,
    FRO_MUDAWWAR_FRONT_POCKET: mudawwarFront,
  },
  sleeveShape: {
    CUF_DOUBLE_GUMSHA: doubleGumsha,
    CUF_MURABBA_KABAK: murabbaKabak,
    CUF_MUSALLAS_KABBAK: musallasKabbak,
    CUF_MUDAWAR_KABBAK: mudawarKabbak,
  },
}

export const resolveStyleOptionIconUrl = (
  groupId: Card2StyleGroupId,
  optionId: string,
): string | undefined => styleIconUrlMapByGroup[groupId][optionId]
