import { useQuery } from "@tanstack/react-query";
import { getPrices } from "../api/prices";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";

export interface Price {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export function usePricing() {
  const { data: pricesResponse, isLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: getPrices,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const prices = pricesResponse?.data as Price[] | undefined;

  // Helper to get price safely
  const getPrice = (key: string) => Number(prices?.find(p => p.key === key)?.value || 0);

  const calculateOrderTotal = (
    garments: any[], 
    shelfItems: any[], 
    homeDelivery: boolean, 
    express: boolean,
    stitchingBaseOverride?: number
  ) => {
    // 1. Calculate Fabric (sum of individual garment fabric prices)
    const fabricTotal = garments.reduce((acc, g) => acc + (Number(g.fabricAmount) || 0), 0);
    
    // 2. Calculate Stitching
    const stitchingBase = stitchingBaseOverride ?? (getPrice('STITCHING_STANDARD') || 9);
    
    const stitchingTotal = garments.reduce((acc, g) => {
      const price = g.style === "design" ? 9 : stitchingBase;
      return acc + price;
    }, 0);

    // 3. Calculate Style (sum of style extras)
    // Extra costs for specific style options (e.g. collars, cuffs)
    const styleTotal = garments.reduce((acc, g) => {
        return acc + calculateGarmentStylePrice(g, prices || []);
    }, 0);

    // 4. Delivery
    const deliveryCharge = homeDelivery ? getPrice('HOME_DELIVERY') : 0;
    const expressCharge = express ? getPrice('EXPRESS_SURCHARGE') : 0; 

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

  return { prices, getPrice, calculateOrderTotal, isLoading };
}
