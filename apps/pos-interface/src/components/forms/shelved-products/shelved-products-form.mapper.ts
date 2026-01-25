import type { Shelf } from "@repo/database";
import { type ShelvedProduct } from "./shelved-products-form.schema";

/**
 * Direct mapping from Shelf (DB) to Form Values
 */
export function mapShelfToFormProduct(s: Shelf): Partial<ShelvedProduct> {
    return {
        shelf_id: s.id,
        product_type: s.type || "",
        brand: s.brand || "",
        unit_price: s.price || 0,
        quantity: 1,
    };
}

/**
 * Direct mapping from Form Values to API update
 */
export function mapFormProductToShelfUpdate(p: ShelvedProduct): Partial<Shelf> {
    return {
        id: p.shelf_id || undefined,
        type: p.product_type,
        brand: p.brand,
    };
}
