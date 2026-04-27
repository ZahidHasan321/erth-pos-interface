import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { Card2HtmlDocument, type Card2HtmlDocumentProps } from './Card2HtmlDocument'

export interface PrintCard2Options {
  documentTitle?: string
}

export async function printCard2(
  props: Card2HtmlDocumentProps,
  opts: PrintCard2Options = {},
): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(iframe)

  await waitForIframeReady(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error('printCard2: iframe document unavailable')
  }

  copyParentStylesheets(doc)

  if (opts.documentTitle) {
    doc.title = opts.documentTitle
  }

  const mount = doc.createElement('div')
  doc.body.appendChild(mount)

  const root: Root = createRoot(mount)
  root.render(React.createElement(Card2HtmlDocument, props))

  // Let React commit, then wait for fonts and images.
  await nextFrame()
  await nextFrame()
  await waitForFonts(doc)
  await waitForImages(doc)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      root.unmount()
    } catch {
      /* noop */
    }
    iframe.remove()
  }
  win.addEventListener('afterprint', cleanup, { once: true })
  // Safety net in case afterprint never fires (some browsers / cancelled dialogs).
  setTimeout(cleanup, 60_000)

  win.focus()
  win.print()
}

const waitForIframeReady = (iframe: HTMLIFrameElement) =>
  new Promise<void>((resolve) => {
    if (iframe.contentDocument?.readyState === 'complete') {
      resolve()
      return
    }
    iframe.addEventListener('load', () => resolve(), { once: true })
  })

const copyParentStylesheets = (doc: Document) => {
  const sources = document.head.querySelectorAll('link[rel="stylesheet"], style')
  sources.forEach((node) => {
    doc.head.appendChild(node.cloneNode(true))
  })
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const waitForFonts = async (doc: Document) => {
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  if (!fonts?.ready) return
  try {
    await fonts.ready
  } catch {
    /* noop */
  }
}

const waitForImages = (doc: Document) => {
  const images = Array.from(doc.images)
  return Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    }),
  )
}
