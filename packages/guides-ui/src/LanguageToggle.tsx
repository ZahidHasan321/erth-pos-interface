import { cn } from "@repo/ui/lib/utils";

const DEFAULT_LANGS = ["en", "hi"];

export type LanguageToggleProps = {
  lang: string;
  onChange: (lang: string) => void;
  available?: string[];
};

export function LanguageToggle({ lang, onChange, available = DEFAULT_LANGS }: LanguageToggleProps) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Guide language">
      {available.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={l === lang}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium uppercase transition-colors",
            l === lang
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
