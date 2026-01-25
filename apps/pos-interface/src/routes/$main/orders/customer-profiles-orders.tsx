import { createFileRoute } from '@tanstack/react-router';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CustomerDemographicsForm } from '@/components/forms/customer-demographics/customer-demographics-form';
import {
  customerDemographicsSchema,
  customerDemographicsDefaults,
  type CustomerDemographicsSchema,
} from '@/components/forms/customer-demographics/schema';

export const Route = createFileRoute('/$main/orders/customer-profiles-orders')({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Customer Profiles & Orders",
    }]
  }),
});

function RouteComponent() {
  const form = useForm<CustomerDemographicsSchema>({
    resolver: zodResolver(customerDemographicsSchema) as Resolver<CustomerDemographicsSchema>,
    defaultValues: customerDemographicsDefaults,
  });

  const handleSave = (data: Partial<CustomerDemographicsSchema>) => {
    console.log('Customer saved:', data);
    // You can add additional logic here after saving
  };

  const handleClear = () => {
    form.reset(customerDemographicsDefaults);
  };

  return (
    <div className="space-y-6 mx-20">
      <CustomerDemographicsForm
        form={form}
        onSave={handleSave}
        onClear={handleClear}
        isOrderClosed={false}
        header="Customer Profiles & Orders"
        subheader="Search, create, or update customer information and view their order history"
      />
    </div>
  );
}
