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
import { Pencil, Phone, MapPin, Users, User, Mail, MessageSquare, ArrowLeft, Ruler } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCustomer } from '@/hooks/use-customers';
import { 
    Sheet, 
    SheetContent, 
    SheetHeader, 
    SheetTitle, 
    SheetDescription 
} from "@/components/ui/sheet";
import { CustomerMeasurementsStandalone } from "@/components/forms/customer-measurements";
import { ANIMATION_CLASSES } from "@/lib/constants/animations";

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
    onEdit,
    onShowMeasurements
}: { 
    customer: CustomerDemographicsSchema, 
    onEdit: () => void,
    onShowMeasurements: () => void
}) {
    return (
        <Card className={cn("overflow-hidden border-primary/20 bg-linear-to-br from-card to-primary/5 shadow-md", ANIMATION_CLASSES.fadeInUp)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full">
                        <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-bold text-foreground">
                            {customer.name}
                        </CardTitle>
                        {customer.arabic_name && (
                            <p className="text-lg font-medium text-muted-foreground mt-1" dir="rtl">
                                {customer.arabic_name}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onShowMeasurements} className="gap-2 border-secondary/30 hover:bg-secondary/10">
                        <Ruler className="h-4 w-4 text-secondary" />
                        Measurements
                    </Button>
                    <Button variant="outline" size="sm" onClick={onEdit} className="gap-2 border-primary/30 hover:bg-primary/10">
                        <Pencil className="h-4 w-4 text-primary" />
                        Edit Profile
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-md bg-muted text-muted-foreground">
                            <Phone className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Mobile</p>
                            <p className="font-mono font-bold text-foreground">
                                {customer.country_code} {customer.phone}
                            </p>
                            {customer.whatsapp && (
                                <div className="flex items-center gap-1 mt-1">
                                    <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-xs font-bold text-green-600 uppercase">WhatsApp Active</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-md bg-muted text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Location</p>
                            <p className="font-bold text-foreground">
                                {customer.area || "N/A"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {customer.city || "No city specified"}
                            </p>
                            {customer.nationality && (
                                <p className="text-xs font-bold text-primary uppercase mt-1">
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
                            <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Account Type</p>
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
                            <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Email</p>
                            <p className="text-sm font-medium text-foreground truncate max-w-[150px]">
                                {customer.email || "No email provided"}
                            </p>
                        </div>
                    </div>
                </div>
                
                {customer.notes && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/50 flex gap-3">
                        <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Notes</p>
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
    const [isSheetOpen, setIsSheetOpen] = useState(false);

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
            <div className="space-y-3 p-4 md:p-5 max-w-6xl mx-auto">
                <Skeleton className="h-9 w-48 rounded-lg" />
                <Card className="border-2 py-0 gap-0">
                    <CardContent className="p-3 space-y-4">
                        <div className="flex items-center gap-4">
                            <Skeleton className="size-10 rounded-full" />
                            <div className="space-y-2 flex-1">
                                <Skeleton className="h-6 w-48 rounded-md" />
                                <Skeleton className="h-4 w-32 rounded-md" />
                            </div>
                            <Skeleton className="h-9 w-24 rounded-lg" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="space-y-1.5">
                                    <Skeleton className="h-3 w-16 rounded-md" />
                                    <Skeleton className="h-5 w-28 rounded-md" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                <Skeleton className="h-64 rounded-2xl" />
            </div>
        );
    }

    if (isError || !customerData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
                <div className="bg-destructive/10 p-4 rounded-full mb-4">
                    <User className="h-10 w-10 text-destructive" />
                </div>
                <h2 className="text-base font-bold mb-2">Customer Not Found</h2>
                <p className="text-muted-foreground mb-3 max-w-md">
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
        <div className="space-y-3 p-4 md:p-5 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <Button asChild variant="ghost" className="hover:bg-primary/10 text-primary gap-2 h-9 px-3">
                    <Link to="/$main/customers">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Customer Directory
                    </Link>
                </Button>
            </div>

            {!isEditingProfile ? (
                <section className={cn("w-full", ANIMATION_CLASSES.fadeInUp)}>
                    <CustomerSummaryCard 
                        customer={watchedCustomer} 
                        onEdit={() => setIsEditingProfile(true)} 
                        onShowMeasurements={() => setIsSheetOpen(true)}
                    />
                </section>
            ) : (
                <section className={cn("w-full", ANIMATION_CLASSES.zoomIn)}>
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
                <section className={cn("w-full", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(1)}>
                    <CustomerOrderHistory customerId={parseInt(customerId)} />
                </section>
            )}

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="right" className="sm:max-w-4xl overflow-y-auto p-5">
                    <SheetHeader className="mb-4 p-0">
                        <SheetTitle className="text-xl font-black uppercase tracking-tighter">
                            <span className="text-primary block text-sm tracking-widest mb-1 opacity-70">Customer Measurements</span>
                            {watchedCustomer.name}
                        </SheetTitle>
                        <SheetDescription className="text-xs uppercase font-bold tracking-[0.2em] text-muted-foreground opacity-70">
                            manage and update body measurements for this profile
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-4">
                        <CustomerMeasurementsStandalone 
                            customerId={parseInt(customerId)} 
                            hideHeader={true}
                        />
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
