import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Plus, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type DirectLookupCardProps = {
  orderId: number | undefined;
  fatoura: number | undefined;
  onOrderIdChange: (value: number | undefined) => void;
  onFatouraChange: (value: number | undefined) => void;
  onOrderIdSubmit: () => void;
  onFatouraSubmit: () => void;
  isSearchingId?: boolean;
  isSearchingFatoura?: boolean;
  idError?: string;
  fatouraError?: string;
  disabled?: boolean;
};

export function DirectLookupCard({
  orderId,
  fatoura,
  onOrderIdChange,
  onFatouraChange,
  onOrderIdSubmit,
  onFatouraSubmit,
  isSearchingId = false,
  isSearchingFatoura = false,
  idError,
  fatouraError,
  disabled = false,
}: DirectLookupCardProps) {
  const isSearching = isSearchingId || isSearchingFatoura;
  const hasInput = !!orderId || !!fatoura;

  const handleSubmit = () => {
    if (orderId) onOrderIdSubmit();
    else if (fatoura) onFatouraSubmit();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-muted/40 p-6 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center h-full space-y-4"
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary shadow-sm">
            <Hash className="size-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">
            Direct Lookup
            </h2>
        </div>
        <AnimatePresence>
            {(idError || fatouraError) && (
                <motion.span 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[10px] font-black text-destructive uppercase tracking-widest bg-destructive/5 px-2 py-1 rounded-md border border-destructive/10"
                >
                    {idError || fatouraError}
                </motion.span>
            )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col sm:flex-row items-end gap-3">
        {/* Order ID Input Group */}
        <div className="space-y-1.5 flex-1 w-full">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 text-nowrap">
            Order ID
          </Label>
          <Input
            type="number"
            placeholder="e.g. 5021"
            value={orderId ?? ""}
            onChange={(e) => {
                const val = e.target.valueAsNumber || undefined;
                if (val) onFatouraChange(undefined);
                onOrderIdChange(val);
            }}
            disabled={disabled || isSearching}
            className={cn(
                "h-11 font-bold transition-all bg-white rounded-xl border-border shadow-sm focus-visible:ring-primary/20",
                idError && "border-destructive ring-destructive/10"
            )}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <div className="hidden sm:block mb-3.5 text-muted-foreground/30 font-black text-[10px]">OR</div>

        {/* Invoice No Input Group */}
        <div className="space-y-1.5 flex-1 w-full">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 text-nowrap">
            Invoice Number
          </Label>
          <Input
            type="number"
            placeholder="e.g. 10025"
            value={fatoura ?? ""}
            onChange={(e) => {
                const val = e.target.valueAsNumber || undefined;
                if (val) onOrderIdChange(undefined);
                onFatouraChange(val);
            }}
            disabled={disabled || isSearching}
            className={cn(
                "h-11 font-bold transition-all bg-white rounded-xl border-border shadow-sm focus-visible:ring-primary/20",
                fatouraError && "border-destructive ring-destructive/10"
            )}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <Button 
          size="sm"
          onClick={handleSubmit}
          disabled={!hasInput || isSearching || disabled}
          className="h-11 px-6 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-md shrink-0 w-full sm:w-auto transition-all active:scale-[0.98]"
        >
          {isSearching ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <>
                <Plus className="size-4 mr-2" />
                Find Order
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}