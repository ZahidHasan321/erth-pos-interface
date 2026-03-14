"use client";

import { Button } from "@/components/ui/button";
import { useRef, useEffect, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";

interface SignaturePadProps {
  onSave?: (signature: string) => void;
}

export function SignaturePad({ onSave }: SignaturePadProps) {
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

    // Restore previous drawing if any
    if (data && sigCanvas.current) {
      sigCanvas.current.fromDataURL(data, { width, height });
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const clear = () => {
    sigCanvas.current?.clear();
  };

  const save = () => {
    if (sigCanvas.current?.isEmpty()) return;
    if (sigCanvas.current && onSave) {
      onSave(sigCanvas.current.getCanvas().toDataURL("image/png"));
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="w-full h-[180px] sm:h-[200px] rounded-xl border-2 border-border bg-white touch-none"
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
      <div className="flex gap-2">
        <Button type="button" onClick={clear} variant="outline" className="flex-1 h-10 font-bold uppercase tracking-wide text-xs">
          Clear
        </Button>
        <Button type="button" onClick={save} className="flex-1 h-10 font-bold uppercase tracking-wide text-xs">
          Save Signature
        </Button>
      </div>
    </div>
  );
}
