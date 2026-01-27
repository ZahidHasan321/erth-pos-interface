'use client'
import { Button } from '@/components/ui/button'
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
}

export function ShelfForm({ form, onProceed, isOrderDisabled }: ShelfFormProps) {
  // Fetch products from server
  const { data: serverProducts, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: getShelf,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const { fields, append, remove, update } = useFieldArray({
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
      {/* Title Section */}
      <div className="flex justify-between items-start mb-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">
            Shelf Products
          </h1>
          <p className="text-sm text-muted-foreground">Select products from inventory shelf</p>
        </div>
      </div>

      {/* Content Section */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-6">
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

        <div className="flex justify-between items-center pt-4 border-t border-border">
          {!isOrderDisabled && (
            <Button type="button" variant="outline" onClick={addRow}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          )}
          <div className="text-lg font-semibold">
            Total Amount: <span className="text-primary">{totalAmount.toFixed(2)} KWD</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!isOrderDisabled && (
        <div className="flex gap-4 justify-end">
          <Button type="button" onClick={handleProceed}>
            Continue to Order & Payment
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  )
}