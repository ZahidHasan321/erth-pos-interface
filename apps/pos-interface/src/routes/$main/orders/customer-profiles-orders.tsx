import { createFileRoute } from '@tanstack/react-router';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CustomerDemographicsForm } from '@/components/forms/customer-demographics/customer-demographics-form';
import { SearchCustomer } from '@/components/forms/customer-demographics/search-customer';
import { CustomerOrderHistory } from '@/components/forms/customer-demographics/customer-order-history';
import { mapCustomerToFormValues } from '@/components/forms/customer-demographics/demographics-form.mapper';
import {
  customerDemographicsSchema,
  customerDemographicsDefaults,
  type CustomerDemographicsSchema,
} from '@/components/forms/customer-demographics/demographics-form.schema';
import type { Customer } from '@repo/database';
import { useWatch } from 'react-hook-form';

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

  const customerId = useWatch({
    control: form.control,
    name: 'id'
  });

  const handleCustomerFound = (customer: Customer) => {
    const formValues = mapCustomerToFormValues(customer);
    form.reset(formValues);
  };

  const handleClear = () => {
    form.reset(customerDemographicsDefaults);
  };

  const handleSave = (data: Partial<CustomerDemographicsSchema>) => {
    console.log('Customer saved:', data);
  };

  return (
    <div className="space-y-16 py-10 px-[5%] md:px-[10%] max-w-screen-2xl mx-auto">
      <section className="w-full">
        <SearchCustomer 
          onCustomerFound={handleCustomerFound}
          onHandleClear={handleClear}
          checkPendingOrders={false}
        />
      </section>

      <section className="w-full">
        <CustomerDemographicsForm
          form={form}
          onSave={handleSave}
          onClear={handleClear}
          isOrderClosed={false}
          header="Customer Profile"
          subheader="Manage personal information, contact details, and addresses"
        />
      </section>

      {customerId && (
        <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CustomerOrderHistory customerId={customerId} />
        </section>
      )}
    </div>
  );
}
