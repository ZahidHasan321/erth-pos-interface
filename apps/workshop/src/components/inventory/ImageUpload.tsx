import { useRef, useState } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@/lib/utils";
import { uploadInventoryImage, deleteInventoryImageByUrl } from "@/lib/storage";
import { toast } from "sonner";

type Props = {
  itemType: "fabric" | "shelf" | "accessory";
  itemId: number;
  value: string | null;
  onChange: (url: string | null) => void;
  readOnly?: boolean;
};

export function ImageUpload({ itemType, itemId, value, onChange, readOnly }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { url } = await uploadInventoryImage(file, itemType, itemId);
      // delete previous in background — failure shouldn't block save
      if (value) {
        deleteInventoryImageByUrl(value).catch(() => {
          /* old image lingering is harmless */
        });
      }
      onChange(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Image upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!value) return;
    onChange(null);
    deleteInventoryImageByUrl(value).catch(() => {
      /* row cleared visually; storage cleanup best-effort */
    });
  }

  if (!value && readOnly) {
    return (
      <div className="flex items-center justify-center w-full h-40 rounded-md border border-dashed border-border bg-muted/30">
        <div className="text-center text-muted-foreground">
          <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-50" />
          <p className="text-xs">No image</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={cn(
        "relative w-full h-40 rounded-md border border-border overflow-hidden bg-muted/30",
        !value && "border-dashed",
      )}>
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-muted-foreground">
            <div className="text-center">
              <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-50" />
              <p className="text-xs">No image yet</p>
            </div>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={uploading}
              onClick={handleRemove}
              className="text-muted-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
