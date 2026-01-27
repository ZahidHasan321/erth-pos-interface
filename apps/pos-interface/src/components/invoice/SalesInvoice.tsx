import * as React from "react";
import ErthLogo from "@/assets/erth-light.svg";
import { type InvoiceData } from "./OrderInvoice";

export interface SalesInvoiceProps {
  data: InvoiceData;
}

const fmt = (n: number): string => Number(n.toFixed(3)).toString();

export const SalesInvoice = React.forwardRef<HTMLDivElement, SalesInvoiceProps>(
  ({ data }, ref) => {
    const {
      orderId,
      fatoura,
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

    const formattedDate = orderDate
      ? new Date(orderDate).toLocaleDateString("ar-KW", {
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
        className="bg-white text-black p-6 max-w-5xl mx-auto text-sm print:bg-white print:text-black"
        style={{ direction: "rtl" }}
      >
        {/* Header */}
        <div className="mb-4 pb-3 border-b border-gray-700">
          <div className="text-center mb-3">
            <img
              src={ErthLogo}
              alt="ERTH Clothing"
              className="h-16 mx-auto mb-2"
            />
            <h1 className="text-2xl font-bold text-gray-800">ERTH Clothing</h1>
          </div>
          <div className="flex justify-between items-start">
            <div className="text-right">
              {fatoura && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">رقم الفاتورة: {fatoura}</span>
                </p>
              )}
              {orderId && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">رقم الطلب: {orderId}</span>
                </p>
              )}
              {formattedDate && (
                <p className="text-xs text-gray-600">
                  التاريخ: {formattedDate}
                </p>
              )}
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-gray-800">فاتورة مبيعات</h2>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
            معلومات العميل
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {customerName && (
              <div className="py-1 px-2 text-right border-l border-gray-300">
                <span className="text-gray-600">الاسم: </span>
                <span className="font-semibold">{customerName}</span>
              </div>
            )}
            {customerPhone && (
              <div className="py-1 px-2 text-right">
                <span className="text-gray-600">الهاتف: </span>
                <span className="font-semibold">{customerPhone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        {shelfProducts.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
              المنتجات
            </h3>
            <table className="w-full text-xs border border-gray-700 border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-1 px-2 text-center border border-gray-700 w-12">#</th>
                  <th className="py-1 px-2 text-right border border-gray-700">المنتج</th>
                  <th className="py-1 px-2 text-center border border-gray-700 w-20">الكمية</th>
                  <th className="py-1 px-2 text-right border border-gray-700 w-24">سعر الوحدة</th>
                  <th className="py-1 px-2 text-right border border-gray-700 w-24">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {shelfProducts.map((p, idx) => (
                  <tr key={idx} className="even:bg-gray-50">
                    <td className="py-1 px-2 text-center border border-gray-700">{idx + 1}</td>
                    <td className="py-1 px-2 text-right border border-gray-700">
                      {p.product_type} - {p.brand}
                    </td>
                    <td className="py-1 px-2 text-center border border-gray-700">{p.quantity}</td>
                    <td className="py-1 px-2 text-right border border-gray-700">{fmt(p.unit_price)} د.ك</td>
                    <td className="py-1 px-2 text-right border border-gray-700">{fmt(p.quantity * p.unit_price)} د.ك</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
            إجمالي الرسوم
          </h3>
          <div className="bg-gray-50 p-3 border border-gray-700 space-y-1 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-700">
              <span className="font-semibold">{fmt(totalDue)} د.ك</span>
              <span className="font-semibold">الإجمالي</span>
            </div>
            {discountValue > 0 && (
              <>
                <div className="flex justify-between py-1">
                  <span className="font-semibold">
                    - {fmt(discountValue)} د.ك
                  </span>
                  <span className="text-gray-700">الخصم</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-semibold">
                    {fmt(totalDue - discountValue)} د.ك
                  </span>
                  <span className="text-gray-700">بعد الخصم</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-1">
              <span className="font-semibold">{fmt(paid)} د.ك</span>
              <span className="text-gray-700">المدفوع</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-700">
              <span className="font-bold">
                {fmt(balance < 0 ? 0 : balance)} د.ك
              </span>
              <span className="font-bold">المتبقي</span>
            </div>
            {paymentType && (
              <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-2 text-xs">
                <div className="py-1 px-2 text-right border-l border-gray-300">
                  <span className="text-gray-600">طريقة الدفع: </span>
                  <span className="font-semibold">{getPaymentLabel()}</span>
                </div>
                {paymentRefNo && (
                  <div className="py-1 px-2 text-right">
                    <span className="text-gray-600">رقم المرجع: </span>
                    <span className="font-semibold">{paymentRefNo}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Terms */}
        <div className="mt-4 pt-3 border-t border-gray-700">
          <h4 className="text-xs font-semibold text-gray-800 mb-2 text-center">
            الملاحظات والشروط
          </h4>
          <ul className="text-right text-gray-700 text-[10px] leading-relaxed space-y-1">
            <li>• البضاعة المباعة لا ترد ولا تستبدل بعد خروجها من المعرض.</li>
            <li>• يرجى التأكد من سلامة القطع قبل الاستلام.</li>
            <li>• يتم سداد المبلغ كاملاً عند الشراء.</li>
          </ul>
          <p className="text-center text-xs text-gray-600 mt-3 font-semibold">
            شكراً لاختياركم ERTH Clothing
          </p>
        </div>
      </div>
    );
  },
);

SalesInvoice.displayName = "SalesInvoice";
