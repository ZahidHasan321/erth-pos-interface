import type { Garment, Measurement } from "./schema";

export interface ProductionPlan {
    soaker?: string;
    cutter?: string;
    post_cutter?: string;
    sewer?: string;
    sewing_unit?: string;
    finisher?: string;
    ironer?: string;
    quality_checker?: string;
}

export interface WorkerHistory {
    soaker?: string;
    cutter?: string;
    post_cutter?: string;
    sewer?: string;
    finisher?: string;
    ironer?: string;
    quality_checker?: string;
}

export interface QualityCheckRatings {
    stitching?: number;
    measurement?: number;
    fabric?: number;
    finishing?: number;
    appearance?: number;
}

/**
 * WorkshopGarment extends Garment with typed jsonb fields and denormalized
 * relations needed by the workshop app.
 */
export type WorkshopGarment = Omit<Garment, 'production_plan' | 'worker_history' | 'quality_check_ratings'> & {
    production_plan: ProductionPlan | null;
    worker_history: WorkerHistory | null;
    quality_check_ratings: QualityCheckRatings | null;
    // Denormalized from JOIN
    customer_name?: string;
    customer_mobile?: string;
    invoice_number?: number;
    measurement?: Measurement | null;
    order_brand?: string;
    delivery_date_order?: string;
    home_delivery_order?: boolean;
    order_phase?: string;
    style_name?: string;
    style_image_url?: string;
    fabric_name?: string;
    fabric_color?: string;
};
