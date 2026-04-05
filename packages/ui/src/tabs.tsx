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

  React.useLayoutEffect(() => {
    const list = ref.current
    const indicator = indicatorRef.current
    if (!list || !indicator) return

    // Snap the pill into its initial position without animating from (0,0) → target.
    // Without this, the CSS transition on transform/width visibly slides the pill
    // from the top-left of the list through the middle tabs on mount.
    const prevTransition = indicator.style.transition
    indicator.style.transition = "none"
    updateIndicator()
    // Force reflow so the non-transitioned styles commit before we restore transitions
    void indicator.offsetWidth
    indicator.style.transition = prevTransition

    // Recompute on active-tab change
    const mutation = new MutationObserver(updateIndicator)
    mutation.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] })

    // Recompute when triggers resize (e.g. badges/counts appearing after async data loads)
    const resize = new ResizeObserver(updateIndicator)
    resize.observe(list)
    list.querySelectorAll('[data-slot="tabs-trigger"]').forEach((el) => resize.observe(el))

    return () => {
      mutation.disconnect()
      resize.disconnect()
    }
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
