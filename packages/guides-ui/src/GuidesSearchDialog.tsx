import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { useGuidesSearch } from "./search";
import type { SearchEntry } from "./types";

export type GuidesSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: SearchEntry[] | undefined;
  onSelect: (entry: SearchEntry) => void;
};

/**
 * Quick-jump search palette, reachable from both the TOC and any chapter
 * page. Composes cmdk's primitives directly rather than @repo/ui's
 * CommandDialog wrapper so it can pass `shouldFilter={false}` — results are
 * already ranked by Fuse (useGuidesSearch), and cmdk's own built-in filter
 * (which matches against each CommandItem's `value`) would otherwise
 * re-filter and hide valid fuzzy matches on top of that.
 */
export function GuidesSearchDialog({ open, onOpenChange, index, onSelect }: GuidesSearchDialogProps) {
  const [query, setQuery] = useState("");
  const results = useGuidesSearch(index, query);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search guides</DialogTitle>
          <DialogDescription>Search for a topic across all chapters</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search guides..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{query.trim() ? "No matching topics." : "Start typing to search."}</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup heading="Topics">
                {results.map((entry) => (
                  <CommandItem
                    key={entry.stepId}
                    value={entry.stepId}
                    onSelect={() => {
                      onSelect(entry);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-muted-foreground text-xs">{entry.chapterTitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
