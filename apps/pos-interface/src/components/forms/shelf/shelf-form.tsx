'use client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useWatch, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { DataTable } from './data-table'
import type { ShelfProduct, ShelfFormValues } from './shelf-form.schema'
import { getShelf } from '@/api/shelf'
import { columns } from './shelf-columns'
import { toast } from 'sonner'
import { Plus, ArrowRight } from 'lucide-react'

interface ShelfFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<ShelfFormValues, any, any>
  onProceed?: () => void
  isOrderDisabled: boolean
  showHeader?: boolean
}

export function ShelfForm({ form, onProceed, isOrderDisabled, showHeader = true }: ShelfFormProps) {
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

  const handleProceed = async () => {
    const isValid = await form.trigger('products')
    if (isValid) {
      onProceed?.()
    }
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
      const selectedProduct = serverProducts?.data?.find(
        (p: any) => p.brand === value && p.type === currentRow.product_type
      )

      if (selectedProduct && (!selectedProduct.stock || selectedProduct.stock === 0)) {
        toast.error('No stock available', {
          description: 'This product is currently out of stock.'
        })
        return
      }
    }

    let updatedRow = { ...currentRow, [columnId]: value }

    // Logic for brand selection
    if (columnId === 'brand') {
      const selectedProduct = serverProducts?.data?.find(
        (p: any) => p.brand === value && p.type === currentRow.product_type
      )

      if (selectedProduct) {
        updatedRow = {
          ...updatedRow,
          id: selectedProduct.id.toString(),
          stock: selectedProduct.stock || 0,
          unit_price: selectedProduct.price || 0,
          quantity: 1,
        }
      }
    }

    // Logic for product_type selection
    if (columnId === 'product_type') {
      const brandsForType = serverProducts?.data?.filter(
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
          if (!selectedProducts.includes(combination) && selectedProduct.stock && selectedProduct.stock > 0) {
            updatedRow = {
              ...updatedRow,
              id: selectedProduct.id.toString(),
              product_type: value,
              brand: onlyBrand,
              stock: selectedProduct.stock || 0,
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
    return <div className='p-4'>Loading products...</div>
  }

  if (error) {
    return <div className='p-4 text-red-500'>Error loading products: {error.message}</div>
  }

  return (
    <div className="space-y-6 w-full">
      {/* Title & Action Section (Work Order Version) */}
      {showHeader && (
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-2">
            <div className="space-y-1">
            <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
                Shelf <span className="text-primary">Products</span>
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">Inventory items for direct sales</p>
            </div>
        </div>
      )}

      {/* Content Section */}
      <div className="bg-card rounded-2xl border-2 border-border shadow-sm overflow-hidden">
        {/* Card Header for Table Actions */}
        <div className="bg-muted/20 border-b p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="p-1.5 bg-primary rounded-lg text-primary-foreground">
                <Plus className="size-4" />
             </div>
             <span className="text-sm font-black uppercase tracking-widest text-foreground">Order Items</span>
          </div>
          {!isOrderDisabled && (
            <Button 
              type="button" 
              onClick={addRow}
              variant="outline"
              className="h-9 px-4 font-black uppercase tracking-widest text-[10px] gap-2 border-primary/20 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
            >
              <Plus className="size-3.5" />
              Add New Item
            </Button>
          )}
        </div>

        <div className="p-1">
          <DataTable
            columns={columns}
            data={watchedProducts}
            updateData={updateData}
            removeRow={removeRow}
            serverProducts={serverProducts?.data}
            selectedProducts={getSelectedProducts()}
            isOrderDisabled={isOrderDisabled}
            errors={form.formState.errors.products as any}
          />
        </div>

        {/* Summary Footer */}
        <div className="bg-muted/30 border-t-2 border-border p-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="hidden md:block">
             <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-white border-border text-muted-foreground">
                {watchedProducts.length} Items Selected
             </Badge>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
            <div className="flex flex-col items-center md:items-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Grand Total</span>
              <div className="text-3xl font-black text-primary tracking-tighter">
                {totalAmount.toFixed(2)} <span className="text-sm font-bold uppercase ml-1">KWD</span>
              </div>
            </div>

            {!isOrderDisabled && (
              <Button 
                type="button" 
                onClick={handleProceed}
                size="lg"
                className="h-14 px-8 font-black uppercase tracking-widest text-xs gap-3 shadow-xl shadow-primary/30 w-full md:w-auto"
              >
                Proceed to Payment
                <ArrowRight className="size-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}