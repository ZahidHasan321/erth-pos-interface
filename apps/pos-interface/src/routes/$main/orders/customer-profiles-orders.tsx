import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CustomerDemographicsForm } from '@/components/forms/customer-demographics/customer-demographics-form';
import {
    customerDemographicsSchema,
    customerDemographicsDefaults,
    type CustomerDemographicsSchema,
} from '@/components/forms/customer-demographics/demographics-form.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/$main/orders/customer-profiles-orders')({
    component: RouteComponent,
    head: () => ({
        meta: [{
            title: "Create Customer | Erth POS",
        }]
    }),
});

function RouteComponent() {
    const navigate = Route.useNavigate();
    const form = useForm<CustomerDemographicsSchema>({
        resolver: zodResolver(customerDemographicsSchema) as Resolver<CustomerDemographicsSchema>,
        defaultValues: customerDemographicsDefaults,
    });

    const handleClear = () => {
        form.reset(customerDemographicsDefaults);
    };

    const handleSave = async (data: Partial<CustomerDemographicsSchema>) => {
        // Here you would call your API to create the customer
        console.log('Customer saved:', data);
        // After successful save, we could navigate to the new customer's detail page
        // For now, just logging.
    };

    return (
        <div className="space-y-6 py-6 px-[5%] md:px-[10%] max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-4">
                <Button asChild variant="ghost" className="hover:bg-primary/10 text-primary gap-2 h-9 px-3">
                    <Link to="/$main/customers">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Customers
                    </Link>
                </Button>
            </div>

            <section className="w-full animate-in fade-in zoom-in-95 duration-300">
                <CustomerDemographicsForm
                    form={form}
                    onSave={handleSave}
                    onCancel={() => navigate({ to: '/$main/customers' })}
                    onClear={handleClear}
                    isOrderClosed={false}
                    initialIsEditing={true}
                    header="Create New Customer"
                    subheader="Enter customer details to create a new profile"
                />
            </section>
        </div>
    );
}
