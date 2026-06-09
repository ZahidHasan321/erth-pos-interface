import { Badge } from "@repo/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/sheet";
import type { GarmentTag, MeasurementInPlay } from "@/lib/feedback-overrides";
import { GarmentTagLabel } from "@/components/feedback/override-section";

interface MeasurementSheetProps {
  open: boolean;
  onClose: () => void;
  measurementsInPlay: MeasurementInPlay[];
  measurementLabel: (id: string | null) => string;
  garmentLabel: (id: string) => GarmentTag;
}

export function MeasurementSheet({
  open,
  onClose,
  measurementsInPlay,
  measurementLabel,
  garmentLabel,
}: MeasurementSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border pr-12">
          <SheetTitle className="text-base">Measurements in play</SheetTitle>
          <SheetDescription>
            Every measurement on this order and the garments following it.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {measurementsInPlay.map((m) => (
            <div
              key={m.id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-sm font-semibold">{measurementLabel(m.id)}</span>
                  {m.isNew && m.derivedFromId != null && (
                    <span className="truncate text-xs text-muted-foreground">
                      from {measurementLabel(m.derivedFromId)}
                    </span>
                  )}
                </div>
                {m.isNew ? (
                  <Badge variant="default" className="shrink-0 text-[10px]">New</Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-[10px]">Original</Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {m.followerIds.length > 0 ? (
                  m.followerIds.map((id) => (
                    <GarmentTagLabel key={id} tag={garmentLabel(id)} />
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No garments following</span>
                )}
              </div>
            </div>
          ))}

          {measurementsInPlay.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No measurements in play.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
