import { Fragment } from "react";

import {
  defaultAlterationIssueColumns,
  defaultAlterationIssueRows,
  type AlterationIssueMatrixColumn,
  type AlterationIssueMatrixRow,
  type AlterationIssueMatrixValues,
} from "@/components/alteration/alteration-checkbox-matrix-config";
import { Checkbox } from "@repo/ui/checkbox";
import { cn } from "@/lib/utils";

type AlterationCheckboxMatrixProps = {
  values: AlterationIssueMatrixValues;
  onValueChange: (rowId: string, columnId: string, checked: boolean) => void;
  className?: string;
  columns?: readonly AlterationIssueMatrixColumn[];
  rows?: readonly AlterationIssueMatrixRow[];
};

const formatColumnHeading = (label: string) => {
  const words = label.trim().split(/\s+/);

  if (words.length <= 2) {
    return label;
  }

  const splitIndex = Math.ceil(words.length / 2);

  return `${words.slice(0, splitIndex).join(" ")}\n${words
    .slice(splitIndex)
    .join(" ")}`;
};

export function AlterationCheckboxMatrix({
  values,
  onValueChange,
  className,
  columns = defaultAlterationIssueColumns,
  rows = defaultAlterationIssueRows,
}: AlterationCheckboxMatrixProps) {
  const gridTemplateColumns = `minmax(10.25rem, 1fr) repeat(${columns.length}, minmax(3.25rem, 3.25rem))`;

  return (
    <section
      className={cn(
        "w-full max-w-md rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[23.5rem] items-center gap-x-3 gap-y-2"
          style={{ gridTemplateColumns }}
        >
          <div />
          {columns.map((column) => (
            <div key={column.id} className="flex justify-center">
              <span className="flex h-28 w-[3.25rem] items-center justify-center rounded-xl border-2 border-slate-400 px-2 py-1 text-slate-800">
                <span className="text-center text-[11px] font-semibold leading-[1.05] tracking-wide whitespace-pre-line [text-orientation:mixed] [writing-mode:vertical-rl]">
                  {formatColumnHeading(column.label)}
                </span>
              </span>
            </div>
          ))}

          {rows.map((row) => (
            <Fragment key={row.id}>
              <p className="pr-2 text-right text-sm font-semibold tracking-wide text-slate-900">
                {row.label}
              </p>

              {columns.map((column) => {
                const isAvailable = row.columnIds?.includes(column.id) ?? true;

                if (!isAvailable) {
                  return (
                    <div
                      key={`${row.id}-${column.id}`}
                      className="size-10"
                      aria-hidden={true}
                    />
                  );
                }

                const checked = Boolean(values[row.id]?.[column.id]);

                return (
                  <div
                    key={`${row.id}-${column.id}`}
                    className="flex justify-center"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        onValueChange(row.id, column.id, nextChecked === true)
                      }
                      aria-label={`${row.label} - ${column.label}`}
                      className="size-10 rounded-full border-[3px] border-slate-400 bg-white data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700/10 [&_svg]:size-5 [&_svg]:text-slate-700"
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
