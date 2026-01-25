// Static imports for all country flags used in the application
import KW from "country-flag-icons/react/3x2/KW";
import SA from "country-flag-icons/react/3x2/SA";
import BH from "country-flag-icons/react/3x2/BH";
import QA from "country-flag-icons/react/3x2/QA";
import AE from "country-flag-icons/react/3x2/AE";
import OM from "country-flag-icons/react/3x2/OM";
import IN from "country-flag-icons/react/3x2/IN";
import BD from "country-flag-icons/react/3x2/BD";
import PK from "country-flag-icons/react/3x2/PK";
import LK from "country-flag-icons/react/3x2/LK";
import NP from "country-flag-icons/react/3x2/NP";
import BT from "country-flag-icons/react/3x2/BT";
import MV from "country-flag-icons/react/3x2/MV";
import GB from "country-flag-icons/react/3x2/GB";
import DE from "country-flag-icons/react/3x2/DE";
import FR from "country-flag-icons/react/3x2/FR";
import IT from "country-flag-icons/react/3x2/IT";
import ES from "country-flag-icons/react/3x2/ES";
import NL from "country-flag-icons/react/3x2/NL";
import SE from "country-flag-icons/react/3x2/SE";
import NO from "country-flag-icons/react/3x2/NO";
import CH from "country-flag-icons/react/3x2/CH";
import DK from "country-flag-icons/react/3x2/DK";
import FI from "country-flag-icons/react/3x2/FI";
import IE from "country-flag-icons/react/3x2/IE";
import PT from "country-flag-icons/react/3x2/PT";
import PL from "country-flag-icons/react/3x2/PL";
import GR from "country-flag-icons/react/3x2/GR";
import AT from "country-flag-icons/react/3x2/AT";
import BE from "country-flag-icons/react/3x2/BE";
import CZ from "country-flag-icons/react/3x2/CZ";
import HU from "country-flag-icons/react/3x2/HU";
import TR from "country-flag-icons/react/3x2/TR";
import EG from "country-flag-icons/react/3x2/EG";
import SG from "country-flag-icons/react/3x2/SG";
import MY from "country-flag-icons/react/3x2/MY";
import ID from "country-flag-icons/react/3x2/ID";
import PH from "country-flag-icons/react/3x2/PH";

interface FlagIconProps {
  code: string;
  width?: number;
  height?: number;
  className?: string;
}

// Static mapping of country codes to flag components
// Using 'any' for flag components due to type incompatibility between React.SVGProps and country-flag-icons
const flagMap: Record<string, any> = {
  KW, SA, BH, QA, AE, OM,
  IN, BD, PK, LK, NP, BT, MV,
  GB, DE, FR, IT, ES, NL, SE, NO, CH, DK, FI, IE, PT, PL, GR, AT, BE, CZ, HU,
  TR, EG, SG, MY, ID, PH,
};

export function FlagIcon({ code, width = 20, height = 15, className = "" }: FlagIconProps) {
  const FlagComponent = flagMap[code.toUpperCase()];

  if (!FlagComponent) {
    // Fallback to showing country code if flag is not in our map
    return <span className={className}>{code}</span>;
  }

  return (
    <FlagComponent
      width={width}
      height={height}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    />
  );
}
