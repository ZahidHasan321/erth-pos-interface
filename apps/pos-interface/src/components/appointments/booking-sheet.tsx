import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Button } from "@repo/ui/button";
import { Combobox } from "@repo/ui/combobox";
import { Calendar } from "@repo/ui/calendar";
import { TimePicker } from "./time-picker";
import { FlagIcon } from "@repo/ui/flag-icon";
import { useCreateAppointment, useUpdateAppointment, useBrandEmployees } from "@/hooks/useAppointments";
import { fuzzySearchCustomers, createCustomer } from "@/api/customers";
import { getSortedCountries } from "@/lib/countries";
import type { Customer } from "@repo/database";
import type { AppointmentWithRelations } from "@/api/appointments";
import { Phone, User, X, UserPlus, MapPin, Check, Users, Shirt } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const INPUT_CLS = "bg-background border-border";

const bookingSchema = z.object({
  customer_name: z.string().min(1, "Name is required"),
  customer_phone: z.string().min(1, "Phone is required"),
  country_code: z.string().min(1, "Country code is required"),
  customer_id: z.number().nullable(),
  appointment_date: z.date({ message: "Date is required" }),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
  assigned_to: z.string().min(1, "Must assign an employee"),
  city: z.string().optional(),
  block: z.string().optional(),
  street: z.string().optional(),
  house_no: z.string().optional(),
  area: z.string().optional(),
  address_note: z.string().optional(),
  notes: z.string().optional(),
  people_count: z.coerce.number().int().min(1).optional(),
  estimated_pieces: z.coerce.number().int().min(1).optional(),
  fabric_type: z.string().optional(),
}).refine((data) => data.end_time > data.start_time, {
  message: "End time must be after start time",
  path: ["end_time"],
});

type BookingFormValues = z.infer<typeof bookingSchema>;

interface BookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultStartTime?: string;
  editingAppointment?: AppointmentWithRelations | null;
  bookedByUserId: string;
}

const NEW_DEFAULTS = {
  customer_name: "",
  customer_phone: "",
  country_code: "+965",
  customer_id: null as number | null,
  assigned_to: "",
  city: "",
  block: "",
  street: "",
  house_no: "",
  area: "",
  address_note: "",
  notes: "",
  people_count: undefined as number | undefined,
  estimated_pieces: undefined as number | undefined,
  fabric_type: "",
};

