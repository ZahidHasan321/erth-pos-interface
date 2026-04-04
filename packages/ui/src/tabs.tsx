import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "./lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  variant = "pill",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: "pill" | "card"
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const indicatorRef = React.useRef<HTMLDivElement>(null)

  const updateIndicator = React.useCallback(() => {
    const list = ref.current
    const indicator = indicatorRef.current
    if (!list || !indicator) return

    const active = list.querySelector<HTMLElement>('[data-state="active"]')
    if (!active) {
      indicator.style.opacity = "0"
      return
    }

    const listRect = list.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()

    indicator.style.opacity = "1"
    indicator.style.width = `${activeRect.width}px`
    indicator.style.height = `${activeRect.height}px`
    indicator.style.transform = `translate(${activeRect.left - listRect.left - list.clientLeft}px, ${activeRect.top - listRect.top - list.clientTop}px)`
  }, [])

  React.useEffect(() => {
    const list = ref.current
    if (!list) return
    updateIndicator()
    const observer = new MutationObserver(updateIndicator)
    observer.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] })
    return () => observer.disconnect()
  }, [updateIndicator])

  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "text-muted-foreground relative inline-flex h-11 w-fit items-center justify-center overflow-hidden rounded-lg p-1.5",
        variant === "pill" && "bg-muted",
        variant === "card" && "bg-foreground/10 w-full gap-1 rounded-xl [&>[data-slot=tabs-trigger]]:flex-1",
        className
      )}
      {...props}
    >
      <div
        ref={indicatorRef}
        className={cn(
          "absolute top-0 left-0 shadow-sm transition-[transform,width,opacity] duration-250 ease-out pointer-events-none",
          variant === "pill" && "rounded-md bg-background",
          variant === "card" && "rounded-lg bg-white border border-border"
        )}
        style={{ opacity: 0 }}
      />
      {props.children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 cursor-pointer select-none touch-manipulation pointer-coarse:active:scale-[0.97] text-muted-foreground",
        "data-[state=active]:text-foreground",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
