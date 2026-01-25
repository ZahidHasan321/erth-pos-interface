import { z } from 'zod';

export const shelvedProductSchema = z.object({
  id: z.string(),
  serial_number: z.string(),
  product_type: z.string(),
  brand: z.string(),
  quantity: z.number(),
  stock: z.number(),
  unit_price: z.number(),
});

export const shelfFormSchema = z.object({
  products: z.array(shelvedProductSchema)
});

// Add this line to export the type
export type ShelvedProduct = z.infer<typeof shelvedProductSchema>;

export type ShelfFormValues = z.infer<typeof shelfFormSchema>;