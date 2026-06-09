'use client'
import { Button } from '@repo/ui/button'
import { Badge } from '@repo/ui/badge'
import { Input } from '@repo/ui/input'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useWatch, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { DataTable } from './data-table'
import type { ShelfProduct, ShelfFormValues } from './shelf-form.schema'
import { getShelf } from '@/api/shelf'
import type { Shelf } from '@repo/database'
import { columns } from './shelf-columns'
import { toast } from 'sonner'
import { Package, Loader2, AlertCircle, Search, Check, ScanBarcode } from 'lucide-react'
import { BarcodeScannerDialog } from '@/components/inventory/BarcodeScannerDialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/tooltip'

interface ShelfFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<ShelfFormValues, any, any>
  onProceed?: () => void
  isOrderDisabled: boolean
  showHeader?: boolean
  hasOrder?: boolean
}

export function ShelfForm({ form, isOrderDisabled, onProceed, hasOrder = true }: ShelfFormProps) {
  const { data: serverProducts, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: () => getShelf(),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const { append, remove, update } = useFieldArray({
    control: form.control,
    name: 'products',
  })

  const watchedProductsRaw = useWatch({
    control: form.control,
    name: 'products',
  })
  const watchedProducts = useMemo(() => watchedProductsRaw || [], [watchedProductsRaw])

  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  // Quantities already in the cart, keyed by shelf id
  const cartQtyById = useMemo(() => {
    const map = new Map<string, number>()
    watchedProducts.forEach((p) => {
      if (p.id) map.set(p.id, (map.get(p.id) || 0) + (p.quantity || 0))
    })
    return map
  }, [watchedProducts])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = serverProducts || []
    if (!q) return list
    return list.filter((p: Shelf) =>
      [p.type, p.brand, p.sku].filter(Boolean).some((f) => (f as string).toLowerCase().includes(q))
    )
  }, [serverProducts, search])

  const VISIBLE_LIMIT = 10
  const visibleProducts = useMemo(
    () => (showAll ? filteredProducts : filteredProducts.slice(0, VISIBLE_LIMIT)),
    [filteredProducts, showAll]
  )
  const hiddenCount = filteredProducts.length - visibleProducts.length

  // Add a product to the cart, or bump its quantity if already there.
  const addProduct = (product: Shelf) => {
    if (isOrderDisabled) return

    const stock = product.shop_stock || 0
    if (stock <= 0) {
      toast.error('No stock available', {
        description: `${product.type} is currently out of stock.`,
      })
      return
    }

    const id = product.id.toString()
    const existingIndex = watchedProducts.findIndex((p) => p.id === id)

    if (existingIndex >= 0) {
      const existing = watchedProducts[existingIndex]!
      if (existing.quantity >= stock) {
        toast.error('Stock limit reached', {
          description: `Only ${stock} of ${product.type} in stock.`,
        })
        return
      }
      update(existingIndex, { ...existing, quantity: existing.quantity + 1 })
      return
    }

    const newRow: ShelfProduct = {
      id,
      serial_number: product.sku || '',
      product_type: product.type || '',
      brand: product.brand || '',
      quantity: 1,
      stock,
      unit_price: product.price || 0,
    }
    append(newRow)
  }

  // Resolve a scanned barcode to a shelf item by SKU or serial number, then add it.
  const handleScan = (rawCode: string) => {
    setScannerOpen(false)
    const code = rawCode.trim().toLowerCase()
    if (!code) return
    const match = (serverProducts || []).find((p: Shelf) =>
      [p.sku].filter(Boolean).some((f) => (f as string).trim().toLowerCase() === code)
    )
    if (!match) {
      toast.error('No matching product', {
        description: `No shelf item with barcode "${rawCode}".`,
      })
      return
    }
    addProduct(match)
    toast.success(`Added ${match.type || 'item'}`, { description: `Barcode ${rawCode}` })
  }

  const removeRow = (rowIndex: number) => {
    remove(rowIndex)
  }

  // Cart now only edits quantity; product/brand are fixed once added.
  const updateData = (rowIndex: number, columnId: string, value: unknown) => {
    const currentRow = watchedProducts[rowIndex]
    if (!currentRow) return
    update(rowIndex, { ...currentRow, [columnId]: value })
  }

  const totalAmount = useMemo(
    () => watchedProducts.reduce((acc, row) => acc + (row.quantity || 0) * (row.unit_price || 0), 0),
    [watchedProducts]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground gap-3">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">Loading products...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6 text-destructive gap-3">
        <AlertCircle className="size-5" />
        <span className="text-sm font-medium">Error loading products: {error.message}</span>
      </div>
    )
  }

  return (
    <div className="space-y-5 w-full">
      {/* Section Header */}
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
          <Package className="size-4" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">Shelf Products</h2>
          <p className="text-sm text-muted-foreground">Pick items to add to the order</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row rounded-lg border border-border overflow-hidden bg-card">
        {/* Product Picker */}
        {!isOrderDisabled && (
          <div className="flex flex-col gap-3 lg:w-1/3 lg:shrink-0 h-[28rem] lg:h-[34rem] p-4 border-b lg:border-b-0 lg:border-r border-border">
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, brand or SKU..."
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setScannerOpen(true)}
                title="Scan barcode with camera"
                aria-label="Scan barcode with camera"
              >
                <ScanBarcode className="size-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] pr-2.5 space-y-3">
              {filteredProducts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                  No products match "{search}"
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
              {visibleProducts.map((product: Shelf) => {
                const id = product.id.toString()
                const stock = product.shop_stock || 0
                const inCart = cartQtyById.get(id) || 0
                const soldOut = stock <= 0
                const maxedOut = inCart >= stock
                const disabled = soldOut || maxedOut

                return (
                  <Tooltip key={id}>
                    <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => addProduct(product)}
                    disabled={disabled}
                    className={`group relative flex flex-col text-left rounded-lg border bg-card transition-colors ${
                      disabled
                        ? 'opacity-55 cursor-not-allowed border-border'
                        : 'border-border hover:border-primary hover:bg-primary/[0.03]'
                    }`}
                  >
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        <Check className="size-3" />
                        {inCart}
                      </span>
                    )}

                    <div className="flex h-28 items-center justify-center overflow-hidden rounded-t-lg bg-muted/40">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.type ?? ""}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="size-8 text-muted-foreground/40" />
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <span className="text-sm font-medium text-foreground line-clamp-1">
                        {product.type || 'Unnamed'}
                      </span>
                      {product.brand && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {product.brand}
                        </span>
                      )}
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-primary">
                          {Number(product.price || 0).toFixed(2)}
                          <span className="ml-0.5 text-xs text-muted-foreground">KWD</span>
                        </span>
                        <span
                          className={`text-xs ${
                            soldOut
                              ? 'text-red-600 font-medium'
                              : stock < 5
                                ? 'text-orange-600 font-medium'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {soldOut ? 'Out of stock' : `${stock} in stock`}
                        </span>
                      </div>
                    </div>
                  </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-medium">{product.type || 'Unnamed'}</p>
                      {product.brand && (
                        <p className="text-muted-foreground">{product.brand}</p>
                      )}
                      <p className="text-muted-foreground">
                        {Number(product.price || 0).toFixed(2)} KWD ·{' '}
                        {soldOut ? 'Out of stock' : `${stock} in stock`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )
                  })}
                </div>
              )}

              {hiddenCount > 0 && (
                <div className="flex justify-center pb-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAll(true)}
                  >
                    Show more ({hiddenCount})
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cart */}
        <div
          className={`flex flex-1 min-w-0 flex-col gap-3 p-4 bg-muted/20 ${
            isOrderDisabled ? '' : 'h-[24rem] lg:h-[34rem]'
          }`}
        >
          <h3 className="text-sm font-medium text-muted-foreground shrink-0">
            Selected items
            {watchedProducts.length > 0 && (
              <span className="ml-1.5 text-muted-foreground/70">({watchedProducts.length})</span>
            )}
          </h3>

          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] pr-1">
            <DataTable
              columns={columns}
              data={watchedProducts}
              updateData={updateData}
              removeRow={removeRow}
              serverProducts={serverProducts}
              isOrderDisabled={isOrderDisabled}
              errors={form.formState.errors.products as unknown as { quantity?: { message?: string } }[]}
            />
          </div>

          {/* Summary Footer */}
          <div className="flex justify-between items-center pt-3 border-t border-border shrink-0">
            <Badge variant="outline" className="text-xs px-3 py-1.5 text-muted-foreground">
              {watchedProducts.length} {watchedProducts.length === 1 ? 'Item' : 'Items'}
            </Badge>

            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <div className="text-lg font-medium text-primary">
                {totalAmount.toFixed(2)}{' '}
                <span className="text-xs text-muted-foreground ml-0.5">KWD</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proceed Button */}
      {onProceed && (
        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onProceed} disabled={isOrderDisabled || !hasOrder}>
            Proceed to Review & Payment
          </Button>
        </div>
      )}

      <BarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={handleScan}
      />
    </div>
  )
}
