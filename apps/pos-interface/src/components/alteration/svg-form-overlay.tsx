import templateSvg from "@/assets/template.svg";
import { cn } from "@/lib/utils";

import { defaultTemplateFieldLayout, type TemplateField } from "./field-layout";

type SvgFormOverlayProps = {
  values: Partial<Record<string, string>>;
  onValueChange: (fieldId: string, value: string) => void;
  className?: string;
  fields?: readonly TemplateField[];
  showGuides?: boolean;
  inputBorders?: boolean;
};

const svgAspectRatio = "793.76001 / 1122.5601";

export function SvgFormOverlay({
  values,
  onValueChange,
  className,
  fields = defaultTemplateFieldLayout,
  showGuides = false,
  inputBorders = true,
}: SvgFormOverlayProps) {
  return (
    <section className={cn("mx-auto w-full max-w-[560px]", className)}>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"
        style={{ aspectRatio: svgAspectRatio }}
      >
        <img
          src={templateSvg}
          alt="Alteration template"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
        />

        {fields.map((field) => {
          const isVertical = field.orientation === "vertical";

          return (
            <div
              key={field.id}
              className={cn(
                "absolute",
                showGuides && "outline outline-dashed outline-sky-500/70",
              )}
              style={{
                left: `${field.left}%`,
                top: `${field.top}%`,
                width: `${field.width}%`,
                height: `${field.height}%`,
              }}
            >
              <label htmlFor={field.id} className="sr-only">
                {field.label}
              </label>

              <input
                id={field.id}
                type="text"
                value={values[field.id] ?? ""}
                onChange={(event) =>
                  onValueChange(field.id, event.target.value)
                }
                spellCheck={false}
                className={cn(
                  "h-full w-full rounded-[4px] bg-white/90 text-xl tracking-wide outline-none",
                  "text-red-700 text-center",
                  isVertical
                    ? "px-1 py-3 [text-orientation:upright] [writing-mode:sideways-rl]"
                    : "px-2",
                  inputBorders
                    ? "border focus:ring-2 focus:ring-offset-0 border-red-500/80 focus:border-red-500 focus:ring-red-300"
                    : "",
                )}
              />

              {showGuides && (
                <span className="pointer-events-none absolute -top-5 left-0 rounded-sm bg-sky-500 px-1 py-0.5 text-[10px] leading-none text-white">
                  {field.id}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
