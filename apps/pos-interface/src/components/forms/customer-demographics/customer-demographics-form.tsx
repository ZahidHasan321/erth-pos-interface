import { debounce, cn } from "@/lib/utils";
import { searchPrimaryAccountByPhone, updateCustomer, createCustomer } from "@/api/customers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DatePicker } from "@/components/ui/date-picker";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSortedCountries } from "@/lib/countries";
import type { Customer } from "@repo/database";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  customerDemographicsDefaults,
  customerDemographicsSchema,
  type CustomerDemographicsSchema,
} from "./demographics-form.schema";
import { mapCustomerToFormValues, mapFormValuesToCustomer } from "./demographics-form.mapper";
import { AnimatedMessage } from "@/components/animation/AnimatedMessage";
import WhatsappLogo from "@/assets/whatsapp.svg";

import { ErrorBoundary } from "@/components/global/error-boundary";
import { FlagIcon } from "@/components/ui/flag-icon";
import { Pencil, ArrowRight, X, Save, Check, Search, Users } from "lucide-react";
import { SearchCustomer } from "./search-customer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface CustomerDemographicsFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<CustomerDemographicsSchema, any, any>;
  onEdit?: () => void;
  onCancel?: () => void;
  onProceed?: () => void;
  onClear?: () => void;
  onSave?: (data: Partial<CustomerDemographicsSchema>) => void;
  onCustomerChange?: (customer: Customer) => void;
  isOrderClosed?: boolean;
  orderId?: number | null;
  header?: string;
  subheader?: string;
  proceedButtonText?: string;
}

