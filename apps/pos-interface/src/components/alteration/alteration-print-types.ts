export type AlterationPrintMeta = {
  nFat: string;
  qty: string;
  customerName: string;
  customerPhone: string;
  bufiExt: string;
  receivedDate: string;
  requestedDate: string;
  comments: string;
};

export const defaultAlterationPrintMeta: AlterationPrintMeta = {
  nFat: "",
  qty: "",
  customerName: "",
  customerPhone: "",
  bufiExt: "",
  receivedDate: "",
  requestedDate: "",
  comments: "",
};
