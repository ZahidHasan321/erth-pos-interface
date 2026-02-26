"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomerMeasurementsForm } from "./customer-measurements-form";
import { 
  customerMeasurementsSchema, 
  customerMeasurementsDefaults, 
  type CustomerMeasurementsSchema 
} from "./measurement-form.schema";

interface CustomerMeasurementsStandaloneProps {
  customerId: number | null;
  hideHeader?: boolean;
}

export function CustomerMeasurementsStandalone({ 
  customerId, 
  hideHeader = false 
}: CustomerMeasurementsStandaloneProps) {
  const form = useForm<CustomerMeasurementsSchema>({
    resolver: zodResolver(customerMeasurementsSchema),
    defaultValues: customerMeasurementsDefaults,
  });

  if (!customerId) return null;

  return (
    <div className="w-full">
      <CustomerMeasurementsForm
        form={form}
        customerId={customerId}
        isOrderClosed={false}
        hideHeader={hideHeader}
      />
    </div>
  );
}
