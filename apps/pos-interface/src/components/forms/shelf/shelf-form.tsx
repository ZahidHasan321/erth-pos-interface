'use client'
import { Button } from '@repo/ui/button'
import { Badge } from '@repo/ui/badge'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useWatch, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { DataTable } from './data-table'
import type { ShelfProduct, ShelfFormValues } from './shelf-form.schema'
import { getShelf } from '@/api/shelf'
import { columns } from './shelf-columns'
import { toast } from 'sonner'
import { Plus, Package, Loader2, AlertCircle } from 'lucide-react'


interface ShelfFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<ShelfFormValues, any, any>
  onProceed?: () => void
  isOrderDisabled: boolean
  showHeader?: boolean
  hasOrder?: boolean
}

export function ShelfForm({ form, isOrderDisabled, onProceed, hasOrder = true }: ShelfFormProps) {
  // Fetch products from server
  const { data: serverProducts, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: getShelf,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const { append, remove, update } = useFieldArray({
    control: form.control,
    name: 'products',
  });

  // Watch products for total amount calculation and duplicate check
  const watchedProducts = useWatch({
    control: form.control,
    name: 'products',
  }) || [];

  // Define new row template
  const newRow: ShelfProduct = {
    id: '',
    serial_number: '',
    product_type: '',
    brand: '',
    quantity: 1,
    stock: 0,
    unit_price: 0,
  }

  // Get already selected product combinations (excluding current row)
  const getSelectedProducts = (currentRowIndex?: number) => {
    return watchedProducts
      .filter((row, index) => index !== currentRowIndex && row.product_type && row.brand)
      .map(row => `${row.product_type}-${row.brand}`)
  }

  const addRow = () => {
    append({ ...newRow, id: crypto.randomUUID() })
  }

  const removeRow = (rowIndex: number) => {
    remove(rowIndex)
  }

  const updateData = (rowIndex: number, columnId: string, value: any) => {
    const currentRow = watchedProducts[rowIndex]
    if (!currentRow) return

    // Check for duplicate before updating state
    if (columnId === 'brand') {
      const selectedProducts = getSelectedProducts(rowIndex)
      const newCombination = `${currentRow.product_type}-${value}`

      if (selectedProducts.includes(newCombination)) {
        toast.error('Product already selected', {
          description: 'This product is already added in another row.'
        })
        return
      }

      // Check if selected product has stock
      const selectedProduct = serverProducts?.find(
        (p: any) => p.brand === value && p.type === currentRow.product_type
      )

      if (selectedProduct && (!selectedProduct.shop_stock || selectedProduct.shop_stock === 0)) {
        toast.error('No stock available', {
          description: 'This product is currently out of stock.'
        })
        return
      }
    }

    let updatedRow = { ...currentRow, [columnId]: value }

    // Logic for brand selection
    if (columnId === 'brand') {
      const selectedProduct = serverProducts?.find(
        (p: any) => p.brand === value && p.type === currentRow.product_type
      )

      if (selectedProduct) {
        updatedRow = {
          ...updatedRow,
          id: selectedProduct.id.toString(),
          stock: selectedProduct.shop_stock || 0,
          unit_price: selectedProduct.price || 0,
          quantity: 1,
        }
      }
    }

    // Logic for product_type selection
    if (columnId === 'product_type') {
      const brandsForType = serverProducts?.filter(
        (p: any) => p.type === value
      )
      const uniqueBrands = Array.from(new Set(brandsForType?.map((p: any) => p.brand).filter(Boolean)))

      if (uniqueBrands.length === 1) {
        const onlyBrand = uniqueBrands[0] as string
        const selectedProduct = brandsForType?.find((p: any) => p.brand === onlyBrand)

        if (selectedProduct) {
          const selectedProducts = getSelectedProducts(rowIndex)
          const combination = `${value}-${onlyBrand}`

          // Only auto-select if not already selected elsewhere and has stock
          if (!selectedProducts.includes(combination) && selectedProduct.shop_stock && selectedProduct.shop_stock > 0) {
            updatedRow = {
              ...updatedRow,
              id: selectedProduct.id.toString(),
              product_type: value,
              brand: onlyBrand,
              stock: selectedProduct.shop_stock || 0,
              unit_price: selectedProduct.price || 0,
              quantity: 1,
            }
          } else {
            updatedRow = {
              ...updatedRow,
              id: '',
              product_type: value,
              brand: '',
              stock: 0,
              unit_price: 0,
              quantity: 1,
            }
          }
        }
      } else {
        updatedRow = {
          ...updatedRow,
          id: '',
          brand: '',
          stock: 0,
          unit_price: 0,
          quantity: 1,
        }
      }
    }

    update(rowIndex, updatedRow)
  }

  const totalAmount = useMemo(() =>
    watchedProducts.reduce((acc, row) => acc + (row.quantity || 0) * (row.unit_price || 0), 0)
  , [watchedProducts])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground gap-3">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm font-bold uppercase tracking-widest">Loading products...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6 text-destructive gap-3">
        <AlertCircle className="size-5" />
        <span className="text-sm font-bold">Error loading products: {error.message}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full">
      {/* Section Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h2 className="text-lg font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
              <Package className="size-4" />
            </div>
            Shelf <span className="text-primary">Products</span>
          </h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70 ml-9">
            Select inventory items for direct sales
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isOrderDisabled && (
            <Button
              type="button"
              onClick={addRow}
              variant="outline"
              size="sm"
              className="h-9 px-4 font-black uppercase tracking-widest text-xs gap-2 border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
            >
              <Plus className="size-3.5" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={watchedProducts}
        updateData={updateData}
        removeRow={removeRow}
        serverProducts={serverProducts}
        selectedProducts={getSelectedProducts()}
        isOrderDisabled={isOrderDisabled}
        errors={form.formState.errors.products as any}
      />

      {/* Summary Footer */}
      <div className="flex justify-between items-center pt-2">
        <Badge variant="outline" className="text-xs font-black uppercase tracking-widest px-3 py-1.5 bg-background border-border text-muted-foreground">
          {watchedProducts.length} {watchedProducts.length === 1 ? 'Item' : 'Items'}
        </Badge>

        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Total</span>
          <div className="text-lg font-black text-primary tracking-tighter">
            {totalAmount.toFixed(2)} <span className="text-xs font-bold uppercase ml-0.5">KWD</span>
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
    </div>
  )
}
