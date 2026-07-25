import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui/dialog";

export type ImageLightboxProps = {
  src: string;
  alt: string;
};

/** A capped-size thumbnail that expands to the full-size image in a dialog on click. */
export function ImageLightbox({ src, alt }: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block cursor-zoom-in rounded-md border"
      >
        <img src={src} alt={alt} loading="lazy" className="max-h-72 w-auto rounded-md object-contain" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-2 sm:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{alt}</DialogTitle>
            <DialogDescription>Full-size view of the screenshot</DialogDescription>
          </DialogHeader>
          <img src={src} alt={alt} className="h-auto max-h-[85vh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
