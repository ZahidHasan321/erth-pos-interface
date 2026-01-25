import * as React from "react";

export type ConfirmationDialogState = {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
};

export function useConfirmationDialog() {
  const [dialog, setDialog] = React.useState<ConfirmationDialogState>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const openDialog = React.useCallback(
    (title: string, description: string, onConfirm: () => void) => {
      setDialog({
        isOpen: true,
        title,
        description,
        onConfirm,
      });
    },
    [],
  );

  const closeDialog = React.useCallback(() => {
    setDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    dialog,
    openDialog,
    closeDialog,
  };
}
