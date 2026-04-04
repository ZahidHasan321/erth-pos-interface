"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";


import { Button } from "@repo/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Combobox } from "@repo/ui/combobox";
import { GroupedMeasurementFields } from "./GroupedMeasurementFields";
import { MeasurementTable } from "./MeasurementTable";
import { useAutoNavigation } from "./useAutoNavigation";

import {
  customerMeasurementsDefaults,
  type CustomerMeasurementsSchema,
} from "./measurement-form.schema";

import {
  mapMeasurementToFormValues,
  mapFormValuesToMeasurement,
} from "./measurement-form.mapper";

import {
  createMeasurement,
  getMeasurementsByCustomerId,
  updateMeasurement,
} from "@/api/measurements";
import { getEmployees } from "@/api/employees";
import { toast } from "sonner";
import type { Measurement } from "@repo/database";
import { Pencil, X, Save, Plus, ArrowRight, RotateCcw } from "lucide-react";

// ---------------------------------------
// Type definitions
// ---------------------------------------
interface CustomerMeasurementsFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<CustomerMeasurementsSchema, any, any>;
  customerId: number | null;
  onProceed?: () => void;
  isOrderClosed: boolean;
  hideHeader?: boolean;
}

const unit = "in";

// ---------------------------------------
// Custom hook for auto provision updates
// ---------------------------------------
function useAutoProvision(form: UseFormReturn<CustomerMeasurementsSchema>) {
  // Armhole Provision
  const [armhole, armhole_front, armhole_provision] = useWatch({
    control: form.control,
    name: ["armhole", "armhole_front", "armhole_provision"],
  });

  React.useEffect(() => {
    if (armhole !== undefined && armhole_front !== undefined) {
      const val = armhole ?? 0;
      const front = armhole_front ?? 0;
      const newProvision = Math.max(0, front * 2 - val);
      if (armhole_provision !== newProvision) {
        form.setValue("armhole_provision", newProvision);
      }
    }
  }, [armhole, armhole_front, armhole_provision, form]);

  // Full Chest Provision
  const [chest_full, chest_front, chest_provision] = useWatch({
    control: form.control,
    name: [
      "chest_full",
      "chest_front",
      "chest_provision",
    ],
  });

  React.useEffect(() => {
    if (chest_full !== undefined && chest_front !== undefined) {
      const val = chest_full ?? 0;
      const front = chest_front ?? 0;
      const newProvision = Math.max(0, front * 2 - val);
      if (chest_provision !== newProvision) {
        form.setValue("chest_provision", newProvision);
      }
    }
  }, [chest_full, chest_front, chest_provision, form]);

  // Full Waist Provision
  const [waist_full, waist_front, waist_back, waist_provision] =
    useWatch({
      control: form.control,
      name: [
        "waist_full",
        "waist_front",
        "waist_back",
        "waist_provision",
      ],
    });

  React.useEffect(() => {
    if (
      waist_full !== undefined &&
      waist_front !== undefined &&
      waist_back !== undefined
    ) {
      const val = waist_full ?? 0;
      const front = waist_front ?? 0;
      const back = waist_back ?? 0;
      const newProvision = Math.max(
        0,
        front + back - val,
      );
      if (waist_provision !== newProvision) {
        form.setValue("waist_provision", newProvision);
      }
    }
  }, [waist_full, waist_front, waist_back, waist_provision, form]);
}

const SmallSpinner = () => (
  <div className="w-4 h-4 border-2 border-dashed rounded-full animate-spin border-primary" />
);

