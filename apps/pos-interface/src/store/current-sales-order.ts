import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { customerDemographicsSchema } from "@/components/forms/customer-demographics/demographics-form.schema";
import { shelfProductSchema } from "@/components/forms/shelf/shelf-form.schema";
import { z } from "zod";
import type { OrderSchema } from "@/components/forms/order-summary-and-payment/order-form.schema";

interface CurrentSalesOrderState {
  orderId: number | null;
  order: Partial<OrderSchema>;
  customerDemographics: Partial<z.infer<typeof customerDemographicsSchema>>;
  shelfProducts: z.infer<typeof shelfProductSchema>;
  currentStep: number;
  savedSteps: number[];
  paymentType: string | null;
  otherPaymentType: string | null;
  paymentRefNo: string | null;
  totalDue: number;
  discount: number;
  balance: number;

  // setters
  setOrderId: (id: number | null) => void;
  setOrder: (order: Partial<OrderSchema>) => void;
  setCustomerDemographics: (data: Partial<z.infer<typeof customerDemographicsSchema>>) => void;
  setShelfProducts: (data: z.infer<typeof shelfProductSchema>) => void;
  setCurrentStep: (step: number) => void;
  setPaymentType: (type: string | null) => void;
  setOtherPaymentType: (type: string | null) => void;
  setPaymentRefNo: (refNo: string | null) => void;
  setTotalDue: (amount: number) => void;
  setDiscount: (amount: number) => void;
  setBalance: (amount: number) => void;

  // mark step complete
  addSavedStep: (step: number) => void;
  removeSavedStep: (step: number) => void;

  // reset sales order
  resetSalesOrder: () => void;
}

export const createSalesOrderStore = (name: string) =>
  create<CurrentSalesOrderState>()(
    devtools(
      (set) => ({
        orderId: null,
        order: {},
        customerDemographics: {},
        shelfProducts: [],
        currentStep: 0,
        savedSteps: [],
        paymentType: null,
        otherPaymentType: null,
        paymentRefNo: null,
        totalDue: 0,
        discount: 0,
        balance: 0,

        setOrderId: (id) => set((state) => ({ ...state, orderId: id })),
        setOrder: (order) => set((state) => ({ order: { ...state.order, ...order } })),

        setCustomerDemographics: (data) =>
          set((state) => ({
            customerDemographics: { ...state.customerDemographics, ...data },
          })),

        setShelfProducts: (data) => set({ shelfProducts: data }),

        setCurrentStep: (step) => set({ currentStep: step }),

        setPaymentType: (type) => set({ paymentType: type }),
        setOtherPaymentType: (type) => set({ otherPaymentType: type }),
        setPaymentRefNo: (refNo) => set({ paymentRefNo: refNo }),
        setTotalDue: (amount) => set({ totalDue: amount }),
        setDiscount: (amount) => set({ discount: amount }),
        setBalance: (amount) => set({ balance: amount }),

        addSavedStep: (step) =>
          set((state) =>
            state.savedSteps.includes(step)
              ? state
              : {
                  savedSteps: [...state.savedSteps, step].sort((a, b) => a - b),
                }
          ),

        removeSavedStep: (step) =>
          set((state) => ({
            savedSteps: state.savedSteps.filter((s) => s !== step),
          })),

        resetSalesOrder: () =>
          set({
            orderId: null,
            order: {},
            customerDemographics: {},
            currentStep: 0,
            savedSteps: [],
            paymentType: null,
            otherPaymentType: null,
            paymentRefNo: null,
            totalDue: 0,
            discount: 0,
            balance: 0,
          }),
      }),
      { name: `sales-order-${name}` }
    )
  );
