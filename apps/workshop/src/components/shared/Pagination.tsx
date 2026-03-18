import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
}

export function Pagination({ page, totalPages, onPageChange, totalItems, pageSize }: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * (pageSize ?? 0) + 1;
  const end = Math.min(page * (pageSize ?? 0), totalItems ?? 0);

  return (
    <div className="flex items-center justify-between pt-4">
      {totalItems != null && pageSize != null ? (
        <p className="text-xs text-muted-foreground">
          {start}–{end} of {totalItems}
        </p>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="h-8 w-8 p-0"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </Button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | "...")[]>((acc, p, i, arr) => {
            if (i > 0 && p - (arr[i - 1] ?? 0) > 1) acc.push("...");
            acc.push(p);
            return acc;
          }, [])
          .map((item, i) =>
            item === "..." ? (
              <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">&hellip;</span>
            ) : (
              <Button
                key={item}
                size="sm"
                variant={item === page ? "default" : "outline"}
                onClick={() => onPageChange(item)}
                className={cn("h-8 w-8 p-0 text-xs", item === page && "pointer-events-none")}
              >
                {item}
              </Button>
            ),
          )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="h-8 w-8 p-0"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Hook for simple client-side pagination */
export function usePagination<T>(items: T[], pageSize: number = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    page: safePage,
    setPage,
    totalPages,
    paged,
    totalItems: items.length,
    pageSize,
  };
}
