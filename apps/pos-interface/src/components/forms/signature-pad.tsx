"use client";

import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/dialog";
import { useRef, useEffect, useCallback, useState } from "react";
import { Pen } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

interface SignaturePadProps {
  onSave?: (signature: string) => void;
  trigger?: React.ReactNode;
}

export function SignaturePad({ onSave, trigger }: SignaturePadProps) {
  const [open, setOpen] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = sigCanvas.current?.getCanvas();
    const container = containerRef.current;
    if (!canvas || !container) return;

    const data = sigCanvas.current?.toDataURL();
    const ratio = window.devicePixelRatio || 1;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    if (data && sigCanvas.current) {
      sigCanvas.current.fromDataURL(data, { width, height });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Small delay to let the dialog render before measuring
    const timer = setTimeout(resizeCanvas, 50);
    return () => clearTimeout(timer);
  }, [open, resizeCanvas]);

  const clear = () => {
    sigCanvas.current?.clear();
  };

  const handleConfirm = () => {
    if (sigCanvas.current?.isEmpty()) return;
    if (sigCanvas.current && onSave) {
      onSave(sigCanvas.current.getCanvas().toDataURL("image/png"));
    }
    setOpen(false);
  };

  return (
    <>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="gap-2"
        >
          <Pen className="w-4 h-4" />
          Sign
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Customer Signature</DialogTitle>
          </DialogHeader>
          <div
            ref={containerRef}
            className="w-full h-[250px] rounded-xl border-2 border-border bg-white touch-none"
          >
            <SignatureCanvas
              ref={sigCanvas}
              penColor="black"
              minWidth={1.5}
              maxWidth={3}
              canvasProps={{
                className: "sigCanvas",
                style: { display: "block", width: "100%", height: "100%", borderRadius: "0.75rem" },
              }}
            />
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={clear}>
              Clear
            </Button>
            <Button type="button" onClick={handleConfirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
