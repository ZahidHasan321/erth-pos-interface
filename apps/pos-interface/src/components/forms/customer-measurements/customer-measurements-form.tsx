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
import { MeasurementTable } from "./MeasurementTable";
import { useAutoNavigation } from "./useAutoNavigation";
import { ShoulderSlopeSelect, type ShoulderSlopeValue } from "@repo/ui/shoulder-slope";
import { CollarPositionSelect, type CollarPositionValue } from "@repo/ui/collar-position";

import {
  customerMeasurementsDefaults,
  JABZOUR_WIDTH_NEW_DEFAULT,
  SLEEVE_HEMMING_NEW_DEFAULT,
  BOTTOM_HEMMING_NEW_DEFAULT,
  SHOULDER_SLOPE_NEW_DEFAULT,
  type CustomerMeasurementsSchema,
} from "./measurement-form.schema";
import { getNumberedLabel, getLabel } from "@repo/database";
import { MeasurementPreviewDialog } from "@/components/measurement-preview";

/**
 * Helper: build a MeasurementTable `columns` array from spec keys, using the
 * PDF-numbered label for tape fields and the plain label for manual fields.
 */
function toColumns(
  keys: readonly string[],
  opts?: { numbered?: boolean; options?: Record<string, number[]> },
) {
  const numbered = opts?.numbered ?? false;
  const optionMap = opts?.options ?? {};
  return keys.map((name) => {
    const col: { name: string; label: string; options?: number[] } = {
      name,
      label: numbered ? getNumberedLabel(name) : getLabel(name),
    };
    if (optionMap[name]) col.options = optionMap[name];
    return col;
  });
}

// Auto-tape fields, in PDF order 1-18.
const AUTO_TAPE_FIELDS_FIRST = [
  "chest_full", "shoulder", "sleeve_length", "sleeve_width",
  "elbow", "armhole_front", "chest_upper", "chest_front", "waist_front",
];
const AUTO_TAPE_FIELDS_SECOND = [
  "top_pocket_distance", "jabzour_length", "length_front", "bottom",
  "chest_back", "waist_back", "length_back", "collar_width", "collar_height",
];

// Manual fields — everything not in the PDF tape sequence, except derived provisions.
const MANUAL_FIELDS_FIRST = [
  "waist_full",
  "jabzour_width",
  "top_pocket_length", "top_pocket_width",
  "side_pocket_length", "side_pocket_width",
  "side_pocket_distance", "side_pocket_opening",
];
const MANUAL_FIELDS_SECOND = [
  "second_button_distance",
  "basma_length", "basma_width",
  "sleeve_hemming", "bottom_hemming",
  "pen_pocket_length", "pen_pocket_width",
];

import {
  mapMeasurementToFormValues,
  mapFormValuesToMeasurement,
} from "./measurement-form.mapper";

import {
  createMeasurement,
  getMeasurementsByCustomerId,
  getLockedMeasurementIds,
  updateMeasurement,
} from "@/api/measurements";
import { getEmployees } from "@/api/employees";
import { toast } from "sonner";
import type { Measurement } from "@repo/database";
import { Pencil, X, Save, Plus, ArrowRight, RotateCcw, Eye } from "lucide-react";

const JABZOUR_SIDEPOCKET_OPTIONS = [1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2];

// ---------------------------------------
// Type definitions
// ---------------------------------------
interface CustomerMeasurementsFormProps {
  form: UseFormReturn<CustomerMeasurementsSchema, object, CustomerMeasurementsSchema>;
  customerId: number | null;
  onProceed?: () => void;
  isOrderClosed: boolean;
  hideHeader?: boolean;
  /** Show the terminal-style "Preview" button (new work order only). */
  enablePreview?: boolean;
}

