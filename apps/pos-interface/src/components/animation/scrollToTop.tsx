
"use client"

import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import * as React from "react"

export function ScrollToTopButton() {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          setVisible(window.scrollY > 300)
          ticking = false
        })
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
      <Button
        size="icon"
        onClick={scrollToTop}
        aria-label="Scroll to top"
        className="rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <ArrowUp className="h-5 w-5" />
      </Button>
    </div>
  )
}
