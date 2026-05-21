'use client'

import * as React from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { type ShelfProduct } from './shelf-form.schema'
import { Button } from '@repo/ui/button'
import { Input } from '@repo/ui/input'
import { Trash2 } from 'lucide-react'

export const columns: ColumnDef<ShelfProduct>[] = [
  {
    accessorKey: 'serial_number',
    header: '#',
    size: 6,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.index + 1}</span>
    ),
  },
  {
    accessorKey: 'product_type',
    header: 'Item',
    size: 29,
    cell: ({ row }) => (
      <div className="flex flex-col text-left min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {row.original.product_type || '—'}
        </span>
        {row.original.brand && (
          <span className="text-xs text-muted-foreground truncate">{row.original.brand}</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'stock',
    header: 'Stock',
    size: 9,
    cell: ({ row }) => {
      const stock = row.original.stock || 0
      const colorClass =
        stock <= 0
          ? 'text-red-600 font-medium'
          : stock < 5
            ? 'text-orange-600 font-medium'
            : 'text-foreground'

      return <span className={colorClass}>{stock}</span>
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Quantity',
    size: 22,
    cell: QuantityCell,
  },
  {
    accessorKey: 'unit_price',
    header: 'Unit Price',
    size: 12,
    cell: ({ row }) => (
      <span className="font-medium">{Number(row.original.unit_price).toFixed(2)}</span>
    ),
  },
  {
    id: 'totalAmount',
    header: 'Total',
    size: 15,
    cell: ({ row }) => {
      const total = row.original.quantity * row.original.unit_price
      return <span className="font-medium text-primary">{total.toFixed(2)}</span>
    },
  },
  {
    id: 'actions',
    size: 7,
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

  const hasStockError = maxStock === 0 || quantity > maxStock
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
          className={`w-14 text-center font-medium ${hasError ? 'border-red-500' : 'border-border/60'}`}
          max={maxStock}
          min={1}
          disabled={isOrderDisabled}
        />
        <Button
          type="button"
          size="icon"
          onClick={handleIncrement}
          disabled={quantity >= maxStock || maxStock === 0 || isOrderDisabled}
          variant="outline"
          className="size-8"
          aria-label="Increase quantity"
        >
          +
        </Button>
      </div>
      {maxStock === 0 && (
        <span className="text-sm text-red-600 font-medium text-center">No stock</span>
      )}
      {quantity > maxStock && maxStock > 0 && (
        <span className="text-sm text-red-600 font-medium text-center">
          Exceeds stock ({maxStock})
        </span>
      )}
      {error && <span className="text-sm text-red-500 text-center">{error.message}</span>}
    </div>
  )
}