export function CustomerDemographicsForm({
  form,
  onEdit,
  onCancel,
  onProceed,
  onClear,
  onSave,
  onCustomerChange,
  isOrderClosed,
  orderId,
  header = "Demographics",
  subheader = "Customer information and contact details",
  proceedButtonText = "Confirm Order",
}: CustomerDemographicsFormProps) {
  const [isEditing, setIsEditing] = useState(true);
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [confirmationDialog, setConfirmationDialog] = useState({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });
  const [warnings, setWarnings] = React.useState<{
    [K in keyof CustomerDemographicsSchema]?: string;
  }>({});

  const [AccountType, phone, id] = useWatch({
    control: form.control,
    name: ["account_type", "phone", "id"],
  });
  const countries = getSortedCountries();

  // When id changes (loaded or saved), set to readonly mode
  React.useEffect(() => {
    if (id) {
      setIsEditing(false);
    }
  }, [id]);

  const {
    data: existingUsers,
    isSuccess,
    refetch: accountRefetch,
    isFetching,
  } = useQuery({
    queryKey: ["existingUsers", phone],
    queryFn: async () => {
      return searchPrimaryAccountByPhone(phone);
    },
    enabled: false,
  });

  const debouncedRefetch = debounce(() => {
    accountRefetch();
  }, 500);

  function handleMobileChange(value: string) {
    if (value.trim() === "" || !isEditing) {
      setWarnings((prev) => ({ ...prev, phone: undefined }));
      form.setValue("account_type", undefined);
      return;
    }
    debouncedRefetch();
  }

  React.useEffect(() => {
    if (isSuccess && existingUsers) {
      const currentAccountType = form.getValues().account_type;
      if (
        existingUsers.data &&
        existingUsers.data.length > 0 &&
        existingUsers.count &&
        existingUsers.count > 0 &&
        existingUsers.data[0].id !== id
      ) {
        setWarnings((prev) => ({
          ...prev,
          phone:
            "This mobile number is already used in a Primary account. Proceed with caution.",
        }));
        if (currentAccountType !== "Secondary") {
          form.setValue("account_type", "Secondary");
        }
      } else {
        setWarnings((prev) => ({ ...prev, phone: undefined }));
        if (currentAccountType !== "Primary") {
          form.setValue("account_type", "Primary");
        }
      }
    }
  }, [existingUsers, isSuccess, phone, form, id]);

  React.useEffect(() => {
    if (AccountType === "Primary") {
      form.setValue("relation", undefined);
    }
  }, [AccountType, form]);

  const { mutate: createCustomerMutation, isPending: isCreating } = useMutation(
    {
      mutationFn: (customerToCreate: Partial<Customer>) =>
        createCustomer(customerToCreate),
      onSuccess: (response) => {
        if (response.status === "success" && response.data) {
          toast.success("Customer created successfully!");
          const createdCustomer = mapCustomerToFormValues(response.data);
          onSave?.(createdCustomer);
          form.reset(createdCustomer);
          setTimeout(() => {
            setIsEditing(false);
          }, 0);
        } else {
          toast.error(response.message || "Failed to create customer.");
        }
      },
      onError: () => {
        toast.error("Failed to create customer.");
      },
    }
  );

  const { mutate: updateCustomerMutation, isPending: isUpdating } = useMutation(
    {
      mutationFn: (customerToUpdate: {
        id: number;
        data: Partial<Customer>;
      }) => updateCustomer(customerToUpdate.id, customerToUpdate.data),
      onSuccess: (response) => {
        if (response.status === "success" && response.data) {
          toast.success("Customer updated successfully!");
          const customer = mapCustomerToFormValues(response.data);
          onSave?.(customer);
          form.reset(customer);
          setTimeout(() => {
            setIsEditing(false);
          }, 0);
        } else {
          toast.error(response.message || "Failed to update customer.");
        }
      },
      onError: () => {
        toast.error("Failed to update customer.");
      },
    }
  );

  const handleFormSubmit = (
    values: z.infer<typeof customerDemographicsSchema>
  ) => {
    const onConfirm = () => {
      const customerToSave = mapFormValuesToCustomer(values);
      if (id) {
        updateCustomerMutation({ data: customerToSave, id: id });
      } else {
        createCustomerMutation(customerToSave);
      }
      setConfirmationDialog({ ...confirmationDialog, isOpen: false });
    };

    setConfirmationDialog({
      isOpen: true,
      title: id ? "Update Customer" : "Create Customer",
      description: `Are you sure you want to ${
        id ? "update" : "create"
      } this customer?`,
      onConfirm,
    });
  };

  const handleEdit = () => {
    setConfirmationDialog({
      isOpen: true,
      title: "Confirm Edit",
      description: "Are you sure you want to edit this customer?",
      onConfirm: () => {
        setIsEditing(true);
        onEdit?.();
        setConfirmationDialog({ ...confirmationDialog, isOpen: false });
      },
    });
  };

  const handleCancelEdit = () => {
    setConfirmationDialog({
      isOpen: true,
      title: "Confirm Cancel",
      description:
        "Are you sure you want to cancel editing? Any unsaved changes will be lost.",
      onConfirm: () => {
        setIsEditing(false); // This will show the original customer data
        onCancel?.();
        setConfirmationDialog({ ...confirmationDialog, isOpen: false });
      },
    });
  };

  const handleCancelCreation = () => {
    setConfirmationDialog({
      isOpen: true,
      title: "Confirm Cancel",
      description:
        "Are you sure you want to cancel creating a new customer? The form will be cleared.",
      onConfirm: () => {
        form.reset(customerDemographicsDefaults);
        setWarnings({});
        onClear?.();
        setConfirmationDialog({ ...confirmationDialog, isOpen: false });
      },
    });
  };

  const isReadOnly = !isEditing;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="space-y-8 w-full"
      >
        <ConfirmationDialog
          isOpen={confirmationDialog.isOpen}
          onClose={() =>
            setConfirmationDialog({ ...confirmationDialog, isOpen: false })
          }
          onConfirm={confirmationDialog.onConfirm}
          title={confirmationDialog.title}
          description={confirmationDialog.description}
        />

        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground bg-linear-to-r from-primary to-secondary bg-clip-text">
                {header}
              </h1>
              {id && isOrderClosed && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 animate-in fade-in zoom-in duration-300">
                  <Check className="size-3 mr-1" />
                  Profile Loaded
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{subheader}</p>
          </div>
        </div>

        <div className={cn(
          "space-y-4 bg-card p-6 rounded-xl border border-border shadow-sm transition-colors duration-500",
          id && isReadOnly && "bg-blue-50/30 border-blue-100"
        )}>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-foreground">
              Basic Information
            </h3>
            {form.watch("id") && (
              <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm font-semibold text-primary">
                ID: {form.watch("id")}
              </span>
            )}
          </div>
          <ErrorBoundary fallback={<div>Name field crashed</div>}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">
                    <span className="text-destructive">*</span> Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter full name (e.g., Nasser Al-Sabah)"
                      {...field}
                      className="bg-background border-border/60"
                      readOnly={isReadOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ErrorBoundary>
          <ErrorBoundary fallback={<div>Arabic name field crashed</div>}>
            <FormField
              control={form.control}
              name="arabic_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Arabic Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="أدخل الاسم بالعربي"
                      {...field}
                      className="bg-background border-border/60"
                      readOnly={isReadOnly}
                      dir="rtl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ErrorBoundary>
          <ErrorBoundary fallback={<div>Email field crashed</div>}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">E-mail</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter email (e.g., nasser@erth.com)"
                      {...field}
                      className="bg-background border-border/60"
                      readOnly={isReadOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ErrorBoundary>
          <ErrorBoundary fallback={<div>Mobile number crashed</div>}>
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">
                    <span className="text-destructive">*</span> Mobile No
                  </FormLabel>
                  <div className="flex flex-col md:flex-row gap-2">
                    <FormField
                      control={form.control}
                      name="country_code"
                      disabled={isReadOnly}
                      render={({ field }) => (
                        <FormItem className="min-w-42">
                          <Combobox
                            disabled={isReadOnly}
                            options={countries.map((country) => ({
                              value: country.phoneCode,
                              label: `${country.name} ${country.phoneCode}`,
                              node: (
                                <span className="flex items-center gap-2">
                                  <FlagIcon code={country.code} />
                                  {country.name} {country.phoneCode}
                                </span>
                              ),
                            }))}
                            value={field.value || ""}
                            onChange={field.onChange}
                            placeholder="Code"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormControl>
                      <Input
                        placeholder="Enter mobile number"
                        {...field}
                        className="bg-background border-border/60"
                        readOnly={isReadOnly}
                        onChange={(e) => {
                          field.onChange(e);
                          handleMobileChange(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormField
                      control={form.control}
                      name="whatsapp"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="bg-background border-border/60"
                              disabled={isReadOnly}
                            />
                          </FormControl>
                          <FormLabel>
                            <img
                              src={WhatsappLogo}
                              alt="WhatsApp"
                              className="min-w-8"
                            />
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormMessage />

                  <AnimatedMessage
                    info={
                      isFetching ? "Checking existing accounts..." : undefined
                    }
                    warning={
                      warnings.phone &&
                      !isFetching &&
                      existingUsers?.count &&
                      existingUsers.count > 0
                        ? warnings.phone
                        : undefined
                    }
                  />
                </FormItem>
              )}
            />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={<div>Alternative mobile number crashed</div>}
          >
            <FormField
              control={form.control}
              name="alternate_mobile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">
                    Alternative Mobile No
                  </FormLabel>
                  <div className="flex flex-col md:flex-row gap-2">
                    <FormField
                      control={form.control}
                      name="alternative_country_code"
                      render={({ field }) => (
                        <FormItem className="min-w-42">
                          <Combobox
                            disabled={isReadOnly}
                            options={countries.map((country) => ({
                              value: country.phoneCode,
                              label: `${country.name} ${country.phoneCode}`,
                              node: (
                                <span className="flex items-center gap-2">
                                  <FlagIcon code={country.code} />
                                  {country.name} {country.phoneCode}
                                </span>
                              ),
                            }))}
                            value={field.value || ""}
                            onChange={field.onChange}
                            placeholder="Code"
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormControl>
                      <Input
                        placeholder="Enter alternative mobile number"
                        {...field}
                        className="bg-background border-border/60"
                        readOnly={isReadOnly}
                      />
                    </FormControl>
                    <FormField
                      control={form.control}
                      name="whatsapp_alt"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="bg-background border-border/60"
                              disabled={isReadOnly}
                            />
                          </FormControl>
                          <FormLabel>
                            <img
                              src={WhatsappLogo}
                              alt="WhatsApp"
                              className="min-w-8"
                            />
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ErrorBoundary>
        </div>

        <div className={cn(
          "space-y-4 bg-card p-6 rounded-xl border border-border shadow-sm transition-colors duration-500",
          id && isReadOnly && "bg-blue-50/30 border-blue-100"
        )}>
          <h3 className="text-lg font-semibold text-foreground">
            Personal Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ErrorBoundary fallback={<div>Note crashed</div>}>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Note</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any notes about the customer"
                        {...field}
                        value={field.value || ""}
                        className="bg-background border-border/60"
                        readOnly={isReadOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ErrorBoundary>
            <ErrorBoundary fallback={<div>Arabic nickname crashed</div>}>
              <FormField
                control={form.control}
                name="arabic_nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">
                      Arabic Nickname
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="أدخل الكنية بالعربي"
                        {...field}
                        className="bg-background border-border/60"
                        readOnly={isReadOnly}
                        dir="rtl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ErrorBoundary>
            <ErrorBoundary fallback={<div>Nationality crashed</div>}>
              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="font-semibold">
                      <span className="text-destructive">*</span> Nationality
                    </FormLabel>
                    <Combobox
                      disabled={isReadOnly}
                      options={countries.map((country) => ({
                        value: country.name,
                        label: country.name,
                        node: (
                          <span className="flex items-center gap-2">
                            <FlagIcon code={country.code} />
                            {country.name}
                          </span>
                        ),
                      }))}
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder="Select nationality"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ErrorBoundary>
            <ErrorBoundary fallback={<div>Instagram crashed</div>}>
              <FormField
                control={form.control}
                name="insta_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Instagram ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter Instagram handle (e.g., @erth)"
                        {...field}
                        className="bg-background border-border/60"
                        readOnly={isReadOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ErrorBoundary>
            <ErrorBoundary fallback={<div>DOB crashed</div>}>
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">DOB</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isReadOnly}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ErrorBoundary>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ErrorBoundary fallback={<div>Account Info crashed</div>}>
            <section className={cn(
              "flex flex-col rounded-xl bg-card p-6 gap-4 border border-border shadow-sm transition-colors duration-500",
              id && isReadOnly && "bg-blue-50/30 border-blue-100"
            )}>
              <h3 className="text-base font-semibold text-foreground">
                Account Information
              </h3>
              <FormField
                control={form.control}
                name="account_type"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="font-medium">Account Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={true}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background border-border/60">
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Primary">Primary</SelectItem>
                        <SelectItem value="Secondary">Secondary</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="relation"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel
                      className={
                        AccountType === "Secondary"
                          ? "font-semibold"
                          : "font-medium"
                      }
                    >
                      {AccountType === "Secondary" && (
                        <span className="text-destructive">*</span>
                      )}{" "}
                      Account Relation
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                      disabled={isReadOnly || AccountType !== "Secondary"}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background border-border/60">
                          <SelectValue
                            placeholder={
                              AccountType === "Primary"
                                ? "Account is primary"
                                : "Select account type"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Son">Son</SelectItem>
                        <SelectItem value="Father">Father</SelectItem>
                        <SelectItem value="Cousin">Cousin</SelectItem>
                        <SelectItem value="Brother">Brother</SelectItem>
                        <SelectItem value="Grandfather">Grandfather</SelectItem>
                        <SelectItem value="Grandson">Grandson</SelectItem>
                        <SelectItem value="Nephew">Nephew</SelectItem>
                        <SelectItem value="Friend">Friend</SelectItem>
                        <SelectItem value="Others">Others</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <section className={cn(
              "space-y-4 bg-card p-6 rounded-xl border border-border shadow-sm transition-colors duration-500",
              id && isReadOnly && "bg-blue-50/30 border-blue-100"
            )}>
              <h3 className="text-base font-semibold text-foreground">
                Customer Details
              </h3>
              <FormField
                control={form.control}
                name="customer_segment"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="font-medium">
                      Customer Segment
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isReadOnly}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background border-border/60">
                          <SelectValue placeholder="Select customer segment" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>
          </ErrorBoundary>
        </div>
        <div className={cn(
          "bg-card p-6 rounded-xl space-y-4 border border-border shadow-sm transition-colors duration-500",
          id && isReadOnly && "bg-blue-50/30 border-blue-100"
        )}>
          <ErrorBoundary fallback={<div>Address fields crashed</div>}>
            <h3 className="text-lg font-semibold text-foreground">Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">City</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter city name"
                          {...field}
                          value={field.value || ""}
                          className="bg-background border-border/60"
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Area</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter area or locality"
                          {...field}
                          value={field.value || ""}
                          className="bg-background border-border/60"
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="block"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Block</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter block number/name"
                          {...field}
                          value={field.value || ""}
                          className="bg-background border-border/60"
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">Street</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter street name"
                          {...field}
                          value={field.value || ""}
                          className="bg-background border-border/60"
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="house_no"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">
                        House / Building no.
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter house or building number"
                          {...field}
                          value={field.value || ""}
                          className="bg-background border-border/60"
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="address_note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-medium">
                        Address Note
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any address details or delivery instructions"
                          {...field}
                          value={field.value || ""}
                          className="bg-background border-border/60"
                          readOnly={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </ErrorBoundary>
        </div>

        <div className="flex gap-4 justify-end">
          <ErrorBoundary fallback={<div>Action buttons crashed</div>}>
            {/* Customer loaded, not editing */}
                        {!isEditing && id && !isOrderClosed && (
                          <>
                            <Button type="button" variant="secondary" onClick={handleEdit}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit Customer
                            </Button>
                            
                            {orderId ? (
                              <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsSearchDialogOpen(true)}
                                className="border-primary/20 text-primary hover:bg-primary/5"
                              >
                                <Users className="w-4 h-4 mr-2" />
                                Change Customer
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                onClick={onProceed}
                                disabled={!id}
                              >
                                {proceedButtonText}
                                <Check className="w-4 h-4 ml-2" />
                              </Button>
                            )}
                          </>
                        )}
                                                        {/* Editing an existing customer */}
                                            {!isReadOnly && isEditing && id && (
                                              <>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  onClick={handleCancelEdit}
                                                >
                                                  <X className="w-4 h-4 mr-2" />
                                                  Cancel
                                                </Button>
                                                <Button type="submit" disabled={isUpdating}>
                                                  <Save className="w-4 h-4 mr-2" />
                                                  {isUpdating ? "Saving..." : "Save Changes"}
                                                </Button>
                                              </>
                                            )}
                                    
                                            {/* Creating a new customer */}
                                            {isEditing && !id && !isOrderClosed && (
                                              <>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  onClick={handleCancelCreation}
                                                >
                                                  <X className="w-4 h-4 mr-2" />
                                                  Cancel
                                                </Button>
                                                <Button type="submit" disabled={isCreating}>
                                                  <Check className="w-4 h-4 mr-2" />
                                                  {isCreating ? "Creating..." : "Create Customer"}
                                                </Button>
                                              </>
                                            )}
                                          </ErrorBoundary>
                                        </div>
                                    
                                        <Dialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen}>
                                          <DialogContent className="max-w-3xl p-0 overflow-visible border-none shadow-2xl">
                                            <DialogHeader className="p-6 pb-0">
                                              <DialogTitle className="text-2xl font-bold">Change Customer</DialogTitle>
                                              <DialogDescription>
                                                Search and select a new customer for this order. This will replace the current customer.
                                              </DialogDescription>
                                            </DialogHeader>
                                            <div className="p-6 pt-4">
                                                  <SearchCustomer 
                onCustomerFound={(customer) => {
                  onCustomerChange?.(customer);
                  setIsSearchDialogOpen(false);
                }}
                onHandleClear={() => {}}
                checkPendingOrders={false}
              />
            </div>
          </DialogContent>
        </Dialog>
      </form>
    </Form>
  );
}
