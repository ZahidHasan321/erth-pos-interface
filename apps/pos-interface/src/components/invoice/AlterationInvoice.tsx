import * as React from "react";
import { getInvoiceBrand } from "./brand";
import type { AlterationChange } from "@/lib/alteration-changes";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

export interface AlterationInvoiceGarment {
  /** 1-based position on the invoice. */
  index: number;
  /** Internal = a garment we made (links a source); external = brought from elsewhere. */
  source: "internal" | "external";
  /** Labelled "field -> new value" changes (measurements then styles). */
  changes: AlterationChange[];
  notes?: string | null;
}

export interface AlterationInvoiceData {
  orderId?: string | number;
  /** alteration_orders.invoice_number (separate sequence from work orders). */
  invoiceNumber?: number | null;
  orderDate?: string;
  receivedDate?: string | null;
  comments?: string | null;
  customerName?: string;
  customerPhone?: string;
  garments: AlterationInvoiceGarment[];
  /** Manually-entered alteration total (orders.order_total). */
  total: number;
  discountValue?: number;
  /** Running total as of the printed transaction. */
  paid: number;
  paymentType?: string;
  paymentRefNo?: string;
}

export interface AlterationInvoiceProps {
  data: AlterationInvoiceData;
}

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

const PAYMENT_LABELS: Record<string, string> = {
  cash: "نقدي",
  knet: "كي-نت",
  "k-net": "كي-نت",
  link_payment: "دفع رابط",
  "link-payment": "دفع رابط",
  installments: "تقسيط",
  others: "أخرى",
};

