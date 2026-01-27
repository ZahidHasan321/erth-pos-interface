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
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-muted/40 p-6 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center h-full space-y-4"
    >
      <div className="flex items-center gap-3 px-1">
        <div className="p-2 bg-primary/10 rounded-lg text-primary shadow-sm">
          <Hash className="size-4" />
        </div>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">
          Direct Lookup
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Order ID Input Group */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
            Order ID
          </Label>
          <div className="flex gap-2 relative">
            <div className="relative flex-1">
              <Input
                type="number"
                placeholder="e.g. 5021"
                value={orderId ?? ""}
                onChange={(e) => onOrderIdChange(e.target.valueAsNumber || undefined)}
                disabled={disabled || isSearchingFatoura}
                className={cn(
                  "h-12 font-bold transition-all bg-white rounded-xl border-border shadow-sm focus-visible:ring-primary/20",
                  idError && "border-destructive ring-destructive/10"
                )}
                onKeyDown={(e) => e.key === 'Enter' && onOrderIdSubmit()}
              />
              <AnimatePresence>
                {idError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-4 left-1 flex items-center gap-1 text-[8px] font-black text-destructive uppercase"
                  >
                    {idError}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Button 
              size="sm"
              onClick={onOrderIdSubmit}
              disabled={!orderId || isSearchingId || disabled || isSearchingFatoura}
              className="h-12 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-md shrink-0"
            >
              {isSearchingId ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Invoice No Input Group */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
            Invoice Number
          </Label>
          <div className="flex gap-2 relative">
            <div className="relative flex-1">
              <Input
                type="number"
                placeholder="e.g. 10025"
                value={fatoura ?? ""}
                onChange={(e) => onFatouraChange(e.target.valueAsNumber || undefined)}
                disabled={disabled || isSearchingId}
                className={cn(
                  "h-12 font-bold transition-all bg-white rounded-xl border-border shadow-sm focus-visible:ring-primary/20",
                  fatouraError && "border-destructive ring-destructive/10"
                )}
                onKeyDown={(e) => e.key === 'Enter' && onFatouraSubmit()}
              />
              <AnimatePresence>
                {fatouraError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-4 left-1 flex items-center gap-1 text-[8px] font-black text-destructive uppercase"
                  >
                    {fatouraError}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Button 
              size="sm"
              onClick={onFatouraSubmit}
              disabled={!fatoura || isSearchingFatoura || disabled || isSearchingId}
              className="h-12 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-md shrink-0"
            >
              {isSearchingFatoura ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}