// ---------------------------------------
// Main Form Component
// ---------------------------------------
export function CustomerMeasurementsForm({
  form,
  customerId,
  onProceed,
  isOrderClosed,
  hideHeader = false,
}: CustomerMeasurementsFormProps) {
  const queryClient = useQueryClient();
  const [selectedMeasurementId, setSelectedMeasurementId] = React.useState<
    string | null
  >(null);
  const [measurements, setMeasurements] = React.useState<
    Map<string, CustomerMeasurementsSchema>
  >(new Map());
  const [isEditing, setIsEditing] = React.useState(false);
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [previousMeasurementId, setPreviousMeasurementId] = React.useState<
    string | null
  >(null);

  const [selectedReference, setSelectedReference] = React.useState<
    string | undefined
  >(form.getValues("reference") ?? undefined);
  useAutoProvision(form);

  // Track previous customerId to detect changes and reset internal state
  // Only track non-null IDs so transient null (from store reset) doesn't cause a reset cycle
  const prevCustomerIdRef = React.useRef<number | null>(customerId);
  // Track what query data we've already processed to avoid re-running the populate effect
  const lastProcessedDataRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Ignore transient null — only reset when we get a genuinely different customer
    if (customerId === null) return;
    if (customerId === prevCustomerIdRef.current) return;

    prevCustomerIdRef.current = customerId;
    lastProcessedDataRef.current = null;
    setSelectedMeasurementId(null);
    setMeasurements(new Map());
    setIsEditing(false);
    setIsCreatingNew(false);
    form.reset(customerMeasurementsDefaults);
  }, [customerId, form]);

  // Auto-navigation for electric tape
  const { getFieldRef, getEnterHandler, focusFirstField } = useAutoNavigation();

  // Auto-focus on first field when entering edit or create mode
  React.useEffect(() => {
    if (isEditing || isCreatingNew) {
      focusFirstField();
    }
  }, [isEditing, isCreatingNew, focusFirstField]);

  // Fetch employees data
  const { data: employeesResponse } = useQuery({
    queryKey: ["employees"],
    queryFn: getEmployees,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const employees = employeesResponse?.data || [];

  // For adding a *new* measurement (must be complete)
  const addMeasurement = (id: string, data: CustomerMeasurementsSchema) => {
    setMeasurements((prev) => {
      const updated = new Map(prev);
      updated.set(id, data);
      return updated;
    });
  };

  const removeMeasurement = (id: string) => {
    setMeasurements((prev): Map<string, CustomerMeasurementsSchema> => {
      if (!prev.has(id)) return prev;
      const updated = new Map<string, CustomerMeasurementsSchema>(prev);
      updated.delete(id);
      return updated;
    });
  };

  const { mutate: createMeasurementMutation, isPending: isCreating } =
    useMutation({
      mutationFn: createMeasurement,
      onSuccess: (response) => {
        if (response.status === "success") {
          setIsEditing(false);
          setIsCreatingNew(false);
          // Reset the processed data ref so the populate effect picks up new data
          lastProcessedDataRef.current = null;
          toast.success("Measurement created successfully!");
          queryClient.invalidateQueries({
            queryKey: ["measurements", customerId],
          });
        } else {
          toast.error(response.message || "Failed to create measurement.");
        }
      },
      onError: (e: Error) => {
        console.error("API Error:", e);
        toast.error("Error creating measurement.");
      },
    });

  const { mutate: updateMeasurementMutation, isPending: isUpdating } =
    useMutation({
      mutationFn: ({
        id,
        data,
      }: {
        id: string;
        data: Partial<Measurement>;
      }) => updateMeasurement(id, data),
      onSuccess: (response) => {
        if (response.status === "success") {
          setIsEditing(false);
          setIsCreatingNew(false);
          lastProcessedDataRef.current = null;
          toast.success("Measurement updated successfully!");
          queryClient.invalidateQueries({
            queryKey: ["measurements", customerId],
          });
        } else {
          toast.error(response.message || "Failed to update measurement.");
        }
      },
      onError: (e: Error) => {
        console.error("API Error:", e);
        toast.error("Error updating measurement.");
      },
    });

  const isSaving = isCreating || isUpdating;

  const {
    data: measurementQuery,
    isSuccess,
    isFetching,
  } = useQuery({
    queryKey: ["measurements", customerId],
    queryFn: () => {
      if (!customerId) {
        return Promise.resolve(null);
      }
      return getMeasurementsByCustomerId(customerId);
    },
    enabled: !!customerId,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Populate measurements when query data arrives
  React.useEffect(() => {
    if (!customerId || !isSuccess || isFetching) return;

    // Create a stable key from the data to detect actual changes
    const dataKey = JSON.stringify(measurementQuery?.data?.map(m => m.id) ?? []);
    if (dataKey === lastProcessedDataRef.current) return;
    lastProcessedDataRef.current = dataKey;

    if (measurementQuery?.data?.length) {
      const newMap = new Map<string, CustomerMeasurementsSchema>();
      measurementQuery.data.forEach((m) => {
        const displayId = m.measurement_id || m.id;
        if (displayId) {
          newMap.set(displayId, mapMeasurementToFormValues(m));
        }
      });
      setMeasurements(newMap);

      // Only auto-select if nothing is currently selected (or selection is invalid)
      if (!selectedMeasurementId || !newMap.has(selectedMeasurementId)) {
        const firstId = measurementQuery.data[0]?.measurement_id || measurementQuery.data[0]?.id || null;
        setSelectedMeasurementId(firstId);
      }
    } else {
      setMeasurements(new Map());
      setSelectedMeasurementId(null);
      form.reset(customerMeasurementsDefaults);
    }
  }, [customerId, isSuccess, isFetching, measurementQuery?.data, form, selectedMeasurementId]);

  // Reset form when selected measurement changes
  React.useEffect(() => {
    if (selectedMeasurementId && measurements.has(selectedMeasurementId)) {
      const selected = measurements.get(selectedMeasurementId);
      if (selected) {
        form.reset(selected);
        setSelectedReference(selected.reference ?? undefined);
      }
    } else if (!isCreatingNew) {
      form.reset(customerMeasurementsDefaults);
      setSelectedReference(undefined);
    }
  }, [selectedMeasurementId, measurements, form, isCreatingNew]);

  // ---------------------------------------
  // Handlers
  // ---------------------------------------
  const handleFormSubmit = (
    values: CustomerMeasurementsSchema,
  ) => {
    if (!customerId) {
      toast.error("Customer ID is required.");
      return;
    }

    const data = mapFormValuesToMeasurement(values, customerId);

    if (isCreatingNew) {
      // Remove the DB id for new measurements — let the server generate it
      delete (data as any).id;
      createMeasurementMutation(data);
    } else {
      if (!selectedMeasurementId) {
        toast.error("No measurement selected for updating.");
        return;
      }

      // Look up the actual DB UUID from the stored measurement data
      const storedMeasurement = measurements.get(selectedMeasurementId);
      const dbId = storedMeasurement?.id;
      if (!dbId) {
        toast.error("Cannot find measurement record for updating.");
        return;
      }
      updateMeasurementMutation({
        id: dbId,
        data: data,
      });
    }
  };

  const handleNewMeasurement = () => {
    setPreviousMeasurementId(selectedMeasurementId);

    // Generate the next measurement ID based on existing ones
    const existingIds = Array.from(measurements.keys());
    const nextNumber =
      existingIds
        .map((id) => {
          const parts = id.split("-");
          if (parts.length < 2) return 0;
          if (parts[0] !== String(customerId)) return 0;
          const num = parseInt(parts[parts.length - 1], 10);
          return isNaN(num) ? 0 : num;
        })
        .reduce((a, b) => Math.max(a, b), 0) + 1;

    const newId = `${customerId}-${nextNumber}`;

    // Take a snapshot of the current form values as the base for the copy
    const baseMeasurement = { ...form.getValues() };
    // Clear the DB id so it's treated as new, set the new display ID
    delete (baseMeasurement as any).id;
    baseMeasurement.measurement_id = newId;
    baseMeasurement.measurement_date = new Date().toISOString();

    addMeasurement(newId, baseMeasurement);
    setSelectedMeasurementId(newId);
    setIsCreatingNew(true);
    setIsEditing(true);
  };

  const handleClear = () => {
    const measurementIDTemp = selectedMeasurementId;
    form.reset(customerMeasurementsDefaults); // wipe the form
    form.setValue("measurement_id", measurementIDTemp || "");
    setSelectedMeasurementId(measurementIDTemp);
  };

  const handleCancel = () => {
    const wasCreatingNew = isCreatingNew;
    const currentMeasurementId = form.getValues("measurement_id");

    setIsEditing(false);
    setIsCreatingNew(false);

    if (wasCreatingNew && currentMeasurementId) {
      // Remove the temp measurement entry and restore previous selection
      removeMeasurement(currentMeasurementId);
      setSelectedMeasurementId(previousMeasurementId);
    } else if (
      selectedMeasurementId &&
      measurements.has(selectedMeasurementId)
    ) {
      // Revert to the saved version of the current measurement
      form.reset(measurements.get(selectedMeasurementId));
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit, (errors) => {
          console.error("Validation Errors:", errors);
          toast.error("Please check the form for errors.");
        })}
        className="space-y-4 w-full"
      >
        {!hideHeader && (
          <div className="flex justify-between items-start mb-2">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-foreground bg-linear-to-r from-primary to-secondary bg-clip-text">
                Measurement
              </h1>
              <p className="text-sm text-muted-foreground">
                Customer body measurements and details
              </p>
            </div>
          </div>
        )}

        {/* ---- Top Controls ---- */}
        <div className="flex flex-wrap justify-between items-start gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
          {/* Left side: all existing fields wrapped in one flex row */}
          <div className="flex flex-wrap justify-start gap-3">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">
                    Measurement Type
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ""}
                    disabled={!isEditing}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background border-border/60 w-auto min-w-24">
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Body">Body</SelectItem>
                      <SelectItem value="Dishdasha">Dishdasha</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="measurement_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Measurement ID</FormLabel>
                  <div className="flex items-center gap-2">
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value) setSelectedMeasurementId(value);
                      }}
                      value={field.value || ""}
                      disabled={!customerId || isCreatingNew || isFetching}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background border-border/60 w-auto min-w-24">
                          <SelectValue placeholder="Select ID" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from(measurements.keys()).map((id) => (
                          <SelectItem key={id} value={id}>
                            {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isFetching && <SmallSpinner />}
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Reference</FormLabel>
                  <div className="flex gap-2 items-center">
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedReference(value);
                      }}
                      value={field.value || ""}
                      disabled={!isEditing}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background border-border/60 w-auto min-w-24">
                          <SelectValue placeholder="Reference" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Winter">Winter</SelectItem>
                        <SelectItem value="Summer">Summer</SelectItem>
                        <SelectItem value="Eid">Eid</SelectItem>
                        <SelectItem value="Occasion">Occasion</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedReference === "Other" && (
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">
                      Reference Note
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter custom reference"
                        className="bg-background border-border/60 w-auto min-w-48"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={!isEditing}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="measurer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Measurer</FormLabel>
                  <FormControl>
                    <Combobox
                      options={employees.map((emp) => ({
                        value: emp.id,
                        label: emp.name,
                      }))}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Select measurer"
                      disabled={!isEditing}
                      className="w-auto min-w-48"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </div>

          {/* Right edge: top-level actions (Edit, New) */}
          <div className="flex items-center gap-3 self-end">
            {!isOrderClosed && !isEditing && !isCreatingNew && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditing(true)}
                disabled={!selectedMeasurementId}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}

            {!isEditing && !isOrderClosed && (
              <Button
                type="button"
                variant="outline"
                onClick={handleNewMeasurement}
                disabled={!customerId}
              >
                <Plus className="w-4 h-4 mr-2" />
                New
              </Button>
            )}
          </div>
        </div>
        {/* ---- Auto-Tape Measurements (sequence 1-18) ---- */}
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Auto Tape Measurements</h3>
          <MeasurementTable
            form={form}
            title="Chest & Shoulder"
            isDisabled={!isEditing}
            columns={[
              { name: "chest_full", label: "1. Full Chest" },
              { name: "shoulder", label: "2. Shoulder" },
              { name: "sleeve_length", label: "3. Sleeve Len" },
              { name: "sleeve_width", label: "4. Sleeve W" },
              { name: "elbow", label: "5. Elbow" },
              { name: "armhole_front", label: "6. Armhole F" },
              { name: "chest_upper", label: "7. Upper Chest" },
              { name: "chest_front", label: "8. Front Chest" },
              { name: "waist_front", label: "9. Front Waist" },
            ]}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          <MeasurementTable
            form={form}
            title="Waist, Collar & Back"
            isDisabled={!isEditing}
            columns={[
              { name: "top_pocket_distance", label: "10. Pocket Dist" },
              { name: "jabzour_length", label: "11. Jabzour Len" },
              { name: "length_front", label: "12. Front Len" },
              { name: "bottom", label: "13. Bottom" },
              { name: "collar_width", label: "14. Collar W" },
              { name: "collar_height", label: "15. Collar H" },
              { name: "chest_back", label: "16. Back Chest" },
              { name: "waist_back", label: "17. Back Waist" },
              { name: "length_back", label: "18. Back Len" },
            ]}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
        </div>

        {/* ---- Manual Measurements ---- */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Manual Measurements</h3>
          <MeasurementTable
            form={form}
            title="Armhole, Pockets & Jabzour"
            isDisabled={!isEditing}
            columns={[
              { name: "armhole", label: "Armhole Full" },
              { name: "waist_full", label: "Waist Full" },
              { name: "jabzour_width", label: "Jabzour W" },
              { name: "top_pocket_length", label: "Top Pkt Len" },
              { name: "top_pocket_width", label: "Top Pkt W" },
              { name: "side_pocket_length", label: "Side Pkt Len" },
              { name: "side_pocket_width", label: "Side Pkt W" },
              { name: "side_pocket_distance", label: "Side Pkt Dist" },
              { name: "side_pocket_opening", label: "Side Pkt Open" },
            ]}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          {/* Provisions (auto-calculated) */}
          <div className="flex gap-3">
            <GroupedMeasurementFields
              form={form}
              title="Provisions"
              unit={unit}
              isDisabled={!isEditing}
              fields={[
                { name: "chest_provision", label: "Chest", isDisabled: true },
                { name: "waist_provision", label: "Waist", isDisabled: true },
                { name: "armhole_provision", label: "Armhole", isDisabled: true },
              ]}
              wrapperClassName="min-w-[200px]"
              getFieldRef={getFieldRef}
              getEnterHandler={getEnterHandler}
            />
          </div>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-medium">Notes</FormLabel>
                <FormControl>
                  <Textarea
                    rows={5}
                    placeholder="Special requests or notes"
                    {...field}
                    disabled={!isEditing}
                    className="bg-background border-border/60"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {/* ---- Bottom Actions ---- */}
        <div className="flex flex-wrap justify-end gap-4 pt-4">
          {(isEditing || isCreatingNew) && !isOrderClosed && (
            <>
              {isCreatingNew && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClear}
                  className="border-border/40 text-muted-foreground hover:bg-muted"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <div className="mr-2">
                      <SmallSpinner />
                    </div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </>
          )}
          {!isEditing && !isOrderClosed && onProceed && (
            <Button
              type="button"
              onClick={onProceed}
              disabled={measurements.size === 0}
            >
              Continue to Fabric Selection
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
