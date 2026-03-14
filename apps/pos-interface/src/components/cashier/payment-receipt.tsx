import * as React from "react";
import ErthLogo from "@/assets/erth-light.svg";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";

export interface PaymentReceiptData {
    orderId: number;
    invoiceNumber?: number;
    customerName?: string;
    customerPhone?: string;
    transactionAmount: number;
    transactionType: "payment" | "refund";
    paymentType: string;
    paymentRefNo?: string;
    orderTotal: number;
    totalPaid: number;
    remainingBalance: number;
    cashierName?: string;
    timestamp: string;
}

export const PaymentReceipt = React.forwardRef<HTMLDivElement, { data: PaymentReceiptData }>(
    ({ data }, ref) => {
        const fmt = (n: number): string => Number(n.toFixed(3)).toString();
        const formattedDate = new Date(data.timestamp).toLocaleDateString("ar-KW", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const paymentLabel =
            PAYMENT_TYPE_LABELS[data.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || data.paymentType;

        return (
            <div
                ref={ref}
                className="bg-white text-black p-6 max-w-md mx-auto text-sm print:bg-white print:text-black"
                style={{ direction: "rtl", fontFamily: "'Cairo', 'IBM Plex Sans Arabic', sans-serif" }}
            >
                {/* Header */}
                <div className="text-center mb-4 pb-3 border-b border-gray-700">
                    <img src={ErthLogo} alt="ERTH" className="h-12 mx-auto mb-2" />
                    <h1 className="text-lg font-bold text-gray-800">
                        {data.transactionType === "refund" ? "ايصال استرجاع" : "ايصال دفع"}
                    </h1>
                </div>

                {/* Order Info */}
                <div className="space-y-1 text-xs mb-4">
                    <div className="flex justify-between">
                        <span className="font-semibold">{data.orderId}</span>
                        <span className="text-gray-600">رقم الطلب</span>
                    </div>
                    {data.invoiceNumber && (
                        <div className="flex justify-between">
                            <span className="font-semibold">{data.invoiceNumber}</span>
                            <span className="text-gray-600">رقم الفاتورة</span>
                        </div>
                    )}
                    {data.customerName && (
                        <div className="flex justify-between">
                            <span className="font-semibold">{data.customerName}</span>
                            <span className="text-gray-600">العميل</span>
                        </div>
                    )}
                    {data.customerPhone && (
                        <div className="flex justify-between">
                            <span className="font-semibold">{data.customerPhone}</span>
                            <span className="text-gray-600">الهاتف</span>
                        </div>
                    )}
                </div>

                {/* Transaction Details */}
                <div className="bg-gray-50 p-3 border border-gray-700 space-y-2 text-xs mb-4">
                    <div className="flex justify-between py-1 border-b border-gray-300">
                        <span className={`font-bold text-base ${data.transactionType === "refund" ? "text-red-600" : "text-green-600"}`}>
                            {data.transactionType === "refund" ? "-" : "+"}{fmt(Math.abs(data.transactionAmount))} د.ك
                        </span>
                        <span className="font-semibold">
                            {data.transactionType === "refund" ? "مبلغ الاسترجاع" : "مبلغ الدفع"}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-semibold">{paymentLabel}</span>
                        <span className="text-gray-600">طريقة الدفع</span>
                    </div>
                    {data.paymentRefNo && (
                        <div className="flex justify-between">
                            <span className="font-semibold">{data.paymentRefNo}</span>
                            <span className="text-gray-600">رقم المرجع</span>
                        </div>
                    )}
                </div>

                {/* Order Summary */}
                <div className="bg-gray-50 p-3 border border-gray-700 space-y-1 text-xs">
                    <div className="flex justify-between">
                        <span className="font-semibold">{fmt(data.orderTotal)} د.ك</span>
                        <span className="text-gray-600">اجمالي الطلب</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-semibold">{fmt(data.totalPaid)} د.ك</span>
                        <span className="text-gray-600">اجمالي المدفوع</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-700">
                        <span className="font-bold">{fmt(Math.max(0, data.remainingBalance))} د.ك</span>
                        <span className="font-bold">المتبقي</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-gray-700 text-center text-xs text-gray-600">
                    <p>{formattedDate}</p>
                    {data.cashierName && <p>الكاشير: {data.cashierName}</p>}
                    <p className="mt-2 font-semibold">شكرا لاختياركم ERTH Clothing</p>
                </div>
            </div>
        );
    }
);

PaymentReceipt.displayName = "PaymentReceipt";
