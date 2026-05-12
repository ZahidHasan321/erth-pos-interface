import { Delete } from "lucide-react";

type NumpadAction = {
    label: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
};

type NumpadProps = {
    value: string;
    onChange: (next: string) => void;
    /** Max numeric value; pressing a digit that would exceed it is ignored. */
    max?: number;
    /** Max decimal places. Defaults to 3 (KWD). */
    maxDecimals?: number;
    disabled?: boolean;
    className?: string;
    /** Optional action buttons rendered in the bottom row, left of Clear. */
    actions?: NumpadAction[];
};

/**
 * Big touch-first numpad. Operates on a string so empty state, leading zero,
 * and trailing decimal point all round-trip without lossy parsing.
 */
export function Numpad({ value, onChange, max, maxDecimals = 3, disabled, className, actions }: NumpadProps) {
    const append = (digit: string) => {
        if (disabled) return;
        let next = value;
        if (digit === ".") {
            if (next.includes(".")) return;
            next = next === "" ? "0." : `${next}.`;
        } else {
            if (next === "0") next = "";
            if (next.includes(".")) {
                const decimals = next.split(".")[1] ?? "";
                if (decimals.length >= maxDecimals) return;
            }
            next = `${next}${digit}`;
        }
        if (max !== undefined) {
            const n = Number(next);
            if (!isNaN(n) && n > max) return;
        }
        onChange(next);
    };

    const backspace = () => {
        if (disabled) return;
        if (value.length === 0) return;
        onChange(value.slice(0, -1));
    };

    const clear = () => {
        if (disabled) return;
        onChange("");
    };

    return (
        <div className={`grid grid-cols-3 gap-2 ${className ?? ""}`}>
            <NumpadKey onClick={() => append("7")} disabled={disabled}>7</NumpadKey>
            <NumpadKey onClick={() => append("8")} disabled={disabled}>8</NumpadKey>
            <NumpadKey onClick={() => append("9")} disabled={disabled}>9</NumpadKey>

            <NumpadKey onClick={() => append("4")} disabled={disabled}>4</NumpadKey>
            <NumpadKey onClick={() => append("5")} disabled={disabled}>5</NumpadKey>
            <NumpadKey onClick={() => append("6")} disabled={disabled}>6</NumpadKey>

            <NumpadKey onClick={() => append("1")} disabled={disabled}>1</NumpadKey>
            <NumpadKey onClick={() => append("2")} disabled={disabled}>2</NumpadKey>
            <NumpadKey onClick={() => append("3")} disabled={disabled}>3</NumpadKey>

            <NumpadKey onClick={() => append(".")} disabled={disabled} tone="muted">.</NumpadKey>
            <NumpadKey onClick={() => append("0")} disabled={disabled}>0</NumpadKey>
            <NumpadKey onClick={backspace} disabled={disabled} tone="muted">
                <Delete className="h-6 w-6" aria-label="Backspace" />
            </NumpadKey>

            {actions && actions.length > 0 ? (
                <>
                    {actions.map((a, i) => (
                        <NumpadKey
                            key={i}
                            onClick={a.onClick}
                            disabled={a.disabled || disabled}
                            tone={a.active ? "active" : "muted"}
                            className="h-12 text-sm"
                        >
                            {a.label}
                        </NumpadKey>
                    ))}
                    <NumpadKey onClick={clear} disabled={disabled} tone="danger" className="h-12 text-sm">
                        Clear
                    </NumpadKey>
                </>
            ) : (
                <NumpadKey onClick={clear} disabled={disabled} tone="danger" className="col-span-3 h-12 text-base">
                    Clear
                </NumpadKey>
            )}
        </div>
    );
}

function NumpadKey({
    children, onClick, tone, disabled, className,
}: {
    children: React.ReactNode;
    onClick: () => void;
    tone?: "muted" | "danger" | "active";
    disabled?: boolean;
    className?: string;
}) {
    const toneClasses = tone === "danger"
        ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 active:bg-red-300 active:border-red-400"
        : tone === "active"
            ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90 active:bg-primary/70 active:border-primary/70"
            : tone === "muted"
                ? "bg-muted/60 text-foreground border-border hover:bg-muted active:bg-foreground/15 active:border-foreground/30"
                : "bg-background text-foreground border-border hover:bg-muted/60 active:bg-foreground/10 active:border-foreground/30";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`h-16 rounded-lg border-2 text-2xl font-semibold tabular-nums transition-[transform,background-color,box-shadow,border-color] duration-75 ease-out select-none touch-manipulation active:scale-[0.94] active:shadow-inner active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center ${toneClasses} ${className ?? ""}`}
        >
            {children}
        </button>
    );
}
