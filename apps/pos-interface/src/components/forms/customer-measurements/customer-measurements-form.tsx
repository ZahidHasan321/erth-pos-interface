"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";


import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { GroupedMeasurementFields } from "./GroupedMeasurementFields";
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
import { Pencil, X, Save, Plus, ArrowRight, RotateCcw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ---------------------------------------
// Type definitions
// ---------------------------------------
interface CustomerMeasurementsFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<CustomerMeasurementsSchema, any, any>;
  customerId: number | null;
  onProceed?: () => void;
  isOrderClosed: boolean;
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
  const [confirmationDialog, setConfirmationDialog] = React.useState({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const [selectedReference, setSelectedReference] = React.useState<
    string | undefined
  >(form.getValues("reference") ?? undefined);
  useAutoProvision(form);

  // Track previous customerId to detect changes
  const prevCustomerIdRef = React.useRef<number | null>(null);
  const customerChanged = customerId !== prevCustomerIdRef.current;

  // Update ref after render
  React.useEffect(() => {
    prevCustomerIdRef.current = customerId;
  }, [customerId]);

  // Reset internal state when customerId changes
  React.useEffect(() => {
    if (customerChanged) {
      // Customer changed, reset internal state
      setSelectedMeasurementId(null);
      setMeasurements(new Map());
      setIsEditing(false);
      setIsCreatingNew(false);
    }
  }, [customerId]); // Use customerId as dependency, not the computed customerChanged boolean

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
    refetch,
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

  // Refetch measurements when customerId changes to ensure fresh data
  React.useEffect(() => {
    if (customerId && customerChanged) {
      refetch();
    }
  }, [customerId, customerChanged, refetch]);

  // Populate measurements when data is loaded
  React.useEffect(() => {
    if (customerId && isSuccess && !isFetching) {
      if (measurementQuery?.data?.length) {
        const newMap = new Map<string, CustomerMeasurementsSchema>();
        measurementQuery.data.forEach((m) => {
          const displayId = m.measurement_id || m.id;
          if (displayId) {
            newMap.set(displayId, mapMeasurementToFormValues(m));
          }
        });
        setMeasurements(newMap);

        // Select the first measurement by default
        const firstMeasurementId = measurementQuery.data[0]?.measurement_id || measurementQuery.data[0]?.id || null;
        setSelectedMeasurementId(firstMeasurementId);
      } else {
        // No measurements for this customer, so reset everything.
        setMeasurements(new Map());
        setSelectedMeasurementId(null);
        form.reset();
      }
    }
  }, [customerId, isSuccess, isFetching, measurementQuery?.data, form]);

  // Reset form when selected measurement changes
  React.useEffect(() => {
    if (selectedMeasurementId && measurements.has(selectedMeasurementId)) {
      const selected = measurements.get(selectedMeasurementId);
      if (selected) {
        form.reset(selected);
      }
    } else {
      form.reset();
    }
  }, [selectedMeasurementId, measurements, form]);

  // ---------------------------------------
  // Handlers
  // ---------------------------------------
  const handleFormSubmit = (
    values: CustomerMeasurementsSchema,
  ) => {
    const onConfirm = () => {
      if (!customerId) {
        toast.error("Customer ID is required.");
        return;
      }

      const data = mapFormValuesToMeasurement(values, customerId);

      if (isCreatingNew) {
        createMeasurementMutation(data);
      } else {
        if (!selectedMeasurementId) {
          toast.error("No measurement selected for updating.");
          return;
        }

        const id = measurements.get(
          selectedMeasurementId,
        )?.id;
        if (!id) {
          toast.error("No measurement selected for updating.");
          return;
        }
        updateMeasurementMutation({
          id: id,
          data: data,
        });
      }

      setConfirmationDialog((d) => ({ ...d, isOpen: false }));
    };

    setConfirmationDialog({
      isOpen: true,
      title: `Confirm ${isCreatingNew ? "New" : "Update"}`,
      description: `Are you sure you want to ${isCreatingNew ? "create this new" : "update this"} measurement?`,
      onConfirm: onConfirm,
    });
  };

  const handleNewMeasurement = () => {
    setConfirmationDialog({
      isOpen: true,
      title: "Confirm New Measurement",
      description:
        "This will create a copy of the currently selected measurement. Are you sure you want to proceed? Unsaved changes will be lost.",
      onConfirm: () => {
        setPreviousMeasurementId(selectedMeasurementId);
        setIsCreatingNew(true);
        setIsEditing(true);

        const existingIds = Array.from(measurements.keys());
        const nextNumber =
          existingIds
            .map((id) => {
              const parts = id.split("-");
              if (parts.length < 2) return 0;
              // Only count IDs that belong to this customer and follow the pattern
              if (parts[0] !== String(customerId)) return 0;
              const num = parseInt(parts[1], 10);
              return isNaN(num) ? 0 : num;
            })
            .reduce((a, b) => Math.max(a, b), 0) + 1;

        const newId = `${customerId}-${nextNumber}`;
        form.setValue("measurement_id", newId);
        const baseMeasurement = form.getValues();

        addMeasurement(newId, baseMeasurement);
        setSelectedMeasurementId(newId);

        setConfirmationDialog((d) => ({ ...d, isOpen: false }));
      },
    });
  };

  const handleClear = () => {
    const measurementIDTemp = selectedMeasurementId;
    form.reset(customerMeasurementsDefaults); // wipe the form
    form.setValue("measurement_id", measurementIDTemp || "");
    setSelectedMeasurementId(measurementIDTemp);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsCreatingNew(false);
    const measurementId = form.getValues("measurement_id");
    if (isCreatingNew && measurementId) {
      removeMeasurement(measurementId);
      setSelectedMeasurementId(previousMeasurementId);
    } else if (
      selectedMeasurementId &&
      measurements.has(selectedMeasurementId)
    ) {
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
        className="space-y-8 w-full"
      >
        <ConfirmationDialog
          isOpen={confirmationDialog.isOpen}
          onClose={() =>
            setConfirmationDialog((d) => ({ ...d, isOpen: false }))
          }
          onConfirm={confirmationDialog.onConfirm}
          title={confirmationDialog.title}
          description={confirmationDialog.description}
        />
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground bg-linear-to-r from-primary to-secondary bg-clip-text">
              Measurement
            </h1>
            <p className="text-sm text-muted-foreground">
              Customer body measurements and details
            </p>
          </div>
        </div>

        {/* Root Validation Error */}
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Error</AlertTitle>
            <AlertDescription>
              {form.formState.errors.root.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Display generic error if refine fails without a specific path */}
        {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
           <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Form has errors</AlertTitle>
            <AlertDescription>
              All measurement fields must be filled with valid values (greater than 0) before submission.
            </AlertDescription>
          </Alert>
        )}

        {/* ---- Top Controls ---- */}
        <div className="flex flex-wrap justify-between items-start gap-6 bg-card p-6 rounded-xl border border-border shadow-sm">
          {/* Left side: all existing fields wrapped in one flex row */}
          <div className="flex flex-wrap justify-start gap-6">
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

            <FormField
              control={form.control}
              name="measurement_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">
                    Measurement Date
                  </FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value ? new Date(field.value) : null}
                      onChange={(date) => field.onChange(date?.toISOString())}
                      placeholder="Select date"
                      disabled={!isEditing}
                      className="w-auto min-w-48"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Right edge: action buttons (moved from bottom) */}
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

            {(isEditing || isCreatingNew) && !isOrderClosed && (
              <>
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
          </div>
        </div>
        {/* ---- Measurement Groups ---- */}
        <div className="flex flex-col 2xl:flex-row 2xl:flex-wrap gap-4 items-stretch pt-8">
          <div className="flex flex-row gap-6 flex-wrap w-full">
            <GroupedMeasurementFields
              form={form}
              title="Collar"
              unit={unit}
              isDisabled={!isEditing}
              fields={[
                { name: "collar_width", label: "Length" },
                { name: "collar_height", label: "Height" },
              ]}
              wrapperClassName="flex-1"
              getFieldRef={getFieldRef}
              getEnterHandler={getEnterHandler}
            />
            <GroupedMeasurementFields
              form={form}
              title="Lengths"
              unit={unit}
              isDisabled={!isEditing}
              fields={[
                { name: "length_front", label: "Front" },
                { name: "length_back", label: "Back" },
              ]}
              wrapperClassName="flex-1"
              getFieldRef={getFieldRef}
              getEnterHandler={getEnterHandler}
            />
          </div>

          <GroupedMeasurementFields
            form={form}
            title="Arm"
            unit={unit}
            isDisabled={!isEditing}
            fields={[
              { name: "shoulder", label: "Shoulder" },
              { name: "sleeve_length", label: "Sleeve Length" },
              { name: "sleeve_width", label: "Sleeve Width" },
              { name: "elbow", label: "Elbow" },
              [
                { name: "armhole", label: "Armhole" },
                { name: "armhole_front", label: "Front" },
                {
                  name: "armhole_provision",
                  label: "Provision",
                  isDisabled: true,
                },
              ],
            ]}
            wrapperClassName="w-full"
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />

          <GroupedMeasurementFields
            form={form}
            title="Body"
            unit={unit}
            isDisabled={!isEditing}
            fields={[
              { name: "chest_upper", label: "Upper Chest" },
              [
                { name: "chest_full", label: "Full Chest" },
                { name: "chest_front", label: "Front" },
                {
                  name: "chest_provision",
                  label: "Provision",
                  isDisabled: true,
                },
              ],
              { name: "chest_back", label: "Back Chest" },
              [
                { name: "waist_full", label: "Full Waist" },
                { name: "waist_front", label: "Front" },
                { name: "waist_back", label: "Back" },
                {
                  name: "waist_provision",
                  label: "Provision",
                  isDisabled: true,
                },
              ],
              { name: "bottom", label: "Bottom" },
            ]}
            wrapperClassName="w-full gap-y-12"
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
        </div>
        <div className="flex flex-row gap-6 flex-wrap">
          <GroupedMeasurementFields
            form={form}
            title="Top Pocket"
            unit={unit}
            isDisabled={!isEditing}
            fields={[
              { name: "top_pocket_distance", label: "Distance" },
              { name: "top_pocket_length", label: "Length" },
              { name: "top_pocket_width", label: "Width" },
            ]}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          <GroupedMeasurementFields
            form={form}
            title="Jabzour"
            unit={unit}
            isDisabled={!isEditing}
            fields={[
              { name: "jabzour_length", label: "Length" },
              { name: "jabzour_width", label: "Width" },
            ]}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          <GroupedMeasurementFields
            form={form}
            title="Side Pocket"
            unit={unit}
            isDisabled={!isEditing}
            fields={[
              { name: "side_pocket_length", label: "Length" },
              { name: "side_pocket_width", label: "Width" },
              { name: "side_pocket_distance", label: "Distance" },
              { name: "side_pocket_opening", label: "Opening" },
            ]}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
        </div>
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
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
        {/* ---- Continue to Fabric Selection ---- */}
        <div className="flex flex-wrap justify-end gap-4 pt-4">
          {/* Continue to Fabric Selection */}
          {!isEditing && !isOrderClosed && (
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
