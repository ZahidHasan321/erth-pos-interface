import * as React from "react"
import { cn } from "./lib/utils"

interface DialogSuccessProps {
  message?: string
  onDone?: () => void
  duration?: number
  className?: string
}

function DialogSuccess({ message = "Done", onDone, duration = 1200, className }: DialogSuccessProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDone?.(), duration)
    return () => clearTimeout(timer)
  }, [onDone, duration])

  return (
    <div className={cn("flex flex-col items-center justify-center py-10 gap-3 animate-in fade-in zoom-in-95 duration-300", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <svg
          className="h-8 w-8 animate-in zoom-in-0 duration-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
            className="animate-[draw_0.4s_ease-out_0.2s_both]"
            style={{
              strokeDasharray: 24,
              strokeDashoffset: 24,
              animation: "draw 0.4s ease-out 0.2s forwards",
            }}
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-foreground">{message}</p>
      <style>{`
        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}

export { DialogSuccess }
export type { DialogSuccessProps }
