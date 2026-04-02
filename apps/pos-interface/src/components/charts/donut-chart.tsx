import { useState, useEffect } from "react";

export interface DonutChartSegment {
    value: number;
    color: string;
    label: string;
    amount: string;
}

export interface DonutChartProps {
    segments: DonutChartSegment[];
    size?: number;
    strokeWidth?: number;
    center?: { label: string; value: string };
    summaryLine?: { label: string; amount: string };
    hideLegend?: boolean;
}

export function DonutChart({ segments, size = 120, strokeWidth = 14, center, summaryLine, hideLegend }: DonutChartProps) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [mounted, setMounted] = useState(false);
    const pad = 6;
    const svgSize = size + pad * 2;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce((s, seg) => s + seg.value, 0);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    if (total === 0) return null;

    let accumulated = 0;
    const arcs = segments.filter(s => s.value > 0).map((seg, origIdx) => {
        const pct = seg.value / total;
        const offset = circumference * (1 - accumulated) + circumference * 0.25;
        accumulated += pct;
        return { ...seg, origIdx, pct, dashArray: `${circumference * pct} ${circumference * (1 - pct)}`, dashOffset: offset };
    });

    const hovered = hoveredIdx !== null ? arcs.find(a => a.origIdx === hoveredIdx) : null;

    return (
        <div className="flex flex-col items-center gap-2.5">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={svgSize} height={svgSize} className="-rotate-90" style={{ overflow: "visible", margin: -pad }}>
                    <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth - 2} className="text-muted/20" />
                    {arcs.map((arc, i) => (
                        <circle key={i} cx={cx} cy={cy} r={radius} fill="none"
                            stroke={arc.color}
                            strokeWidth={hoveredIdx === arc.origIdx ? strokeWidth + 5 : strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={mounted ? arc.dashArray : `0 ${circumference}`}
                            strokeDashoffset={arc.dashOffset}
                            onMouseEnter={() => setHoveredIdx(arc.origIdx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            onTouchStart={(e) => { e.stopPropagation(); setHoveredIdx(hoveredIdx === arc.origIdx ? null : arc.origIdx); }}
                            className="cursor-pointer"
                            style={{
                                transition: `stroke-dasharray 800ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 150}ms, stroke-width 300ms ease`,
                            }} />
                    ))}
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={mounted ? { animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 400ms both" } : { opacity: 0 }}>
                    {hovered && !hideLegend ? (
                        <>
                            <span className="text-lg font-bold tabular-nums leading-tight transition-colors duration-200" style={{ color: hovered.color }}>{Math.round(hovered.pct * 100)}%</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">{hovered.label}</span>
                            <span className="text-[10px] font-semibold tabular-nums leading-tight">{hovered.amount}</span>
                        </>
                    ) : center ? (
                        <>
                            <span className="text-xl font-bold tabular-nums leading-tight">{center.value}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">{center.label}</span>
                        </>
                    ) : null}
                </div>
                {/* Floating tooltip */}
                {hideLegend && hovered && hovered.label && (
                    <div className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                        style={{ top: size + 4, animation: "cashier-pop 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
                        <div className="w-2 h-2 bg-foreground rotate-45 mx-auto -mb-1" />
                        <div className="bg-foreground text-background text-[10px] font-semibold px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap tabular-nums">
                            <span style={{ color: hovered.color === "#3730a3" ? "#a5b4fc" : "#fcd34d" }}>{hovered.label}</span> {hovered.amount}
                        </div>
                    </div>
                )}
            </div>
            {/* Legend */}
            {!hideLegend && (arcs.some(a => a.label) || summaryLine) && (
                <div className="flex flex-col items-center gap-1" style={mounted ? { animation: "cashier-number-count 400ms cubic-bezier(0.2, 0, 0, 1) 600ms both" } : { opacity: 0 }}>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                        {arcs.filter(a => a.label).map((arc, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: arc.color }} />
                                <span className="text-muted-foreground">{arc.label}</span>
                                <span className="font-bold tabular-nums">{arc.amount}</span>
                            </div>
                        ))}
                    </div>
                    {summaryLine && (
                        <div className="text-[11px] text-muted-foreground pt-0.5">
                            {summaryLine.label}: <span className="font-bold text-foreground tabular-nums">{summaryLine.amount}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
