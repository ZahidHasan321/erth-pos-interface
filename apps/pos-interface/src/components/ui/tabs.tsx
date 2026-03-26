import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

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
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
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
    indicator.style.transform = `translateX(${activeRect.left - listRect.left - list.clientLeft}px)`
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
      className={cn(
        "bg-muted text-muted-foreground relative inline-flex h-10 w-fit items-center justify-center rounded-lg p-1",
        className
      )}
      {...props}
    >
      <div
        ref={indicatorRef}
        className="absolute top-1 left-0 rounded-md bg-primary shadow-sm transition-[transform,width,opacity] duration-250 ease-out pointer-events-none"
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
        "relative z-10 data-[state=active]:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-[3px] focus-visible:outline-1 cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 select-none touch-manipulation active:scale-[0.97]",
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
