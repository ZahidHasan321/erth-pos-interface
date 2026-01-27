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
    header: 'Serial Number',
    minSize: 80,
    cell: ({ row }) => <span>{row.index + 1}</span>,
  },
  {
    accessorKey: 'product_type',
    header: 'Product Type',
    size: 200,
    minSize: 200,
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
                    <SelectTrigger className={error ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select Product Type" />
                    </SelectTrigger>
                    <SelectContent>
                        {productTypes.map((type: string, idx: number) => (
                            <SelectItem key={`type-${idx}-${type}`} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {error && <span className="text-[10px] text-red-500 text-left">{error.message}</span>}
            </div>
        )
    }
  },
{
    accessorKey: 'brand',
    header: 'Brand',
    size: 220,
    minSize: 220,
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
                    <SelectTrigger className={error ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select Brand" />
                    </SelectTrigger>
                    <SelectContent>
                        {uniqueBrands.map((brand: string, idx: number) => {
                            const combination = `${selectedType}-${brand}`
                            const isAlreadySelected = selectedProducts?.includes(combination)

                            // Check if product has stock
                            const product = serverProducts?.find(
                                (p: any) => p.brand === brand && p.type === selectedType
                            )
                            const hasStock = product?.stock && product.stock > 0

                            return (
                                <SelectItem
                                    key={`brand-${idx}-${brand}`}
                                    value={brand}
                                    disabled={isAlreadySelected || !hasStock}
                                >
                                    {brand}
                                    {isAlreadySelected && ' (Already selected)'}
                                    {!hasStock && !isAlreadySelected && ' (OUT of stock)'}
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>
                {error && <span className="text-[10px] text-red-500 text-left">{error.message}</span>}
            </div>
        )
    }
  },
  {
    accessorKey: 'stock',
    header: 'Available Stock',
    minSize: 100,
    cell: ({ row }) => {
      const isProductSelected = !!row.original.product_type && !!row.original.brand
      if (!isProductSelected) return <div className="border rounded-md p-2 text-muted-foreground text-center">-</div>

      const stock = row.original.stock || 0;
      const getStockColorClass = () => {
        if (stock <= 0) return "text-red-600 font-semibold"; // OUT of stock
        if (stock < 5) return "text-orange-600 font-semibold"; // Less than 5
        if (stock >= 5 && stock <= 11) return "text-green-600 font-semibold"; // 5-11
        return "text-foreground"; // More than 11
      };
      return <div className={`border rounded-md p-2 ${getStockColorClass()}`}>{stock}</div>
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Quantity',
    minSize: 150,
    cell: ({ row, table }) => {
      const { updateData, isOrderDisabled, errors } = table.options.meta as any
      const quantity = row.original.quantity
      const maxStock = row.original.stock || 0
      const [inputValue, setInputValue] = React.useState(String(quantity))
      const error = errors?.[row.index]?.quantity

      // Sync local state when quantity changes externally (e.g., via buttons)
      React.useEffect(() => {
        setInputValue(String(quantity))
      }, [quantity])

      const handleIncrement = (e: React.MouseEvent) => {
        e.preventDefault()
        if (maxStock === 0) {
          return
        }
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

        // Allow empty input
        if (value === '') {
          return
        }

        const numValue = parseInt(value)

        // Only update if it's a valid number
        if (isNaN(numValue)) {
          return
        }

        // Clamp value between 1 and maxStock
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

        // On blur, ensure we have a valid value
        if (isNaN(numValue) || inputValue === '' || numValue < 1) {
          updateData(row.index, 'quantity', 1)
          setInputValue('1')
        }
      }

      const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // Select all text on focus for easy replacement
        e.target.select()
      }

      const isProductSelected = !!row.original.product_type && !!row.original.brand
      const hasStockError = isProductSelected && (maxStock === 0 || quantity > maxStock)
      const hasError = hasStockError || !!error

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              onClick={handleDecrement}
              disabled={quantity <= 1 || isOrderDisabled}
              variant="outline"
            >
              -
            </Button>
            <Input
              type="number"
              value={inputValue}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              className={`w-16 text-center ${hasError ? 'border-red-500' : ''}`}
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
            >
              +
            </Button>
          </div>
          {isProductSelected && maxStock === 0 && (
            <span className="text-xs text-red-600 font-semibold text-center">No stock available</span>
          )}
          {isProductSelected && quantity > maxStock && maxStock > 0 && (
            <span className="text-xs text-red-600 font-semibold text-center">Exceeds stock ({maxStock})</span>
          )}
          {maxStock > 0 && maxStock < 5 && quantity <= maxStock && (
            <span className="text-xs text-orange-600 font-semibold text-center">Low stock - Only {maxStock} available</span>
          )}
          {maxStock >= 5 && maxStock <= 11 && quantity <= maxStock && (
            <span className="text-xs text-green-600 font-semibold text-center">Limited stock - {maxStock} available</span>
          )}
          {error && <span className="text-[10px] text-red-500 text-center">{error.message}</span>}
        </div>
      )
    },
  },
  {
    accessorKey: 'unit_price',
    header: 'Unit Price',
    minSize: 120,
    cell: ({ row }) => {
        const isProductSelected = !!row.original.product_type && !!row.original.brand
        if (!isProductSelected) return <div className="border rounded-md p-2 text-muted-foreground">-</div>
        
        return (
            <div className="border rounded-md p-2">
                {row.original.unit_price.toFixed(2)}
            </div>
        )
    }
  },
  {
    id: 'totalAmount',
    header: 'Total Amount',
    minSize: 120,
    cell: ({ row }) => {
      const isProductSelected = !!row.original.product_type && !!row.original.brand
      if (!isProductSelected) return <div className="border rounded-md p-2 text-muted-foreground">-</div>

      const total = row.original.quantity * row.original.unit_price
      return <div className="border rounded-md p-2"><span>{total.toFixed(2)}</span></div>
    },
  },
  {
    id: 'actions',
    minSize: 80,
    cell: ({ row, table }) => {
      const { removeRow } = table.options.meta as any
      return (
        <Button type="button" variant="ghost" onClick={() => removeRow(row.index)}>
          <Trash2 className="h-4 w-4 text-red-500"/>
        </Button>
      )
    },
  },
]