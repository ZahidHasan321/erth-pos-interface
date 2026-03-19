import { useQuery } from "@tanstack/react-query";
import { getPrices } from "../api/prices";
import { getStyles } from "../api/styles";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";
import type { Style } from "@repo/database";

export interface Price {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export function usePricing() {
  const { data: pricesResponse, isLoading: pricesLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: getPrices,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const { data: stylesResponse, isLoading: stylesLoading } = useQuery({
    queryKey: ['styles'],
    queryFn: getStyles,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const prices = pricesResponse?.data as Price[] | undefined;
  const styles = (stylesResponse?.data || []) as Style[];
  const isLoading = pricesLoading || stylesLoading;

  // Helper to get system price safely (home delivery, express, stitching)
  const getPrice = (key: string) => Number(prices?.find(p => p.key === key)?.value || 0);

  // Stitching rates from DB
  const stitchingAdult = getPrice('STITCHING_ADULT') || 9;
  const stitchingChild = getPrice('STITCHING_CHILD') || 7;

  const calculateOrderTotal = (
    garments: any[],
    shelfItems: any[],
    homeDelivery: boolean,
    expressCount: number,
    stitchingBaseOverride?: number
  ) => {
    // 1. Calculate Fabric (sum of individual garment fabric prices)
    const fabricTotal = garments.reduce((acc, g) => acc + (Number(g.fabricAmount) || 0), 0);

    // 2. Calculate Stitching
    const stitchingBase = stitchingBaseOverride ?? stitchingAdult;

    const stitchingTotal = garments.reduce((acc, g) => {
      const price = g.style === "design" ? stitchingBase : stitchingBase;
      return acc + price;
    }, 0);

    // 3. Calculate Style (sum of style extras from styles table)
    const styleTotal = garments.reduce((acc, g) => {
        return acc + calculateGarmentStylePrice(g, styles);
    }, 0);

    // 4. Delivery
    const deliveryCharge = homeDelivery ? getPrice('HOME_DELIVERY') : 0;
    const expressCharge = expressCount > 0 ? expressCount * getPrice('EXPRESS_SURCHARGE') : 0;

    // 5. Shelf
    const shelfTotal = shelfItems.reduce((acc, p) => acc + ((Number(p.unitPrice) || 0) * (Number(p.quantity) || 0)), 0);

    const subtotal = fabricTotal + stitchingTotal + styleTotal + deliveryCharge + expressCharge + shelfTotal;

    return {
      fabric: fabricTotal,
      stitching: stitchingTotal,
      style: styleTotal,
      delivery: deliveryCharge,
      express: expressCharge,
      shelf: shelfTotal,
      total: subtotal
    };
  };

  return { prices, styles, getPrice, stitchingAdult, stitchingChild, calculateOrderTotal, isLoading };
}
