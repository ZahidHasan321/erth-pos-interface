"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FullScreenLoaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export function FullScreenLoader({
  title = "Loading",
  subtitle = "Please wait...",
  className,
}: FullScreenLoaderProps) {
  return (
    <div className={cn(
      "fixed inset-0 z-[1000] flex items-center justify-center bg-background/25 backdrop-blur-sm animate-in fade-in duration-300",
      className
    )}>
      <div className="flex flex-col items-center gap-5 p-10 bg-white/90 rounded-3xl border border-white/20 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] backdrop-blur-xl scale-100 animate-in zoom-in-95 duration-300">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative bg-primary p-4 rounded-full shadow-lg shadow-primary/30">
            <Loader2 className="size-8 animate-spin text-white" />
          </div>
        </div>
        <div className="space-y-1.5 text-center">
          <h3 className="text-xl font-black text-foreground tracking-tight">{title}</h3>
          <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
