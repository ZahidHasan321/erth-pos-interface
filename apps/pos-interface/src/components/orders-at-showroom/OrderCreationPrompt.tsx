import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Plus, Search } from "lucide-react";

type OrderCreationPromptProps = {
  orderType: "Work Order" | "Sales Order";
  isPending: boolean;
  onCreateOrder: () => void;
  onLoadExisting?: () => void;
  dialogState: {
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  };
  onCloseDialog: () => void;
};

export function OrderCreationPrompt({
  orderType,
  isPending,
  onCreateOrder,
  onLoadExisting,
  dialogState,
  onCloseDialog,
}: OrderCreationPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center space-y-6">
      <h2 className="text-2xl font-semibold">No order created yet</h2>
      <p className="text-muted-foreground">
        Would you like to create a new {orderType.toLowerCase()} or load an existing one?
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button size="lg" onClick={onCreateOrder} disabled={isPending}>
          <Plus className="w-4 h-4 mr-2" />
          {isPending ? "Creating..." : `Create New ${orderType}`}
        </Button>

        {onLoadExisting && (
          <Button size="lg" variant="secondary" onClick={onLoadExisting} disabled={isPending}>
            <Search className="w-4 h-4 mr-2" />
            Load Existing Order
          </Button>
        )}
      </div>

      <ConfirmationDialog
        isOpen={dialogState.isOpen}
        onClose={onCloseDialog}
        onConfirm={dialogState.onConfirm}
        title={dialogState.title}
        description={dialogState.description}
      />
    </div>
  );
}
