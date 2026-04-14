export type AlterationIssueMatrixColumn = {
  id: string;
  label: string;
};

export type AlterationIssueMatrixRow = {
  id: string;
  label: string;
  columnIds?: readonly string[];
};

export type AlterationIssueMatrixValues = Partial<
  Record<string, Partial<Record<string, boolean>>>
>;

export const defaultAlterationIssueColumns = [
  { id: "customerRequestChange", label: "CUSTOMER REQUEST CHANGE" },
  { id: "garmentNotSameFatuora", label: "GARMENT NOT SAME FATOURA" },
  { id: "badQuality", label: "BAD QUALITY" },
] as const satisfies readonly AlterationIssueMatrixColumn[];

export const defaultAlterationIssueRows = [
  {
    id: "measure",
    label: "MEASURE",
    columnIds: ["customerRequestChange", "garmentNotSameFatuora"],
  },
  { id: "buttons", label: "BUTTONS" },
  { id: "collar", label: "COLLAR" },
  { id: "hashwaCollar", label: "HASHWA COLLAR" },
  { id: "fPocket", label: "F POCKET" },
  { id: "pPocket", label: "P POCKET" },
  { id: "hashwaFPocket", label: "HASHWA F POCKET" },
  { id: "jabzour", label: "JABZOUR" },
  { id: "hashwaJabzour", label: "HASHWA JABZOUR" },
  { id: "sPocket", label: "S POCKET" },
  { id: "hemming", label: "HEMMING" },
] as const satisfies readonly AlterationIssueMatrixRow[];

export const createInitialAlterationIssueMatrixValues = (
  rows: readonly AlterationIssueMatrixRow[] = defaultAlterationIssueRows,
  columns: readonly AlterationIssueMatrixColumn[] = defaultAlterationIssueColumns,
) => {
  return Object.fromEntries(
    rows.map((row) => {
      const availableColumnIds =
        row.columnIds ?? columns.map((column) => column.id);

      return [
        row.id,
        Object.fromEntries(
          availableColumnIds.map((columnId) => [columnId, false]),
        ),
      ];
    }),
  ) as AlterationIssueMatrixValues;
};
