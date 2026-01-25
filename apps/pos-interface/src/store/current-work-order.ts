import { customerDemographicsSchema } from "@/components/forms/customer-demographics/demographics-form.schema";
import { garmentSchema as fabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { styleOptionsSchema } from "@/components/forms/fabric-selection-and-options/style-options/style-options-form.schema";
import { type ShelvedProduct } from "@/components/forms/shelved-products/shelved-products-form.schema";
import { orderSchema } from "@/components/forms/order-summary-and-payment/order-form.schema";
import { z } from "zod";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

type CustomerDemographics = z.infer<typeof customerDemographicsSchema>;
type FabricSelection = z.infer<typeof fabricSelectionSchema>;
type StyleOption = z.infer<typeof styleOptionsSchema>;
type OrderSchema = z.infer<typeof orderSchema>;

interface CurrentWorkOrderState {
  orderId: number | null;
  order: Partial<OrderSchema>;
  customerDemographics: Partial<CustomerDemographics>;
  stitchingPrice: number;
  fabricSelections: FabricSelection[];
  styleOptions: StyleOption[];
  shelvedProducts: ShelvedProduct[];
  currentStep: number;
  savedSteps: number[];

  // setters
  setOrderId: (id: number | null) => void;
  setCustomerDemographics: (data: Partial<CustomerDemographics>) => void;
  setFabricSelections: (data: FabricSelection[]) => void;
  setStyleOptions: (data: StyleOption[]) => void;
  addFabricSelection: (data: FabricSelection) => void;
  updateFabricSelection: (data: FabricSelection) => void;
  setOrder: (order: Partial<OrderSchema>) => void;
  removeFabricSelection: (id: string) => void;
  setCurrentStep: (step: number) => void;
  setStitchingPrice: (price: number) => void;
  // mark step complete
  addSavedStep: (step: number) => void;
  removeSavedStep: (step: number) => void;

  // reset work order
  resetWorkOrder: () => void;
}

export const createWorkOrderStore = (name: string) =>
  create<CurrentWorkOrderState>()(
    devtools(
      (set) => ({
        orderId: null,
        order: {},
        stitchingPrice: 9,
        customerDemographics: {},
        fabricSelections: [],
        styleOptions: [],
        shelvedProducts: [],
        currentStep: 0,
        savedSteps: [],

        setOrderId: (id) => set((state) => ({ ...state, orderId: id })),
        setOrder: (partial: Partial<OrderSchema>) =>
          set((state) => ({
            order: { ...state.order, ...partial },
          })),

        setCustomerDemographics: (data) =>
          set((state) => ({
            customerDemographics: { ...state.customerDemographics, ...data },
          })),

        setFabricSelections: (data) => set({ fabricSelections: data }),
        setStyleOptions: (data) => set({ styleOptions: data }),

        addFabricSelection: (data) =>
          set((state) => ({
            fabricSelections: [...state.fabricSelections, data],
          })),

        updateFabricSelection: (data) =>
          set((state) => ({
            fabricSelections: state.fabricSelections.map((item) =>
              item.id === data.id ? data : item,
            ),
          })),

        removeFabricSelection: (id) =>
          set((state) => ({
            fabricSelections: state.fabricSelections.filter(
              (item) => item.id !== id,
            ),
          })),

        setCurrentStep: (step) => set({ currentStep: step }),
        setStitchingPrice: (price) => set({ stitchingPrice: price }),
        addSavedStep: (step) =>
          set((state) =>
            state.savedSteps.includes(step)
              ? state
              : {
                  savedSteps: [...state.savedSteps, step].sort((a, b) => a - b),
                },
          ),

        removeSavedStep: (step) =>
          set((state) => ({
            savedSteps: state.savedSteps.filter((s) => s !== step),
          })),

        resetWorkOrder: () =>
          set({
            orderId: null,
            order: {},
            customerDemographics: {},
            fabricSelections: [],
            styleOptions: [],
            currentStep: 0,
            savedSteps: [],
          }),
      }),
      { name: `work-order-${name}` },
    ),
  );