export const AlterationInvoice = React.forwardRef<HTMLDivElement, AlterationInvoiceProps>(
  ({ data }, ref) => {
    const {
      orderId,
      invoiceNumber,
      orderDate,
      receivedDate,
      comments,
      customerName,
      customerPhone,
      garments,
      total,
      discountValue = 0,
      paid,
      paymentType,
      paymentRefNo,
    } = data;

    const subtotal = total + discountValue;
    const balance = total - paid;
    const brand = getInvoiceBrand();

    const dateStr = (raw?: string | null): string =>
      raw
        ? parseUtcTimestamp(raw).toLocaleDateString("ar-KW", {
            timeZone: TIMEZONE,
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";

    return (
      <div
        ref={ref}
        className="bg-white text-black p-3 max-w-5xl mx-auto text-sm leading-tight print:bg-white print:text-black"
        style={{ direction: "rtl", fontFamily: "'Cairo', 'IBM Plex Sans Arabic', sans-serif" }}
      >
        {/* Header */}
        <div className="mb-2 pb-1.5 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={brand.logo} alt={`${brand.name} Clothing`} className="h-9" />
            <div>
              <h1 className="text-base font-bold text-gray-800 leading-none">{brand.name} Clothing</h1>
              <h2 className="text-sm font-bold text-gray-800 leading-tight">فاتورة تعديل</h2>
            </div>
          </div>
          <div className="text-left">
            {invoiceNumber != null && (
              <p className="text-[10px] text-gray-600 leading-tight">
                <span className="font-semibold">رقم فاتورة التعديل: {invoiceNumber}</span>
              </p>
            )}
            {orderId && (
              <p className="text-[10px] text-gray-600 leading-tight">
                <span className="font-semibold">رقم الطلب: {orderId}</span>
              </p>
            )}
            {orderDate && (
              <p className="text-[10px] text-gray-600 leading-tight">التاريخ: {dateStr(orderDate)}</p>
            )}
            {receivedDate && (
              <p className="text-[10px] text-gray-600 leading-tight">تاريخ الاستلام: {dateStr(receivedDate)}</p>
            )}
          </div>
        </div>

        {/* Customer */}
        <div className="mb-1.5 grid grid-cols-2 gap-2 text-[10px]">
          {customerName && (
            <div className="py-0.5 px-2 text-right border-l border-gray-300">
              <span className="text-gray-600">الاسم: </span>
              <span className="font-semibold">{customerName}</span>
            </div>
          )}
          {customerPhone && (
            <div className="py-0.5 px-2 text-right">
              <span className="text-gray-600">الهاتف: </span>
              <span className="font-semibold">{customerPhone}</span>
            </div>
          )}
        </div>

        {/* Garments — the actual changes recorded per piece (new value only) */}
        <div className="mb-1.5 space-y-2">
          <h3 className="text-[11px] font-semibold text-gray-800 pb-0.5 border-b border-gray-700">
            بنود التعديل
          </h3>
          {garments.map((g) => (
            <div key={g.index} className="border border-gray-700">
              <div className="flex items-center justify-between bg-gray-100 px-2 py-0.5 text-[10px] font-semibold border-b border-gray-700">
                <span>القطعة {g.index}</span>
                <span className="text-gray-600">{g.source === "internal" ? "داخلي (من إنتاجنا)" : "خارجي"}</span>
              </div>
              {g.changes.length > 0 ? (
                <table className="w-full text-[10px] leading-tight border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-0.5 px-2 text-right border-b border-gray-300 w-1/2">البند</th>
                      <th className="py-0.5 px-2 text-right border-b border-gray-300">القيمة الجديدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.changes.map((c) => (
                      <tr key={`${c.kind}-${c.field}`} className="even:bg-gray-50/60">
                        <td className="py-0.5 px-2 text-right border-b border-gray-200">{c.label}</td>
                        <td className="py-0.5 px-2 text-right border-b border-gray-200 font-semibold">{c.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-2 py-1 text-[10px] text-gray-500">لا توجد تغييرات مسجلة.</p>
              )}
              {g.notes && (
                <p className="px-2 py-0.5 text-[10px] text-gray-600 border-t border-gray-200">
                  ملاحظات: {g.notes}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mb-1.5">
          <h3 className="text-[11px] font-semibold text-gray-800 mb-1 pb-0.5 border-b border-gray-700">
            إجمالي الرسوم
          </h3>
          <div className="bg-gray-50 p-2 border border-gray-700 space-y-0.5 text-[10px]">
            {discountValue > 0 && (
              <>
                <div className="flex justify-between py-0.5">
                  <span className="font-semibold">{fmt(subtotal)} د.ك</span>
                  <span className="text-gray-700">المجموع</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-semibold">- {fmt(discountValue)} د.ك</span>
                  <span className="text-gray-700">الخصم</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-0.5 border-b border-gray-700">
              <span className="font-semibold">{fmt(total)} د.ك</span>
              <span className="font-semibold">الإجمالي</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-semibold">{fmt(paid)} د.ك</span>
              <span className="text-gray-700">المدفوع</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-gray-700">
              <span className="font-bold">{fmt(balance < 0 ? 0 : balance)} د.ك</span>
              <span className="font-bold">المتبقي</span>
            </div>
            {paymentType && (
              <div className="mt-1 pt-1 border-t border-gray-700 grid grid-cols-2 gap-2 text-[10px]">
                <div className="py-0.5 px-2 text-right border-l border-gray-300">
                  <span className="text-gray-600">طريقة الدفع: </span>
                  <span className="font-semibold">{PAYMENT_LABELS[paymentType] || paymentType}</span>
                </div>
                {paymentRefNo && (
                  <div className="py-0.5 px-2 text-right">
                    <span className="text-gray-600">رقم المرجع: </span>
                    <span className="font-semibold">{paymentRefNo}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {comments && (
          <div className="mb-1.5 text-[10px] text-gray-700">
            <span className="font-semibold">ملاحظات الطلب: </span>
            {comments}
          </div>
        )}

        <p className="text-center text-[10px] text-gray-600 mt-1.5 font-semibold">
          شكراً لاختياركم {brand.name} Clothing
        </p>
      </div>
    );
  },
);

AlterationInvoice.displayName = "AlterationInvoice";
