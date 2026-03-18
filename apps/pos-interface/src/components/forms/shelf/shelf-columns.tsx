'use client'

import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { type ShelfProduct } from './shelf-form.schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'

export const columns: ColumnDef<ShelfProduct>[] = [
  {
    accessorKey: 'serial_number',
    header: '#',
    size: 40,
    minSize: 40,
    cell: ({ row }) => (
      <span className="text-xs font-bold text-muted-foreground">{row.index + 1}</span>
    ),
  },
  {
    accessorKey: 'product_type',
    header: 'Product Type',
    size: 160,
    minSize: 140,
    cell: ({ row, table }) => {
        const { updateData, serverProducts, errors, isOrderDisabled } = table.options.meta as any
        const error = errors?.[row.index]?.product_type

        // Get unique product types from server data
        const productTypes: string[] = Array.from(
          new Set(serverProducts?.map((p: any) => p.type).filter(Boolean) || [])
        )

        return (
            <div className="flex flex-col gap-1">
                <Select
                    value={row.original.product_type}
                    onValueChange={(value) => updateData(row.index, 'product_type', value)}
                    disabled={isOrderDisabled}
                >
                    <SelectTrigger className={`bg-background border-border/60 ${error ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                        {productTypes.map((type: string, idx: number) => (
                            <SelectItem key={`type-${idx}-${type}`} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {error && <span className="text-xs text-red-500 text-left">{error.message}</span>}
            </div>
        )
    }
  },
  {
    accessorKey: 'brand',
    header: 'Brand',
    size: 160,
    minSize: 140,
    cell: ({ row, table }) => {
        const { updateData, serverProducts, selectedProducts, errors, isOrderDisabled } = table.options.meta as any
        const error = errors?.[row.index]?.brand

        // Filter brands based on selected product type
        const selectedType = row.original.product_type
        const brands: string[] = serverProducts
            ?.filter((p: any) => !selectedType || p.type === selectedType)
            .map((p: any) => p.brand)
            .filter(Boolean) || []
        const uniqueBrands: string[] = Array.from(new Set(brands))

        return (
            <div className="flex flex-col gap-1">
                <Select
                    value={row.original.brand}
                    onValueChange={(value) => updateData(row.index, 'brand', value)}
                    disabled={!selectedType || isOrderDisabled}
                >
                    <SelectTrigger className={`bg-background border-border/60 ${error ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="Select Brand" />
                    </SelectTrigger>
                    <SelectContent>
                        {uniqueBrands.map((brand: string, idx: number) => {
                            const combination = `${selectedType}-${brand}`
                            const isCurrentlySelectedInThisRow = row.original.brand === brand
                            const isAlreadySelectedElsewhere = selectedProducts?.includes(combination) && !isCurrentlySelectedInThisRow

                            const product = serverProducts?.find(
                                (p: any) => p.brand === brand && p.type === selectedType
                            )
                            const hasStock = (product?.stock && product.stock > 0) || isCurrentlySelectedInThisRow

                            if (isAlreadySelectedElsewhere) return null;

                            return (
                                <SelectItem
                                    key={`brand-${idx}-${brand}`}
                                    value={brand}
                                    disabled={!hasStock}
                                >
                                    {brand}
                                    {!hasStock && ' (Out of stock)'}
                                </SelectItem>
                            )
                        }).filter(Boolean)}
                    </SelectContent>
                </Select>
                {error && <span className="text-xs text-red-500 text-left">{error.message}</span>}
            </div>
        )
    }
  },
  {
    accessorKey: 'stock',
    header: 'Stock',
    size: 60,
    minSize: 60,
    cell: ({ row }) => {
      const isProductSelected = !!row.original.product_type && !!row.original.brand
      if (!isProductSelected) return <span className="text-muted-foreground">-</span>

      const stock = row.original.stock || 0;
      const colorClass =
        stock <= 0 ? "text-red-600 font-bold" :
        stock < 5 ? "text-orange-600 font-bold" :
        stock <= 11 ? "text-green-600 font-bold" :
        "text-foreground font-bold";

      return <span className={colorClass}>{stock}</span>
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Quantity',
    size: 120,
    minSize: 110,
    cell: QuantityCell,
  },
  {
    accessorKey: 'unit_price',
    header: 'Unit Price',
    size: 80,
    minSize: 90,
    cell: ({ row }) => {
        const isProductSelected = !!row.original.product_type && !!row.original.brand
        if (!isProductSelected) return <span className="text-muted-foreground">-</span>

        return (
            <span className="font-bold">
                {Number(row.original.unit_price).toFixed(2)}
            </span>
        )
    }
  },
  {
    id: 'totalAmount',
    header: 'Total',
    size: 100,
    minSize: 90,
    cell: ({ row }) => {
      const isProductSelected = !!row.original.product_type && !!row.original.brand
      if (!isProductSelected) return <span className="text-muted-foreground">-</span>

      const total = row.original.quantity * row.original.unit_price
      return <span className="font-bold text-primary">{total.toFixed(2)}</span>
    },
  },
  {
    id: 'actions',
    size: 50,
    minSize: 50,
    cell: ({ row, table }) => {
      const { removeRow, isOrderDisabled } = table.options.meta as any
      if (isOrderDisabled) return null
      return (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => removeRow(row.index)}
          className="size-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
          aria-label="Remove item"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )
    },
  },
]

function QuantityCell({ row, table }: { row: any; table: any }) {
  const { updateData, isOrderDisabled, errors } = table.options.meta as any
  const quantity = row.original.quantity
  const maxStock = row.original.stock || 0
  const [inputValue, setInputValue] = React.useState(String(quantity))
  const error = errors?.[row.index]?.quantity

  React.useEffect(() => {
    setInputValue(String(quantity))
  }, [quantity])

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault()
    if (maxStock === 0) return
    if (quantity < maxStock) {
      updateData(row.index, 'quantity', quantity + 1)
    }
  }

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault()
    if (quantity > 1) {
      updateData(row.index, 'quantity', quantity - 1)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    if (value === '') return

    const numValue = parseInt(value)
    if (isNaN(numValue)) return

    if (numValue < 1) {
      updateData(row.index, 'quantity', 1)
      return
    }

    if (maxStock > 0 && numValue > maxStock) {
      updateData(row.index, 'quantity', maxStock)
      return
    }

    updateData(row.index, 'quantity', numValue)
  }

  const handleBlur = () => {
    const numValue = parseInt(inputValue)
    if (isNaN(numValue) || inputValue === '' || numValue < 1) {
      updateData(row.index, 'quantity', 1)
      setInputValue('1')
    }
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select()
  }

  const isProductSelected = !!row.original.product_type && !!row.original.brand
  const hasStockError = isProductSelected && (maxStock === 0 || quantity > maxStock)
  const hasError = hasStockError || !!error

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="icon"
          onClick={handleDecrement}
          disabled={quantity <= 1 || isOrderDisabled}
          variant="outline"
          className="size-8"
          aria-label="Decrease quantity"
        >
          -
        </Button>
        <Input
          type="number"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          className={`w-14 text-center font-bold ${hasError ? 'border-red-500' : 'border-border/60'}`}
          max={maxStock}
          min={1}
          disabled={isOrderDisabled}
        />
        <Button
          type="button"
          size="icon"
          onClick={handleIncrement}
          disabled={quantity >= maxStock || (isProductSelected && maxStock === 0) || isOrderDisabled}
          variant="outline"
          className="size-8"
          aria-label="Increase quantity"
        >
          +
        </Button>
      </div>
      {isProductSelected && maxStock === 0 && (
        <span className="text-xs text-red-600 font-bold text-center">No stock</span>
      )}
      {isProductSelected && quantity > maxStock && maxStock > 0 && (
        <span className="text-xs text-red-600 font-bold text-center">Exceeds stock ({maxStock})</span>
      )}
      {error && <span className="text-xs text-red-500 text-center">{error.message}</span>}
    </div>
  )
}