// ---------------------------------------
// Custom hook for auto provision updates
// ---------------------------------------
function useAutoProvision(form: UseFormReturn<CustomerMeasurementsSchema, object, CustomerMeasurementsSchema>) {
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

// The `reference` column stores either a preset label or, for "Other", the
// custom free-text reference. The dropdown is driven by the derived category:
// a preset selects itself, any other non-empty string is a custom "Other".
const REFERENCE_PRESETS = ["Winter", "Summer", "Eid", "Occasion"] as const;
const referenceCategory = (reference?: string | null): string | undefined => {
  if (!reference) return undefined;
  return (REFERENCE_PRESETS as readonly string[]).includes(reference)
    ? reference
    : "Other";
};

// ---------------------------------------
// Main Form Component
// ---------------------------------------
export function CustomerMeasurementsForm({
  form,
  customerId,
  onProceed,
  isOrderClosed,
  hideHeader = false,
  enablePreview = false,
}: CustomerMeasurementsFormProps) {
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewValues, setPreviewValues] = React.useState<Partial<Measurement>>({});
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
  >(referenceCategory(form.getValues("reference")));
  useAutoProvision(form);

  // Track previous customerId to detect changes and reset internal state.
  // A null transition (e.g. after "+ New Order" clears the form) followed by
  // re-selecting the same customer must still trigger a fresh populate, so we
  // track null as a real previous state rather than ignoring it.
  const prevCustomerIdRef = React.useRef<number | null>(customerId);
  // Track what query data we've already processed to avoid re-running the populate effect
  const lastProcessedDataRef = React.useRef<string | null>(null);

  React.useEffect(() => {
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
          queryClient.invalidateQueries({
            queryKey: ["measurements", customerId],
          });
          // Saving a measurement during the order is an explicit act of work on
          // this step — it completes the step and proceeds, no separate Continue
          // click needed (see CLAUDE.md §7.10).
          onProceed?.();
        } else {
          toast.error(response.message || "Failed to create measurement.");
        }
      },
      onError: (err: Error) => {
        console.error("API Error:", err);
        toast.error(`Could not create measurement: ${err instanceof Error ? err.message : String(err)}`);
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
          queryClient.invalidateQueries({
            queryKey: ["measurements", customerId],
          });
          // Editing + saving a measurement is explicit work on this step — it
          // completes the step and proceeds (see CLAUDE.md §7.10).
          onProceed?.();
        } else {
          toast.error(response.message || "Failed to update measurement.");
        }
      },
      onError: (err: Error) => {
        console.error("API Error:", err);
        toast.error(`Could not update measurement: ${err instanceof Error ? err.message : String(err)}`);
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

  // Measurements already referenced by a CONFIRMED order can't be edited in
  // place — that would silently rewrite a committed order's spec (§2.5). The
  // user is redirected to "New Measurement" instead. Draft orders don't lock.
  const { data: lockedQuery } = useQuery({
    queryKey: ["locked-measurements", customerId],
    queryFn: () =>
      customerId ? getLockedMeasurementIds(customerId) : Promise.resolve(null),
    enabled: !!customerId,
  });
  const lockedMeasurementIds = React.useMemo(
    () => new Set(lockedQuery?.data ?? []),
    [lockedQuery?.data],
  );
  const selectedMeasurementDbId = selectedMeasurementId
    ? measurements.get(selectedMeasurementId)?.id ?? null
    : null;
  const isSelectedMeasurementLocked =
    !!selectedMeasurementDbId && lockedMeasurementIds.has(selectedMeasurementDbId);

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

      // Only auto-select if nothing is currently selected (or selection is invalid).
      // Deterministically pick the most recent measurement: newest measurement_date
      // first, then highest measurement_id suffix as a same-date tiebreak (so the
      // last one created always wins, regardless of DB row order on date ties).
      if (!selectedMeasurementId || !newMap.has(selectedMeasurementId)) {
        const idSuffix = (mId: string | null | undefined) => {
          const n = parseInt((mId || "").split("-").pop() || "", 10);
          return isNaN(n) ? 0 : n;
        };
        const latest = [...measurementQuery.data].sort((a, b) => {
          const da = a.measurement_date ? new Date(a.measurement_date).getTime() : 0;
          const dbt = b.measurement_date ? new Date(b.measurement_date).getTime() : 0;
          if (dbt !== da) return dbt - da;
          return idSuffix(b.measurement_id) - idSuffix(a.measurement_id);
        })[0];
        const latestId = latest?.measurement_id || latest?.id || null;
        setSelectedMeasurementId(latestId);
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
        setSelectedReference(referenceCategory(selected.reference));
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
      delete (data as Record<string, unknown>).id;
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
      if (lockedMeasurementIds.has(dbId)) {
        toast.error(
          "This measurement is used by a confirmed order and can't be edited in place. Use 'New Measurement' to save a corrected copy.",
        );
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

    // Base the new measurement on the currently-selected STORED measurement (a
    // deliberate "corrected copy"), never on form.getValues(). The live form can
    // still hold values carried over from a prior customer or an unsaved edit
    // before the populate/reset effects run; copying those would silently
    // override the predicted seed defaults (e.g. a leftover jabzour_width 1.625
    // instead of the intended 1.5). With no valid selection (fresh customer) we
    // start from clean defaults and let the seeds below apply.
    const source =
      selectedMeasurementId != null
        ? measurements.get(selectedMeasurementId)
        : undefined;
    const baseMeasurement: CustomerMeasurementsSchema = source
      ? { ...source }
      : { ...customerMeasurementsDefaults, measurer_id: form.getValues("measurer_id") };
    // Clear the DB id so it's treated as new, set the new display ID
    delete (baseMeasurement as Record<string, unknown>).id;
    baseMeasurement.measurement_id = newId;
    baseMeasurement.measurement_date = new Date().toISOString();
    // Seed the predicted jabzour_width / hemming defaults for a fresh
    // measurement (copying an existing one preserves its value).
    if (baseMeasurement.jabzour_width == null) {
      baseMeasurement.jabzour_width = JABZOUR_WIDTH_NEW_DEFAULT;
    }
    if (baseMeasurement.sleeve_hemming == null) {
      baseMeasurement.sleeve_hemming = SLEEVE_HEMMING_NEW_DEFAULT;
    }
    if (baseMeasurement.bottom_hemming == null) {
      baseMeasurement.bottom_hemming = BOTTOM_HEMMING_NEW_DEFAULT;
    }
    if (baseMeasurement.shoulder_slope == null) {
      baseMeasurement.shoulder_slope = SHOULDER_SLOPE_NEW_DEFAULT;
    }

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
                        setSelectedReference(value);
                        // Presets persist their own label; "Other" clears the
                        // column so the custom-reference input can capture free
                        // text (both live in `reference`, never `notes`).
                        field.onChange(value === "Other" ? "" : value);
                      }}
                      value={selectedReference ?? ""}
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
                name="reference"
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
                disabled={!selectedMeasurementId || isSelectedMeasurementLocked}
                title={
                  isSelectedMeasurementLocked
                    ? "Used by a confirmed order. Use New to save a corrected copy."
                    : undefined
                }
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
                // Wait for the customer's measurements to load before allowing
                // New: the next-id and the copy source are both derived from the
                // populated map, so acting mid-fetch could duplicate an id or
                // start from an empty base.
                disabled={!customerId || isFetching}
              >
                <Plus className="w-4 h-4 mr-2" />
                New
              </Button>
            )}
          </div>
        </div>
        {isSelectedMeasurementLocked && !isEditing && !isCreatingNew && (
          <p className="text-sm text-muted-foreground">
            This measurement is used by a confirmed order, so it can't be edited.
            Use New to save a corrected copy.
          </p>
        )}
        {/* ---- Auto-Tape Measurements (sequence 1-18) ---- */}
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Auto Tape Measurements</h3>
          <MeasurementTable
            form={form}
            title="Chest & Shoulder"
            isDisabled={!isEditing}
            columns={toColumns(AUTO_TAPE_FIELDS_FIRST, { numbered: true })}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          <MeasurementTable
            form={form}
            title="Waist, Back & Collar"
            isDisabled={!isEditing}
            columns={toColumns(AUTO_TAPE_FIELDS_SECOND, { numbered: true })}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
        </div>

        {/* ---- Shoulder Slope & Collar Position (categorical, required) ---- */}
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Shoulder Slope</h3>
            <div className="bg-card rounded-lg border border-border p-3">
              <FormField
                control={form.control}
                name="shoulder_slope"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormControl>
                      <ShoulderSlopeSelect
                        value={field.value as ShoulderSlopeValue | null | undefined}
                        onChange={field.onChange}
                        disabled={!isEditing}
                        invalid={fieldState.invalid}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Collar Position</h3>
            <div className="bg-card rounded-lg border border-border p-3">
              <FormField
                control={form.control}
                name="collar_position"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormControl>
                      <CollarPositionSelect
                        value={field.value as CollarPositionValue | null | undefined}
                        onChange={field.onChange}
                        disabled={!isEditing}
                        invalid={fieldState.invalid}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        {/* ---- Manual Measurements ---- */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Manual Measurements</h3>
          <MeasurementTable
            form={form}
            title="Pockets & Jabzour"
            isDisabled={!isEditing}
            columns={toColumns(MANUAL_FIELDS_FIRST, {
              options: { jabzour_width: JABZOUR_SIDEPOCKET_OPTIONS },
            })}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          <MeasurementTable
            form={form}
            title="Basma, Hemming & Pen Pocket"
            isDisabled={!isEditing}
            columns={toColumns(MANUAL_FIELDS_SECOND)}
            getFieldRef={getFieldRef}
            getEnterHandler={getEnterHandler}
          />
          {/* Provisions hidden — auto-calculation still runs in background */}
        </div>
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-medium">Notes for Workshop</FormLabel>
                <FormControl>
                  <Textarea
                    rows={5}
                    placeholder="Notes for the workshop"
                    {...field}
                    value={field.value ?? ""}
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
          {enablePreview && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreviewValues(
                    mapFormValuesToMeasurement(form.getValues(), customerId ?? 0),
                  );
                  setPreviewOpen(true);
                }}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <MeasurementPreviewDialog
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                trigger={null}
                values={previewValues}
              />
            </>
          )}
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
