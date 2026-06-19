import * as React from "react";
import { getInvoiceBrand } from "./brand";
import { collarAr, jabzourAr, cuffAr, hashwaAr, linesAr, modelAr } from "@/lib/style-labels";
import type { FabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { type StyleOptionsSchema } from "@/components/forms/fabric-selection-and-options/style-options/style-options-form.schema";
import type { ShelfFormValues } from "@/components/forms/shelf/shelf-form.schema";
import type { Fabric, Style } from "@repo/database";
import { displaySoakHours, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

export interface InvoiceData {
  orderId?: string | number;
  fatoura?: number;
  // Invoice revision (SPEC §3). 0 = the original invoice (printed with no
  // suffix); a price change (refund / brova-trial style reprice) mints
  // revision N (≥1), printed as `<fatoura>-R<N>`. Absent → original.
  invoiceRevision?: number;
  orderDate?: string;
  homeDelivery?: boolean;
  checkoutStatus?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: {
    city?: string;
    area?: string;
    block?: string;
    street?: string;
    house_no?: string;
  };
  fabricSelections?: FabricSelectionSchema[];
  // collar_position is a body measurement now — sourced from the order's
  // measurement, not per-garment. Optional: when absent, no up/down annotation.
  measurement?: { collar_position?: "up" | "down" | null } | null;
  styleOptions?: StyleOptionsSchema[];
  shelfProducts?: ShelfFormValues["products"];
  fabrics?: Fabric[];
  styles?: Style[];
  charges?: {
    fabric: number;
    stitching: number;
    style: number;
    delivery: number;
    shelf: number;
    express?: number;
    soaking?: number;
  };
  discountType?: string;
  discountValue?: number;
  discountPercentage?: number;
  advance?: number;
  paid: number;
  paymentType?: string;
  otherPaymentType?: string;
  paymentRefNo?: string;
  orderTaker?: string;
  // Customer signature captured during fabric selection. A freshly-drawn data
  // URL (new order) or an uploaded storage URL (reprints). Absent for SALES.
  customerSignatureUrl?: string;
}

export interface OrderInvoiceProps {
  data: InvoiceData;
}

/* ---------- Strict Arabic Mappings ---------- */
type ArabicKey =
  | "#"
  | "الموديل"
  | "الغولة"
  | "الحشوات"
  | "الجبزور"
  | "بزمات"
  | "الخط الجانبي"
  | "عدد الأمتار"
  | "القماش"
  | "بروفه"
  | "استعجال"
  | "نقع"
  | "خدمة التوصيل"
  | "الإجمالي";

const ARABIC_HEADERS: Record<ArabicKey, string> = {
  "#": "#",
  الموديل: "الموديل",
  الغولة: "الغولة",
  الحشوات: "الحشوات",
  الجبزور: "الجبزور",
  بزمات: "بزمات",
  "الخط الجانبي": "الخط الجانبي",
  "عدد الأمتار": "عدد الأمتار",
  القماش: "القماش",
  بروفه: "بروفه",
  استعجال: "استعجال",
  نقع: "نقع",
  "خدمة التوصيل": "خدمة التوصيل",
  الإجمالي: "الإجمالي",
};

/* ---------- Helpers ---------- */
const getFabricName = (fabricId: string, fabrics: Fabric[]): string => {
  const f = fabrics.find((x) => x.id.toString() === fabricId.toString());
  return f?.name || "غير محدد";
};

const fmt = (n: number): string => Number(n.toFixed(3)).toString();

export const OrderInvoice = React.forwardRef<HTMLDivElement, OrderInvoiceProps>(
  ({ data }, ref) => {
    const {
      orderId,
      fatoura,
      invoiceRevision,
      orderDate,
      homeDelivery,
      customerName,
      customerPhone,
      fabricSelections = [],
      measurement,
      shelfProducts = [],
      fabrics = [],
      charges,
      discountValue = 0,
      paid,
      paymentType,
      otherPaymentType,
      paymentRefNo,
      customerSignatureUrl,
    } = data;

    // Original invoice (revision 0) prints with no suffix; a revision (≥1) as
    // `<fatoura>-R<N>` (SPEC §3).
    const fatouraDisplay =
      fatoura != null
        ? `${fatoura}${invoiceRevision && invoiceRevision > 0 ? `-R${invoiceRevision}` : ""}`
        : null;

    const totalDue = charges
      ? Object.values(charges).reduce((acc, v) => acc + (v || 0), 0)
      : 0;
    const finalAmount = totalDue - discountValue;
    const balance = finalAmount - paid;

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
      if (paymentType === "k-net") return "كي-نت";
      if (paymentType === "cash") return "نقدي";
      if (paymentType === "link-payment") return "دفع رابط";
      if (paymentType === "installments") return "تقسيط";
      return paymentType || "";
    };

    /* ---------- Build Table Rows ---------- */
    type Row = Record<ArabicKey, React.ReactNode>;

    const rows: Row[] = React.useMemo(() => {
      return (fabricSelections || []).map((sel, idx) => {
        const model = modelAr[sel.style || ""] || modelAr.kuwaiti;
        const collarBase = collarAr[sel.collar_type || ""] || "عادي";
        const collarPos = measurement?.collar_position === "up" ? " (أعلى)" : measurement?.collar_position === "down" ? " (أسفل)" : "";
        const collar = `${collarBase}${collarPos}`;
        const jabzour = jabzourAr[sel.jabzour_1 || ""] || "بدون";
        const cuff = cuffAr[sel.cuffs_type || ""] || "بدون بزمة";
        const hashwa = hashwaAr[sel.jabzour_thickness || ""] || "بدون حشوة";
        const sideLines = linesAr[sel.lines === 2 ? 2 : 1];
        const fabricName = getFabricName(String(sel.fabric_id || ""), fabrics);

        return {
          "#": idx + 1,
          الموديل: model,
          الغولة: collar,
          الحشوات: hashwa,
          الجبزور: jabzour,
          بزمات: cuff,
          "الخط الجانبي": sideLines,
          "عدد الأمتار": fmt(sel.fabric_length || 0),
          القماش: fabricName,
          بروفه: sel.garment_type === "brova" ? "نعم" : "لا",
          استعجال: sel.express ? "نعم" : "لا",
          نقع: sel.soaking ? (sel.soaking_hours ? `${displaySoakHours(sel.soaking_hours)} س` : "نعم") : "لا",
          "خدمة التوصيل": homeDelivery ? "منزلي" : "استلام",
          الإجمالي: `${fmt((sel.stitching_price_snapshot || 0) + (sel.fabric_amount || 0) + (sel.style_price_snapshot || 0))} د.ك`,
        };
      });
    }, [fabricSelections, measurement, fabrics, homeDelivery]);

    const brand = getInvoiceBrand();

    return (
      <div
        ref={ref}
        className="bg-white text-black p-3 max-w-5xl mx-auto text-sm leading-tight print:bg-white print:text-black"
        style={{ direction: "rtl", fontFamily: "'Cairo', 'IBM Plex Sans Arabic', sans-serif" }}
      >
        {/* Header — horizontal: logo + brand on one side, invoice meta on the
            other, so 10 garments + shelf items still fit on a single page. */}
        <div className="mb-2 pb-1.5 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={brand.logo}
              alt={`${brand.name} Clothing`}
              className="h-9"
            />
            <div>
              <h1 className="text-base font-bold text-gray-800 leading-none">{brand.name} Clothing</h1>
              <h2 className="text-sm font-bold text-gray-800 leading-tight">فاتورة شراء</h2>
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
        {rows.length > 0 && (
          <div className="mb-1.5">
            <h3 className="text-[11px] font-semibold text-gray-800 mb-1 pb-0.5 border-b border-gray-700">
              بنود الطلب
            </h3>
            <table className="w-full text-[10px] leading-tight border border-gray-700 border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  {(
                    [
                      "#",
                      "الإجمالي",
                      "خدمة التوصيل",
                      "نقع",
                      "استعجال",
                      "بروفه",
                      "القماش",
                      "عدد الأمتار",
                      "الخط الجانبي",
                      "بزمات",
                      "الجبزور",
                      "الحشوات",
                      "الغولة",
                      "الموديل",
                    ] as ArabicKey[]
                  ).map((k) => (
                    <th
                      key={k}
                      className="py-0.5 px-1.5 text-right border border-gray-700"
                    >
                      {ARABIC_HEADERS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="even:bg-gray-50">
                    {(
                      [
                        "#",
                        "الإجمالي",
                        "خدمة التوصيل",
                        "نقع",
                        "استعجال",
                        "بروفه",
                        "القماش",
                        "عدد الأمتار",
                        "الخط الجانبي",
                        "بزمات",
                        "الجبزور",
                        "الحشوات",
                        "الغولة",
                        "الموديل",
                      ] as ArabicKey[]
                    ).map((k) => (
                      <td
                        key={k}
                        className="py-0.5 px-1.5 text-right border border-gray-700"
                      >
                        {row[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Shelf Products Table */}
        {shelfProducts && shelfProducts.length > 0 && (
          <div className="mb-1.5">
            <h3 className="text-[11px] font-semibold text-gray-800 mb-1 pb-0.5 border-b border-gray-700">
              المنتجات الجاهزة
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

        {/* Customer Signature */}
        {customerSignatureUrl && (
          <div className="mb-1.5">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-semibold text-gray-800">توقيع العميل</span>
              <div className="h-12 w-36 border border-gray-700 rounded flex items-center justify-center overflow-hidden bg-white">
                <img
                  src={customerSignatureUrl}
                  alt="توقيع العميل"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        )}

        {/* Terms — two columns so the seven clauses stay compact on one page. */}
        <div className="mt-2 pt-1.5 border-t border-gray-700">
          <h4 className="text-[10px] font-semibold text-gray-800 mb-1 text-center">
            الملاحظات والشروط
          </h4>
          <ul className="grid grid-cols-2 gap-x-4 text-right text-gray-700 text-[10px] leading-snug space-y-0.5">
            <li>• سيتم التواصل معك لتحديد موعد البروفة.</li>
            <li>• التأخير عن البروفة يؤخر موعد التسليم.</li>
            <li>• أي تعديل بعد اعتماد البروفة يُحسب برسوم.</li>
            <li>• يجب سداد ٥٠٪ من مبلغ الفاتورة على الأقل.</li>
            <li>• لا يتم التسليم إلا بعد سداد المبلغ كاملاً.</li>
            <li>
              • تأخير الاستلام النهائي لأكثر من شهر من جاهزية الطلب لا يلزم
              الشركة بتغيير المقاسات.
            </li>
            <li>• خدمة الاستعجال متوفرة برسوم إضافية عند الطلب.</li>
          </ul>
          <p className="text-center text-[10px] text-gray-600 mt-1.5 font-semibold">
            شكراً لاختياركم {brand.name} Clothing
          </p>
        </div>
      </div>
    );
  },
);

OrderInvoice.displayName = "OrderInvoice";