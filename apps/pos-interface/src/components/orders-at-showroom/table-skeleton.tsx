import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton() {
  return (
    <div className="w-full space-y-3">
      {/* Skeleton Header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-muted/30 rounded-xl border border-border/40">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Skeleton Rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div 
          key={i} 
          className="group relative flex items-center gap-4 p-4 px-6 bg-card/50 backdrop-blur-sm border border-border/60 rounded-2xl transition-all hover:border-primary/20"
          style={{
            opacity: 1 - (i * 0.1), // Fading effect for lower rows
          }}
        >
          {/* Checkbox / Icon area */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-md opacity-60" />
            <Skeleton className="h-5 w-5 rounded-md opacity-40" />
          </div>

          {/* Primary Info (Order ID & Customer) */}
          <div className="flex flex-col gap-2 min-w-[120px]">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md opacity-70" />
          </div>

          {/* Customer Details */}
          <div className="hidden md:flex flex-col gap-2 min-w-[180px]">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md opacity-60" />
          </div>

          {/* Main Content Bar (represents multiple columns) */}
          <div className="flex-1 flex items-center gap-4">
             <Skeleton className="h-2 w-full rounded-full opacity-30" />
          </div>

          {/* Status Badge */}
          <div className="hidden sm:block">
            <Skeleton className="h-7 w-24 rounded-full opacity-80" />
          </div>

          {/* Financials / Actions */}
          <div className="flex items-center gap-3 ml-4">
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-3 w-12 rounded-md opacity-60" />
            </div>
            <Skeleton className="h-10 w-10 rounded-xl opacity-40" />
          </div>
          
          {/* Subtle Shimmer Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer pointer-events-none" />
        </div>
      ))}
    </div>
  );
}
