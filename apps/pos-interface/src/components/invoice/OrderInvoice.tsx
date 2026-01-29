import * as React from "react";
import ErthLogo from "@/assets/erth-light.svg";
import type { FabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { type StyleOptionsSchema } from "@/components/forms/fabric-selection-and-options/style-options/style-options-form.schema";
import type { ShelfFormValues } from "@/components/forms/shelf/shelf-form.schema";
import type { Fabric, Style } from "@repo/database";

export interface InvoiceData {
  orderId?: string | number;
  fatoura?: number;
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
      orderDate,
      homeDelivery,
      customerName,
      customerPhone,
      fabricSelections = [],
      styleOptions = [],
      shelfProducts = [],
      fabrics = [],
      charges,
      discountValue = 0,
      paid,
      paymentType,
      otherPaymentType,
      paymentRefNo,
    } = data;

    const totalDue = charges
      ? Object.values(charges).reduce((acc, v) => acc + (v || 0), 0)
      : 0;
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
      if (paymentType === "k-net") return "كي-نت";
      if (paymentType === "cash") return "نقدي";
      if (paymentType === "link-payment") return "دفع رابط";
      if (paymentType === "installments") return "تقسيط";
      return paymentType || "";
    };

    /* ---------- Build Table Rows ---------- */
    type Row = Record<ArabicKey, React.ReactNode>;

    const rows: Row[] = React.useMemo(() => {
      const r: Row[] = [];
      const grouped = (fabricSelections || []).reduce<
        Record<
          string,
          {
            qty: number;
            meters: number;
            fabricName: string;
            express: boolean;
            brova: boolean;
          }
        >
      >((acc, sel) => {
        const key = String(sel.fabric_id || "");
        if (!acc[key]) {
          acc[key] = {
            qty: 0,
            meters: 0,
            fabricName: getFabricName(key, fabrics),
            express: sel.express,
            brova: sel.brova,
          };
        }
        acc[key].qty += 1;
        acc[key].meters += sel.fabric_length || 0;
        return acc;
      }, {});

      Object.values(grouped).forEach((g, idx) => {
        const styleOpt = styleOptions[idx] || {};
        const isKuwaiti = styleOpt.style === "kuwaiti";
        const model = isKuwaiti ? `كلاسيك ٩` : `ديزاين ١٥`;
        const collarMap: Record<string, string> = {
          COL_QALLABI: "قلابي ٣",
          COL_JAPANESE: "ياباني",
          COL_DOWN_COLLAR: "عادي",
        };
        const collar = collarMap[styleOpt.collar?.collar_type || ""] || "عادي";
        const buttons =
          styleOpt.collar?.collar_button === "COL_TABBAGI" ? "سحاب ١" : "زرارات";
        const jabzourMap: Record<string, string> = {
          JAB_BAIN_MURABBA: "بين مربع",
          JAB_MAGFI_MURABBA: "مغفي مربع",
          JAB_SHAAB: "شعاب",
        };
        const jabzour = jabzourMap[styleOpt.jabzour?.jabzour_1 || ""] || "بدون";
        const cuffMap: Record<string, string> = {
          CUF_DOUBLE_GUMSHA: "دبل كمشة",
          CUF_NO_CUFF: "بدون",
        };
        const cuff = cuffMap[styleOpt.cuffs?.cuffs_type || ""] || "عادي";
        const thicknessMap: Record<string, string> = {
          SINGLE: "خط واحد",
          DOUBLE: "خطين",
          TRIPLE: "ثلاثي",
          "NO HASHWA": "بدون",
        };
        const thickness =
          thicknessMap[styleOpt?.jabzour?.jabzour_thickness || ""] || "خط واحد";

        r.push({
          "#": idx + 1,
          الموديل: model,
          الغولة: collar,
          الحشوات: cuff,
          الجبزور: jabzour,
          بزمات: buttons,
          "الخط الجانبي": thickness,
          "عدد الأمتار": fmt(g.meters),
          القماش: g.fabricName,
          بروفه: g.brova ? "نعم" : "لا",
          استعجال: g.express ? "نعم" : "لا",
          "خدمة التوصيل": homeDelivery ? "منزلي" : "استلام",
          الإجمالي: `${fmt((charges?.stitching || 0) + (charges?.fabric || 0))} د.ك`,
        });
      });
      return r;
    }, [fabricSelections, styleOptions, fabrics, charges, homeDelivery]);

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
              <h2 className="text-xl font-bold text-gray-800">فاتورة شراء</h2>
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
        {rows.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
              بنود الطلب
            </h3>
            <table className="w-full text-xs border border-gray-700 border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  {(
                    [
                      "#",
                      "الإجمالي",
                      "خدمة التوصيل",
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
                      className="py-1 px-2 text-right border border-gray-700"
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
                        className="py-1 px-2 text-right border border-gray-700"
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
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
              المنتجات الجاهزة
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
          <p className="text-center text-xs text-gray-600 mt-3 font-semibold">
            شكراً لاختياركم ERTH Clothing
          </p>
        </div>
      </div>
    );
  },
);

OrderInvoice.displayName = "OrderInvoice";