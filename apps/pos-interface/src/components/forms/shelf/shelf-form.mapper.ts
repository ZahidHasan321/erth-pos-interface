import type { Shelf } from "@repo/database";
import { type ShelfProduct } from "./shelf-form.schema";

/**
 * Direct mapping from Shelf (DB) to Form Values
 */
export function mapShelfToFormProduct(s: Shelf): Partial<ShelfProduct> {
    return {
        id: s.id.toString(),
        product_type: s.type || "",
        brand: s.brand || "",
        unit_price: s.price || 0,
        quantity: 1,
    };
}

/**
 * Direct mapping from Form Values to API update
 */
export function mapFormProductToShelfUpdate(p: ShelfProduct): Partial<Shelf> {
    return {
        id: p.id ? parseInt(p.id) : undefined,
        type: p.product_type,
        brand: p.brand,
    };
}