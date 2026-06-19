import * as React from "react";
import { getInvoiceBrand } from "./brand";
import { type InvoiceData } from "./OrderInvoice";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

export interface SalesInvoiceProps {
  data: InvoiceData;
}

const fmt = (n: number): string => Number(n.toFixed(3)).toString();

export const SalesInvoice = React.forwardRef<HTMLDivElement, SalesInvoiceProps>(
  ({ data }, ref) => {
    const {
      orderId,
      fatoura,
      invoiceRevision,
      orderDate,
      customerName,
      customerPhone,
      shelfProducts = [],
      charges,
      discountValue = 0,
      paid,
      paymentType,
      otherPaymentType,
      paymentRefNo,
    } = data;

    const totalDue = charges?.shelf || 0;
    const finalAmount = totalDue - discountValue;
    const balance = finalAmount - paid;
    const brand = getInvoiceBrand();

    // Original (revision 0) prints with no suffix; a revision (≥1) as
    // `<fatoura>-R<N>` (SPEC §3).
    const fatouraDisplay =
      fatoura != null
        ? `${fatoura}${invoiceRevision && invoiceRevision > 0 ? `-R${invoiceRevision}` : ""}`
        : null;

    const formattedDate = orderDate
      ? parseUtcTimestamp(orderDate).toLocaleDateString("ar-KW", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

    const getPaymentLabel = (): string => {
      if (paymentType === "others") return otherPaymentType || "أخرى";
      if (paymentType === "knet") return "كي-نت";
      if (paymentType === "cash") return "نقدي";
      if (paymentType === "link_payment") return "دفع رابط";
      if (paymentType === "installments") return "تقسيط";
      return paymentType || "";
    };

    return (
      <div
        ref={ref}
        className="bg-white text-black p-3 max-w-5xl mx-auto text-sm leading-tight print:bg-white print:text-black"
        style={{ direction: "rtl", fontFamily: "'Cairo', 'IBM Plex Sans Arabic', sans-serif" }}
      >
        {/* Header — horizontal: logo + brand on one side, invoice meta on the
            other, so many shelf items still fit on a single page. */}
        <div className="mb-2 pb-1.5 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={brand.logo}
              alt={`${brand.name} Clothing`}
              className="h-9"
            />
            <div>
              <h1 className="text-base font-bold text-gray-800 leading-none">{brand.name} Clothing</h1>
              <h2 className="text-sm font-bold text-gray-800 leading-tight">فاتورة مبيعات</h2>
            </div>
          </div>
          <div className="text-left">
            {fatouraDisplay && (
              <p className="text-[10px] text-gray-600 leading-tight">
                <span className="font-semibold">رقم الفاتورة: {fatouraDisplay}</span>
              </p>
            )}
            {orderId && (
              <p className="text-[10px] text-gray-600 leading-tight">
                <span className="font-semibold">رقم الطلب: {orderId}</span>
              </p>
            )}
            {formattedDate && (
              <p className="text-[10px] text-gray-600 leading-tight">
                التاريخ: {formattedDate}
              </p>
            )}
          </div>
        </div>

        {/* Customer Information */}
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

        {/* Table */}
        {shelfProducts.length > 0 && (
          <div className="mb-1.5">
            <h3 className="text-[11px] font-semibold text-gray-800 mb-1 pb-0.5 border-b border-gray-700">
              المنتجات
            </h3>
            <table className="w-full text-[10px] leading-tight border border-gray-700 border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-0.5 px-1.5 text-center border border-gray-700 w-12">#</th>
                  <th className="py-0.5 px-1.5 text-right border border-gray-700">المنتج</th>
                  <th className="py-0.5 px-1.5 text-center border border-gray-700 w-20">الكمية</th>
                  <th className="py-0.5 px-1.5 text-right border border-gray-700 w-24">سعر الوحدة</th>
                  <th className="py-0.5 px-1.5 text-right border border-gray-700 w-24">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {shelfProducts.map((p, idx) => (
                  <tr key={idx} className="even:bg-gray-50">
                    <td className="py-0.5 px-1.5 text-center border border-gray-700">{idx + 1}</td>
                    <td className="py-0.5 px-1.5 text-right border border-gray-700">
                      {p.product_type} - {p.brand}
                    </td>
                    <td className="py-0.5 px-1.5 text-center border border-gray-700">{p.quantity}</td>
                    <td className="py-0.5 px-1.5 text-right border border-gray-700">{fmt(p.unit_price)} د.ك</td>
                    <td className="py-0.5 px-1.5 text-right border border-gray-700">{fmt(p.quantity * p.unit_price)} د.ك</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="mb-1.5">
          <h3 className="text-[11px] font-semibold text-gray-800 mb-1 pb-0.5 border-b border-gray-700">
            إجمالي الرسوم
          </h3>
          <div className="bg-gray-50 p-2 border border-gray-700 space-y-0.5 text-[10px]">
            <div className="flex justify-between py-0.5 border-b border-gray-700">
              <span className="font-semibold">{fmt(totalDue)} د.ك</span>
              <span className="font-semibold">الإجمالي</span>
            </div>
            {discountValue > 0 && (
              <>
                <div className="flex justify-between py-0.5">
                  <span className="font-semibold">
                    - {fmt(discountValue)} د.ك
                  </span>
                  <span className="text-gray-700">الخصم</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-semibold">
                    {fmt(totalDue - discountValue)} د.ك
                  </span>
                  <span className="text-gray-700">بعد الخصم</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-0.5">
              <span className="font-semibold">{fmt(paid)} د.ك</span>
              <span className="text-gray-700">المدفوع</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-gray-700">
              <span className="font-bold">
                {fmt(balance < 0 ? 0 : balance)} د.ك
              </span>
              <span className="font-bold">المتبقي</span>
            </div>
            {paymentType && (
              <div className="mt-1 pt-1 border-t border-gray-700 grid grid-cols-2 gap-2 text-[10px]">
                <div className="py-0.5 px-2 text-right border-l border-gray-300">
                  <span className="text-gray-600">طريقة الدفع: </span>
                  <span className="font-semibold">{getPaymentLabel()}</span>
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

        {/* Terms */}
        <div className="mt-2 pt-1.5 border-t border-gray-700">
          <h4 className="text-[10px] font-semibold text-gray-800 mb-1 text-center">
            الملاحظات والشروط
          </h4>
          <ul className="text-right text-gray-700 text-[10px] leading-snug space-y-0.5">
            <li>• البضاعة المباعة لا ترد ولا تستبدل بعد خروجها من المعرض.</li>
            <li>• يرجى التأكد من سلامة القطع قبل الاستلام.</li>
            <li>• يتم سداد المبلغ كاملاً عند الشراء.</li>
          </ul>
          <p className="text-center text-[10px] text-gray-600 mt-1.5 font-semibold">
            شكراً لاختياركم {brand.name} Clothing
          </p>
        </div>
      </div>
    );
  },
);

SalesInvoice.displayName = "SalesInvoice";