export function BookingSheet({
  open,
  onOpenChange,
  defaultDate,
  defaultStartTime,
  editingAppointment,
  bookedByUserId,
}: BookingSheetProps) {
  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const { data: employees = [] } = useBrandEmployees();

  // Phone-first customer lookup
  const [phoneQuery, setPhoneQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Pick<Customer, "id" | "name" | "phone" | "area"> | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  const countries = useMemo(() => getSortedCountries(), []);
  const countryOptions = useMemo(
    () =>
      countries.map((c) => ({
        value: c.phoneCode,
        label: `${c.name} ${c.phoneCode}`,
        node: (
          <span className="flex items-center gap-2">
            <FlagIcon code={c.code} />
            <span>{c.name}</span>
            <span className="text-muted-foreground ml-auto">{c.phoneCode}</span>
          </span>
        ),
        selectedNode: (
          <span className="flex items-center gap-1.5">
            <FlagIcon code={c.code} />
            <span className="text-xs">{c.phoneCode}</span>
          </span>
        ),
      })),
    [countries],
  );

  const isEditing = !!editingAppointment;

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema) as never,
    defaultValues: {
      ...NEW_DEFAULTS,
      appointment_date: defaultDate ?? new Date(),
      start_time: defaultStartTime ?? "09:00",
      end_time: defaultStartTime ? incrementTime(defaultStartTime) : "10:00",
    },
  });

  useEffect(() => {
    if (open) {
      setPhoneQuery("");
      setCustomerResults([]);
      setIsNewCustomer(false);

      if (editingAppointment) {
        setSelectedCustomer(
          editingAppointment.customer_id
            ? { id: editingAppointment.customer_id, name: editingAppointment.customer_name, phone: editingAppointment.customer_phone, area: editingAppointment.area ?? null }
            : null,
        );
        form.reset({
          customer_name: editingAppointment.customer_name,
          customer_phone: editingAppointment.customer_phone,
          country_code: editingAppointment.customer?.country_code ?? "+965",
          customer_id: editingAppointment.customer_id ?? null,
          appointment_date: new Date(editingAppointment.appointment_date + "T00:00:00"),
          start_time: editingAppointment.start_time,
          end_time: editingAppointment.end_time,
          assigned_to: editingAppointment.assigned_to,
          city: editingAppointment.city ?? "",
          block: editingAppointment.block ?? "",
          street: editingAppointment.street ?? "",
          house_no: editingAppointment.house_no ?? "",
          area: editingAppointment.area ?? "",
          address_note: editingAppointment.address_note ?? "",
          notes: editingAppointment.notes ?? "",
          people_count: editingAppointment.people_count ?? undefined,
          estimated_pieces: editingAppointment.estimated_pieces ?? undefined,
          fabric_type: editingAppointment.fabric_type ?? "",
        });
      } else {
        setSelectedCustomer(null);
        form.reset({
          ...NEW_DEFAULTS,
          appointment_date: defaultDate ?? new Date(),
          start_time: defaultStartTime ?? "09:00",
          end_time: defaultStartTime ? incrementTime(defaultStartTime) : "10:00",
        });
      }
    }
  }, [open, editingAppointment, defaultDate, defaultStartTime]);

  // Debounced phone search
  useEffect(() => {
    if (selectedCustomer) return;
    if (phoneQuery.length < 3) {
      setCustomerResults([]);
      setIsNewCustomer(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const res = await fuzzySearchCustomers(phoneQuery);
      if (res.status === "success" && res.data) {
        setCustomerResults(res.data);
        setIsNewCustomer(res.data.length === 0);
      }
      setIsSearching(false);
    }, 300);
    return () => {
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [phoneQuery, selectedCustomer]);

  function selectCustomer(customer: Customer) {
    setSelectedCustomer({ id: customer.id, name: customer.name, phone: customer.phone, area: customer.area ?? null });
    form.setValue("customer_id", customer.id);
    form.setValue("customer_name", customer.name);
    form.setValue("customer_phone", customer.phone ?? "");
    form.setValue("country_code", customer.country_code ?? "+965");
    form.setValue("city", customer.city ?? "");
    form.setValue("block", customer.block ?? "");
    form.setValue("street", customer.street ?? "");
    form.setValue("house_no", customer.house_no ?? "");
    form.setValue("area", customer.area ?? "");
    form.setValue("address_note", customer.address_note ?? "");
    setCustomerResults([]);
    setPhoneQuery("");
    setIsNewCustomer(false);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setIsNewCustomer(false);
    setPhoneQuery("");
    form.setValue("customer_id", null);
    form.setValue("customer_name", "");
    form.setValue("customer_phone", "");
    form.setValue("country_code", "+965");
    form.setValue("city", "");
    form.setValue("block", "");
    form.setValue("street", "");
    form.setValue("house_no", "");
    form.setValue("area", "");
    form.setValue("address_note", "");
  }

  function handlePhoneChange(value: string) {
    setPhoneQuery(value);
    form.setValue("customer_phone", value);
  }

  async function onSubmit(values: BookingFormValues) {
    let customerId = values.customer_id;

    if (!customerId && !isEditing) {
      const customerRes = await createCustomer({
        name: values.customer_name,
        phone: values.customer_phone,
        country_code: values.country_code,
        city: values.city || undefined,
        block: values.block || undefined,
        street: values.street || undefined,
        house_no: values.house_no || undefined,
        area: values.area || undefined,
        address_note: values.address_note || undefined,
      });
      if (customerRes.status === "error") {
        toast.error(customerRes.message ?? "Failed to create customer");
        return;
      }
      customerId = customerRes.data!.id;
    }

    const payload = {
      customer_name: values.customer_name,
      customer_phone: values.customer_phone,
      customer_id: customerId,
      appointment_date: format(values.appointment_date, "yyyy-MM-dd"),
      start_time: values.start_time,
      end_time: values.end_time,
      assigned_to: values.assigned_to,
      booked_by: bookedByUserId,
      city: values.city || null,
      block: values.block || null,
      street: values.street || null,
      house_no: values.house_no || null,
      area: values.area || null,
      address_note: values.address_note || null,
      notes: values.notes || null,
      people_count: values.people_count ?? null,
      estimated_pieces: values.estimated_pieces ?? null,
      fabric_type: (values.fabric_type || null) as "summer" | "winter" | null,
    };

    if (isEditing) {
      const res = await updateMutation.mutateAsync({
        id: editingAppointment!.id,
        updates: payload,
      });
      if (res.status === "success") {
        onOpenChange(false);
      } else {
        toast.error(res.message ?? "Failed to update");
      }
    } else {
      const res = await createMutation.mutateAsync(payload);
      if (res.status === "success") {
        onOpenChange(false);
      } else {
        toast.error(res.message ?? "Failed to book");
      }
    }
  }

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.name,
  }));

  const isPending = createMutation.isPending || updateMutation.isPending;
  const appointmentDate = form.watch("appointment_date");
  const errors = form.formState.errors;

  // Show new customer fields when phone entered but no match, OR when there are validation errors
  const showNewCustomerFields = !selectedCustomer && (
    (isNewCustomer && phoneQuery.length >= 3) ||
    !!errors.customer_name ||
    !!errors.customer_phone
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-5xl w-full h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)] max-h-none flex flex-col p-0 gap-0"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0 bg-muted/30">
          <DialogHeader className="p-0">
            <DialogTitle className="text-base">
              {isEditing ? "Edit Appointment" : "New Appointment"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={form.handleSubmit(onSubmit)}
              disabled={isPending}
            >
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update"
                  : selectedCustomer
                    ? "Book Appointment"
                    : "Create Customer & Book"}
            </Button>
          </div>
        </div>

        {/* Body — two columns */}
        <Form {...form}>
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Left — Customer + Address + Notes */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 md:border-r md:max-w-xl">

              {/* Customer — Phone-first flow */}
              <section className="space-y-3">
                <SectionLabel>
                  <Phone className="h-3.5 w-3.5" />
                  Customer
                </SectionLabel>

                {selectedCustomer ? (
                  /* Selected customer card */
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{selectedCustomer.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {selectedCustomer.phone}
                        {selectedCustomer.area && ` — ${selectedCustomer.area}`}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={clearCustomer}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {/* Phone input with country code */}
                    <FormField
                      control={form.control}
                      name="customer_phone"
                      render={() => (
                        <FormItem>
                          <FormLabel className="font-semibold">
                            <span className="text-destructive">*</span> Mobile Number
                          </FormLabel>
                          <div className="flex gap-2">
                            <FormField
                              control={form.control}
                              name="country_code"
                              render={({ field }) => (
                                <FormItem className="w-[130px] shrink-0">
                                  <Combobox
                                    options={countryOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Code"
                                    className="border-border"
                                  />
                                </FormItem>
                              )}
                            />
                            <div className="flex-1 relative">
                              <Input
                                placeholder="Enter phone number..."
                                value={phoneQuery}
                                onChange={(e) => handlePhoneChange(e.target.value)}
                                className={cn(INPUT_CLS, errors.customer_phone && "border-destructive ring-1 ring-destructive/20")}
                                autoFocus={!isEditing}
                              />
                              {isSearching && (
                                <div className="absolute right-2.5 top-2.5">
                                  <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                </div>
                              )}
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Search results */}
                    <AnimatePresence>
                      {customerResults.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border rounded-md max-h-44 overflow-y-auto bg-background shadow-sm divide-y">
                            {customerResults.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => selectCustomer(c)}
                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 flex items-center gap-2.5 transition-colors"
                              >
                                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted shrink-0">
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium">{c.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {c.phone && <span>{c.phone}</span>}
                                    {c.area && <span className="ml-1.5">· {c.area}</span>}
                                  </div>
                                </div>
                                <Check className="h-4 w-4 text-muted-foreground/30" />
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* New customer indicator + name field */}
                    <AnimatePresence>
                      {showNewCustomerFields && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden space-y-3"
                        >
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-0.5">
                            <UserPlus className="h-3.5 w-3.5" />
                            New customer — enter their name below
                          </div>

                          <FormField
                            control={form.control}
                            name="customer_name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="font-semibold">
                                  <span className="text-destructive">*</span> Name
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="Customer name" {...field} className={cn(INPUT_CLS, errors.customer_name && "border-destructive ring-1 ring-destructive/20")} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </section>

              {/* Address */}
              <section className="space-y-3">
                <SectionLabel>
                  <MapPin className="h-3.5 w-3.5" />
                  Visit Address
                </SectionLabel>
                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="area"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Area</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Salmiya" {...field} className={INPUT_CLS} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">City</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Kuwait City" {...field} className={INPUT_CLS} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <FormField
                    control={form.control}
                    name="block"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Block</FormLabel>
                        <FormControl>
                          <Input placeholder="Block" {...field} className={INPUT_CLS} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Street</FormLabel>
                        <FormControl>
                          <Input placeholder="Street" {...field} className={INPUT_CLS} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="house_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">House No.</FormLabel>
                        <FormControl>
                          <Input placeholder="House" {...field} className={INPUT_CLS} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address_note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Directions / Notes</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Blue gate, 2nd floor" {...field} className={INPUT_CLS} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </section>

              {/* Notes */}
              <section className="space-y-3">
                <SectionLabel>Notes</SectionLabel>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder="Any notes about this visit..."
                          className={`min-h-[70px] ${INPUT_CLS}`}
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </section>
            </div>

            {/* Right — Schedule + Assignment */}
            <div className="md:w-[270px] shrink-0 overflow-y-auto p-4 sm:p-5 space-y-5 bg-muted/10 border-t md:border-t-0">
              {/* Date */}
              <section className="space-y-2">
                <SectionLabel>Date</SectionLabel>
                <FormField
                  control={form.control}
                  name="appointment_date"
                  render={({ field }) => (
                    <FormItem>
                      <div className="border rounded-lg bg-background">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => date && field.onChange(date)}
                          weekStartsOn={6}
                          defaultMonth={field.value}
                          disabled={{ before: new Date() }}
                          className="[--cell-size:--spacing(8)]"
                        />
                      </div>
                      <div className="text-xs text-center font-medium text-muted-foreground pt-1">
                        {format(appointmentDate, "EEEE, d MMMM yyyy")}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* Time */}
              <section className="space-y-2">
                <SectionLabel>Time</SectionLabel>
                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="start_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">From</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={field.value}
                            onChange={(val) => {
                              field.onChange(val);
                              const currentEnd = form.getValues("end_time");
                              const newEnd = incrementTime(val);
                              if (currentEnd <= val) {
                                form.setValue("end_time", newEnd);
                              }
                            }}
                            className={cn("border-border", errors.start_time && "border-destructive ring-1 ring-destructive/20")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">To</FormLabel>
                        <FormControl>
                          <TimePicker value={field.value} onChange={field.onChange} className={cn("border-border", errors.end_time && "border-destructive ring-1 ring-destructive/20")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {/* Assign */}
              <section className="space-y-2">
                <SectionLabel>Assign To</SectionLabel>
                <FormField
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Combobox
                          options={employeeOptions}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select employee..."
                          className={cn("border-border", errors.assigned_to && "border-destructive ring-1 ring-destructive/20")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* Estimate */}
              <section className="space-y-2">
                <SectionLabel>
                  <Users className="h-3.5 w-3.5" />
                  Estimate
                </SectionLabel>
                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="people_count"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">People</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="—"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value))}
                            className={INPUT_CLS}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="estimated_pieces"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Pieces</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="—"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value))}
                            className={INPUT_CLS}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="fabric_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">
                        <Shirt className="h-3 w-3 inline mr-1" />
                        Fabric Type
                      </FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className={cn(INPUT_CLS, "w-full")}>
                            <SelectValue placeholder="Select fabric..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="summer">Summer</SelectItem>
                          <SelectItem value="winter">Winter</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            </div>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      {children}
    </h3>
  );
}

function incrementTime(time: string, hours = 1): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(h + hours, 22);
  return `${newH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
