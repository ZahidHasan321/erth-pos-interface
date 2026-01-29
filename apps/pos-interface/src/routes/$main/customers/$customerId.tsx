import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CustomerDemographicsForm } from '@/components/forms/customer-demographics/customer-demographics-form';
import { CustomerOrderHistory } from '@/components/forms/customer-demographics/customer-order-history';
import { mapCustomerToFormValues } from '@/components/forms/customer-demographics/demographics-form.mapper';
import {
    customerDemographicsSchema,
    customerDemographicsDefaults,
    type CustomerDemographicsSchema,
} from '@/components/forms/customer-demographics/demographics-form.schema';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Phone, MapPin, Users, User, Mail, MessageSquare, ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCustomer } from '@/hooks/use-customers';

export const Route = createFileRoute('/$main/customers/$customerId')({
    component: CustomerDetailComponent,
    head: () => ({
        meta: [{
            title: "Customer Profile | Erth POS",
        }]
    }),
});

function CustomerSummaryCard({ 
    customer, 
    onEdit 
}: { 
    customer: CustomerDemographicsSchema, 
    onEdit: () => void 
}) {
    return (
        <Card className="overflow-hidden border-primary/20 bg-linear-to-br from-card to-primary/5 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full">
                        <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-bold text-foreground">
                            {customer.name}
                        </CardTitle>
                        {customer.arabic_name && (
                            <p className="text-lg font-medium text-muted-foreground mt-1" dir="rtl">
                                {customer.arabic_name}
                            </p>
                        )}
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={onEdit} className="gap-2 border-primary/30 hover:bg-primary/10">
                    <Pencil className="h-4 w-4 text-primary" />
                    Edit Profile
                </Button>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-md bg-muted text-muted-foreground">
                            <Phone className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Mobile</p>
                            <p className="font-mono font-bold text-foreground">
                                {customer.country_code} {customer.phone}
                            </p>
                            {customer.whatsapp && (
                                <div className="flex items-center gap-1 mt-1">
                                    <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-green-600 uppercase">WhatsApp Active</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-md bg-muted text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Location</p>
                            <p className="font-bold text-foreground">
                                {customer.area || "N/A"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {customer.city || "No city specified"}
                            </p>
                            {customer.nationality && (
                                <p className="text-[10px] font-bold text-primary uppercase mt-1">
                                    {customer.nationality}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-md bg-muted text-muted-foreground">
                            <Users className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Account Type</p>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-sm",
                                    customer.account_type === 'Primary' 
                                        ? "bg-blue-50 text-blue-700 border-blue-200" 
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                )}>
                                    {customer.account_type}
                                </span>
                                {customer.relation && (
                                    <span className="text-xs text-muted-foreground font-medium italic">
                                        • {customer.relation}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-md bg-muted text-muted-foreground">
                            <Mail className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Email</p>
                            <p className="text-sm font-medium text-foreground truncate max-w-[150px]">
                                {customer.email || "No email provided"}
                            </p>
                        </div>
                    </div>
                </div>
                
                {customer.notes && (
                    <div className="mt-6 p-3 rounded-lg bg-muted/30 border border-border/50 flex gap-3">
                        <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Notes</p>
                            <p className="text-sm text-muted-foreground italic leading-relaxed">
                                "{customer.notes}"
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function CustomerDetailComponent() {
    const { customerId } = Route.useParams();
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    const { data: customerData, isLoading, isError } = useCustomer(parseInt(customerId));

    const form = useForm<CustomerDemographicsSchema>({
        resolver: zodResolver(customerDemographicsSchema) as Resolver<CustomerDemographicsSchema>,
        defaultValues: customerDemographicsDefaults,
    });

    const watchedCustomer = useWatch({
        control: form.control,
    }) as CustomerDemographicsSchema;

    useEffect(() => {
        if (customerData) {
            const formValues = mapCustomerToFormValues(customerData);
            form.reset(formValues);
        }
    }, [customerData, form]);

    const handleClear = () => {
        if (customerData) {
            form.reset(mapCustomerToFormValues(customerData));
        }
        setIsEditingProfile(false);
    };

    const handleSave = (data: Partial<CustomerDemographicsSchema>) => {
        console.log('Customer saved:', data);
        setIsEditingProfile(false);
        // Here you would typically invalidate the customer query to refetch updated data
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground font-medium">Loading customer profile...</p>
            </div>
        );
    }

    if (isError || !customerData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
                <div className="bg-destructive/10 p-4 rounded-full mb-4">
                    <User className="h-10 w-10 text-destructive" />
                </div>
                <h2 className="text-xl font-bold mb-2">Customer Not Found</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                    We couldn't find the customer you're looking for. It may have been deleted or the ID is incorrect.
                </p>
                <Button asChild>
                    <Link to="/$main/customers">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Customers
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 py-6 px-[5%] md:px-[10%] max-w-screen-2xl mx-auto">
            <div className="flex items-center justify-between">
                <Button asChild variant="ghost" className="hover:bg-primary/10 text-primary gap-2 h-9 px-3">
                    <Link to="/$main/customers">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Customer Directory
                    </Link>
                </Button>
            </div>

            {!isEditingProfile ? (
                <section className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
                    <CustomerSummaryCard 
                        customer={watchedCustomer} 
                        onEdit={() => setIsEditingProfile(true)} 
                    />
                </section>
            ) : (
                <section className="w-full animate-in fade-in zoom-in-95 duration-300">
                    <CustomerDemographicsForm
                        form={form}
                        onSave={handleSave}
                        onCancel={() => setIsEditingProfile(false)}
                        onClear={handleClear}
                        isOrderClosed={false}
                        initialIsEditing={true}
                        header="Edit Customer Profile"
                        subheader="Update personal information and contact details"
                    />
                </section>
            )}

            {!isEditingProfile && (
                <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CustomerOrderHistory customerId={parseInt(customerId)} />
                </section>
            )}
        </div>
    );
}
