import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Loader2, ScanBarcode, AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@repo/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
};

export function BarcodeScannerDialog({ open, onClose, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Enumerate cameras once the dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        // Permission first so labels are populated
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        stream.getTracks().forEach((t) => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);
        // prefer rear-facing
        const rear = cams.find((c) => /back|rear|environment/i.test(c.label));
        setDeviceId((rear ?? cams[0])?.deviceId ?? null);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Camera permission denied. Allow it in your browser settings and try again.");
        } else if (name === "NotFoundError") {
          setError("No camera found on this device.");
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Start scanning whenever the selected device changes
  useEffect(() => {
    if (!open || !deviceId || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    // Reset transient UI state, then kick off the async decode loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setStarting(true);

    reader
      .decodeFromVideoDevice(deviceId, videoRef.current, (result, _err, controls) => {
        controlsRef.current = controls;
        if (stopped) return;
        if (result) {
          stopped = true;
          controls.stop();
          onResult(result.getText());
        }
      })
      .then(() => setStarting(false))
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStarting(false);
      });

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, deviceId, onResult]);

  function handleOpenChange(o: boolean) {
    if (!o) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanBarcode className="h-4 w-4" /> Scan barcode
          </DialogTitle>
          <DialogDescription>Point the rear camera at a barcode. It captures automatically.</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] bg-black overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {/* Viewfinder reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 h-1/3 border-2 border-white/80 rounded-md" />
          </div>
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-center px-4">
              <div className="text-white max-w-xs">
                <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-80" />
                <p className="text-sm">{error}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => { setError(null); /* re-trigger */ setDeviceId((d) => d); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try again
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-2">
          {devices.length > 1 ? (
            <Select value={deviceId ?? undefined} onValueChange={(v) => setDeviceId(v)}>
              <SelectTrigger className="h-8 text-xs max-w-[220px]"><SelectValue placeholder="Camera" /></SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : <span className="text-xs text-muted-foreground">{devices[0]?.label || "Using default camera"}</span>}
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
