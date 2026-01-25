import { z } from 'zod';

export const shelfProductSchema = z.object({
  id: z.string().min(1, 'Product is required'),
  serial_number: z.string(),
  product_type: z.string().min(1, 'Product type is required'),
  brand: z.string().min(1, 'Brand is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  stock: z.number(),
  unit_price: z.number().min(0, 'Price cannot be negative'),
});

export const shelfFormSchema = z.object({
  products: z.array(shelfProductSchema)
});

// Add this line to export the type
export type ShelfProduct = z.infer<typeof shelfProductSchema>;

export type ShelfFormValues = z.infer<typeof shelfFormSchema>;
