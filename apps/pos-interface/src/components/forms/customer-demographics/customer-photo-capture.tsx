import * as React from "react";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/dialog";
import { Camera, RotateCcw, Trash2, User, Upload, Check } from "lucide-react";
import { toast } from "sonner";

// Compression target: long-edge cap + quality. A phone camera frame (often
// 3-12MP / several MB) drops to roughly 100-250KB of WebP at these settings,
// which keeps the bucket small while staying sharp enough to recognise a face.
const MAX_DIMENSION = 1024;
const QUALITY = 0.82;

/**
 * Draw a source (video frame or decoded image) onto a canvas, scaled so its
 * longest edge is at most MAX_DIMENSION, and encode it as a compressed blob.
 * Prefers WebP; falls back to JPEG on the odd browser that cannot encode WebP.
 */
async function compress(
  source: HTMLVideoElement | HTMLImageElement,
  srcW: number,
  srcH: number,
): Promise<Blob> {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D drawing context to compress the photo.");
  ctx.drawImage(source, 0, 0, w, h);

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

  const webp = await toBlob("image/webp");
  if (webp && webp.size > 0) return webp;
  const jpeg = await toBlob("image/jpeg");
  if (jpeg && jpeg.size > 0) return jpeg;
  throw new Error("The browser could not encode the captured photo.");
}

/** Decode a File into an <img> so it can be drawn to the compression canvas. */
function decodeFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not a readable image."));
    };
    img.src = url;
  });
}

interface CustomerPhotoFieldProps {
  /** Currently displayed photo URL (fresh capture preview or the saved URL), or null. */
  displayUrl: string | null;
  /** Read-only mode hides all capture controls and just shows the avatar. */
  isReadOnly: boolean;
  /** A freshly captured, compressed photo is ready to be saved. */
  onCapture: (blob: Blob, previewUrl: string) => void;
  /** The photo was removed (clears both a pending capture and any saved photo). */
  onRemove: () => void;
}

/**
 * Customer photo: a circular avatar plus a camera-capture flow. Opens the
 * device camera in a dialog, lets staff snap and retake, and compresses the
 * result client-side before handing the blob back to the form (which uploads
 * it on save). Falls back to a file picker on devices without a usable camera.
 */
export function CustomerPhotoField({
  displayUrl,
  isReadOnly,
  onCapture,
  onRemove,
}: CustomerPhotoFieldProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  // A captured-but-not-yet-confirmed still (blob + object URL for preview).
  const [captured, setCaptured] = React.useState<{ blob: Blob; url: string } | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const stopStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = React.useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This device has no camera available. Upload a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError("Could not access the camera. Check permissions, or upload a photo instead.");
    }
  }, []);

  // Open/close lifecycle: start the camera when the dialog opens with no
  // captured still, and always release the stream on close/unmount.
  React.useEffect(() => {
    if (isDialogOpen && !captured) {
      startCamera();
    }
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen, captured]);

  const openDialog = () => {
    setCaptured(null);
    setCameraError(null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    stopStream();
    if (captured) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    setCameraError(null);
    setIsDialogOpen(false);
  };

  const takeSnapshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("The camera is not ready yet. Give it a moment and try again.");
      return;
    }
    setIsBusy(true);
    try {
      const blob = await compress(video, video.videoWidth, video.videoHeight);
      stopStream();
      setCaptured({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not capture the photo.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setIsBusy(true);
    try {
      const img = await decodeFile(file);
      const blob = await compress(img, img.naturalWidth, img.naturalHeight);
      stopStream();
      setCaptured({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setIsBusy(false);
    }
  };

  const retake = () => {
    if (captured) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    setCameraError(null);
  };

  const usePhoto = () => {
    if (!captured) return;
    // Hand the blob to the form; the preview URL is reused there for display, so
    // do NOT revoke it here. The form owns its lifetime from this point.
    onCapture(captured.blob, captured.url);
    stopStream();
    setCaptured(null);
    setIsDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        {displayUrl ? (
          <img src={displayUrl} alt="Customer photo" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <User className="size-8" />
          </div>
        )}
      </div>

      {!isReadOnly && (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openDialog}>
            <Camera className="size-4" />
            {displayUrl ? "Retake photo" : "Add photo"}
          </Button>
          {displayUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? undefined : closeDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Customer photo</DialogTitle>
            <DialogDescription>
              {captured
                ? "Use this photo, or retake it."
                : "Position the customer in frame and capture. The photo is compressed automatically before saving."}
            </DialogDescription>
          </DialogHeader>

          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
            {captured ? (
              <img src={captured.url} alt="Captured" className="size-full object-cover" />
            ) : cameraError ? (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
                <Camera className="size-8 opacity-60" />
                <p>{cameraError}</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="size-full object-cover"
              />
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFilePick}
          />

          <DialogFooter className="gap-2 sm:justify-between">
            {captured ? (
              <>
                <Button type="button" variant="outline" onClick={retake} disabled={isBusy}>
                  <RotateCcw className="size-4" />
                  Retake
                </Button>
                <Button type="button" onClick={usePhoto} disabled={isBusy}>
                  <Check className="size-4" />
                  Use photo
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                >
                  <Upload className="size-4" />
                  Upload
                </Button>
                <Button
                  type="button"
                  onClick={takeSnapshot}
                  disabled={isBusy || !!cameraError}
                >
                  <Camera className="size-4" />
                  Capture
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
