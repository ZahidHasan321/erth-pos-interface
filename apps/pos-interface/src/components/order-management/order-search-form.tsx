import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, X } from "lucide-react";
import { motion } from "framer-motion";

type OrderSearchFormProps = {
  orderId: number | undefined;
  fatoura: number | undefined;
  customerMobile: number | undefined;
  onOrderIdChange: (value: number | undefined) => void;
  onFatouraChange: (value: number | undefined) => void;
  onCustomerMobileChange: (value: number | undefined) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  isLoading?: boolean;
  disabled?: boolean;
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

export function OrderSearchForm({
  orderId,
  fatoura,
  customerMobile,
  onOrderIdChange,
  onFatouraChange,
  onCustomerMobileChange,
  onSubmit,
  onClear,
  isLoading = false,
  disabled = false,
}: OrderSearchFormProps) {
  const hasAnyValue = orderId || fatoura || customerMobile;
  const canSearch = hasAnyValue && !isLoading && !disabled;

  return (
    <motion.div
      variants={itemVariants}
      className="bg-card p-6 rounded-xl border border-border shadow-sm"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            Search Order
          </h3>
          <p className="text-sm text-muted-foreground">
            Search by Order ID, Fatoura number, or Customer phone number
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Order ID
              </label>
              <Input
                type="number"
                placeholder="Enter Order ID"
                value={orderId ?? ""}
                disabled={!!fatoura || !!customerMobile || disabled}
                onChange={(e) =>
                  onOrderIdChange(e.target.valueAsNumber || undefined)
                }
                className="bg-background border-border/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Fatoura Number
              </label>
              <Input
                type="number"
                placeholder="Enter Fatoura"
                value={fatoura ?? ""}
                disabled={!!orderId || !!customerMobile || disabled}
                onChange={(e) =>
                  onFatouraChange(e.target.valueAsNumber || undefined)
                }
                className="bg-background border-border/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Customer Mobile
              </label>
              <Input
                type="number"
                placeholder="Enter Phone Number"
                value={customerMobile ?? ""}
                disabled={!!orderId || !!fatoura || disabled}
                onChange={(e) =>
                  onCustomerMobileChange(e.target.valueAsNumber || undefined)
                }
                className="bg-background border-border/60"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            {hasAnyValue && (
              <Button
                type="button"
                variant="outline"
                onClick={onClear}
                disabled={isLoading || disabled}
              >
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
            <Button type="submit" disabled={!canSearch}>
              <Search className="w-4 h-4 mr-2" />
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
