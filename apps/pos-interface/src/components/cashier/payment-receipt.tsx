import * as React from "react";
import ErthLogo from "@/assets/erth-light.svg";
import SakkbaLogo from "@/assets/Sakkba.png";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

export interface ReceiptGarment {
    garment_type: string;
    style?: string;
    collar_type?: string;
    collar_button?: string;
    cuffs_type?: string;
    jabzour_1?: string;
    jabzour_thickness?: string;
    fabric_length?: number;
    fabric_name?: string;
    express?: boolean;
    fabric_price_snapshot?: number;
    stitching_price_snapshot?: number;
    style_price_snapshot?: number;
}

export interface ReceiptShelfItem {
    name: string;
    brand?: string;
    quantity: number;
    unit_price: number;
}

export interface PaymentReceiptData {
    orderId: number;
    invoiceDisplay?: string;
    orderDate?: string;
    orderType?: "WORK" | "SALES";
    homeDelivery?: boolean;
    customerName?: string;
    customerPhone?: string;
    transactionAmount: number;
    transactionType: "payment" | "refund";
    paymentType: string;
    paymentRefNo?: string;
    orderTotal: number;
    totalPaid: number;
    remainingBalance: number;
    discountValue?: number;
    cashierName?: string;
    timestamp: string;
    garments?: ReceiptGarment[];
    shelfItems?: ReceiptShelfItem[];
}

/* ---------- Arabic Mappings (same as OrderInvoice) ---------- */
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

const collarMap: Record<string, string> = {
    COL_QALLABI: "قلابي",
    COL_JAPANESE: "ياباني",
    COL_DOWN_COLLAR: "عادي",
};
const jabzourMap: Record<string, string> = {
    JAB_BAIN_MURABBA: "بين مربع",
    JAB_MAGFI_MURABBA: "مغفي مربع",
    JAB_BAIN_MUSALLAS: "بين مثلث",
    JAB_MAGFI_MUSALLAS: "مغفي مثلث",
    JAB_SHAAB: "شعاب",
};
const cuffMap: Record<string, string> = {
    CUF_DOUBLE_GUMSHA: "دبل كمشة",
    CUF_MURABBA_KABAK: "مربع كبك",
    CUF_MUSALLAS_KABBAK: "مثلث كبك",
    CUF_MUDAWAR_KABBAK: "مدور كبك",
    CUF_NO_CUFF: "بدون",
};
const thicknessMap: Record<string, string> = {
    SINGLE: "خط واحد",
    DOUBLE: "خطين",
    TRIPLE: "ثلاثي",
    "NO HASHWA": "بدون",
};

const fmt = (n: number): string => Number(n.toFixed(3)).toString();

const COL_ORDER: ArabicKey[] = [
    "#", "الإجمالي", "خدمة التوصيل", "استعجال", "بروفه",
    "القماش", "عدد الأمتار", "الخط الجانبي", "بزمات",
    "الجبزور", "الحشوات", "الغولة", "الموديل",
];

export const PaymentReceipt = React.forwardRef<HTMLDivElement, { data: PaymentReceiptData }>(
    ({ data }, ref) => {
        const isErth = document.documentElement.classList.contains("erth");
        const brandName = isErth ? "ERTH" : "Sakkba";

        const formattedDate = parseUtcTimestamp(data.timestamp).toLocaleDateString("ar-KW", {
            timeZone: TIMEZONE,
            year: "numeric",
            month: "long",
            day: "numeric",
        });

        const paymentLabel =
            PAYMENT_TYPE_LABELS[data.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || data.paymentType;

        const garments = data.garments || [];
        const shelfItems = data.shelfItems || [];
        const discountValue = data.discountValue || 0;

        /* ---------- Build garment table rows (same structure as OrderInvoice) ---------- */
        type Row = Record<ArabicKey, React.ReactNode>;

        const rows: Row[] = React.useMemo(() => {
            return garments.map((g, idx) => {
                const model = g.style === "kuwaiti" ? "كلاسيك" : "ديزاين";
                const collar = collarMap[g.collar_type || ""] || "عادي";
                const buttons = g.collar_button === "COL_TABBAGI" ? "تبقي" : g.collar_button === "COL_ARAVI_ZARRAR" ? "زرار عربي" : "زرارات";
                const jabzour = jabzourMap[g.jabzour_1 || ""] || "بدون";
                const cuff = cuffMap[g.cuffs_type || ""] || "عادي";
                const thickness = thicknessMap[g.jabzour_thickness || ""] || "خط واحد";

                return {
                    "#": idx + 1,
                    الموديل: model,
                    الغولة: collar,
                    الحشوات: cuff,
                    الجبزور: jabzour,
                    بزمات: buttons,
                    "الخط الجانبي": thickness,
                    "عدد الأمتار": fmt(g.fabric_length || 0),
                    القماش: g.fabric_name || "غير محدد",
                    بروفه: g.garment_type === "brova" ? "نعم" : "لا",
                    استعجال: g.express ? "نعم" : "لا",
                    "خدمة التوصيل": data.homeDelivery ? "منزلي" : "استلام",
                    الإجمالي: `${fmt((g.stitching_price_snapshot || 0) + (g.fabric_price_snapshot || 0) + (g.style_price_snapshot || 0))} د.ك`,
                };
            });
        }, [garments, data.homeDelivery]);

        return (
            <div
                ref={ref}
                className="bg-white text-black p-6 max-w-5xl mx-auto text-sm print:bg-white print:text-black"
                style={{ direction: "rtl", fontFamily: "'Cairo', 'IBM Plex Sans Arabic', sans-serif" }}
            >
                {/* Header */}
                <div className="mb-4 pb-3 border-b border-gray-700">
                    <div className="text-center mb-3">
                        <img src={isErth ? ErthLogo : SakkbaLogo} alt={brandName} className="h-16 mx-auto mb-2" />
                        <h1 className="text-2xl font-bold text-gray-800">{brandName} Clothing</h1>
                    </div>
                    <div className="flex justify-between items-start">
                        <div className="text-right">
                            {data.invoiceDisplay && (
                                <p className="text-xs text-gray-600">
                                    <span className="font-semibold">رقم الفاتورة: {data.invoiceDisplay}</span>
                                </p>
                            )}
                            <p className="text-xs text-gray-600">
                                <span className="font-semibold">رقم الطلب: {data.orderId}</span>
                            </p>
                            <p className="text-xs text-gray-600">التاريخ: {formattedDate}</p>
                        </div>
                        <div className="text-left">
                            <h2 className="text-xl font-bold text-gray-800">
                                {data.transactionType === "refund" ? "ايصال استرجاع" : "ايصال دفع"}
                            </h2>
                        </div>
                    </div>
                </div>

                {/* Customer Information */}
                {(data.customerName || data.customerPhone) && (
                    <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
                            معلومات العميل
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {data.customerName && (
                                <div className="py-1 px-2 text-right border-l border-gray-300">
                                    <span className="text-gray-600">الاسم: </span>
                                    <span className="font-semibold">{data.customerName}</span>
                                </div>
                            )}
                            {data.customerPhone && (
                                <div className="py-1 px-2 text-right">
                                    <span className="text-gray-600">الهاتف: </span>
                                    <span className="font-semibold">{data.customerPhone}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Garment Table (same as OrderInvoice) */}
                {rows.length > 0 && (
                    <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
                            بنود الطلب
                        </h3>
                        <table className="w-full text-xs border border-gray-700 border-collapse">
                            <thead className="bg-gray-100">
                                <tr>
                                    {COL_ORDER.map((k) => (
                                        <th key={k} className="py-1 px-2 text-right border border-gray-700">
                                            {ARABIC_HEADERS[k]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={idx} className="even:bg-gray-50">
                                        {COL_ORDER.map((k) => (
                                            <td key={k} className="py-1 px-2 text-right border border-gray-700">
                                                {row[k]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Shelf Products Table (same as OrderInvoice) */}
                {shelfItems.length > 0 && (
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
                                {shelfItems.map((item, idx) => (
                                    <tr key={idx} className="even:bg-gray-50">
                                        <td className="py-1 px-2 text-center border border-gray-700">{idx + 1}</td>
                                        <td className="py-1 px-2 text-right border border-gray-700">
                                            {item.name}{item.brand ? ` - ${item.brand}` : ""}
                                        </td>
                                        <td className="py-1 px-2 text-center border border-gray-700">{item.quantity}</td>
                                        <td className="py-1 px-2 text-right border border-gray-700">{fmt(item.unit_price)} د.ك</td>
                                        <td className="py-1 px-2 text-right border border-gray-700">{fmt(item.quantity * item.unit_price)} د.ك</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Totals (same layout as OrderInvoice) */}
                <div className="mb-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-700">
                        إجمالي الرسوم
                    </h3>
                    <div className="bg-gray-50 p-3 border border-gray-700 space-y-1 text-xs">
                        <div className="flex justify-between py-1 border-b border-gray-700">
                            <span className="font-semibold">{fmt(data.orderTotal)} د.ك</span>
                            <span className="font-semibold">الإجمالي</span>
                        </div>
                        {discountValue > 0 && (
                            <>
                                <div className="flex justify-between py-1">
                                    <span className="font-semibold">- {fmt(discountValue)} د.ك</span>
                                    <span className="text-gray-700">الخصم</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="font-semibold">{fmt(data.orderTotal - discountValue)} د.ك</span>
                                    <span className="text-gray-700">بعد الخصم</span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between py-1">
                            <span className="font-semibold">{fmt(data.totalPaid)} د.ك</span>
                            <span className="text-gray-700">المدفوع</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-700">
                            <span className="font-bold">{fmt(Math.max(0, data.remainingBalance))} د.ك</span>
                            <span className="font-bold">المتبقي</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-700 grid grid-cols-2 gap-2 text-xs">
                            <div className="py-1 px-2 text-right border-l border-gray-300">
                                <span className="text-gray-600">طريقة الدفع: </span>
                                <span className="font-semibold">{paymentLabel}</span>
                            </div>
                            {data.paymentRefNo && (
                                <div className="py-1 px-2 text-right">
                                    <span className="text-gray-600">رقم المرجع: </span>
                                    <span className="font-semibold">{data.paymentRefNo}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Terms (same as OrderInvoice) */}
                <div className="mt-4 pt-3 border-t border-gray-700">
                    <h4 className="text-xs font-semibold text-gray-800 mb-2 text-center">
                        الملاحظات والشروط
                    </h4>
                    {data.orderType === "SALES" ? (
                        <ul className="text-right text-gray-700 text-xs leading-relaxed space-y-1">
                            <li>• البضاعة المباعة لا ترد ولا تستبدل بعد خروجها من المعرض.</li>
                            <li>• يرجى التأكد من سلامة القطع قبل الاستلام.</li>
                            <li>• يتم سداد المبلغ كاملاً عند الشراء.</li>
                        </ul>
                    ) : (
                        <ul className="text-right text-gray-700 text-xs leading-relaxed space-y-1">
                            <li>• سيتم التواصل معك لتحديد موعد البروفة.</li>
                            <li>• التأخير عن البروفة يؤخر موعد التسليم.</li>
                            <li>• أي تعديل بعد اعتماد البروفة يُحسب برسوم.</li>
                            <li>• يجب سداد ٥٠٪ من مبلغ الفاتورة على الأقل.</li>
                            <li>• لا يتم التسليم إلا بعد سداد المبلغ كاملاً.</li>
                            <li>• تأخير الاستلام النهائي لأكثر من شهر من جاهزية الطلب لا يلزم الشركة بتغيير المقاسات.</li>
                            <li>• خدمة الاستعجال متوفرة برسوم إضافية عند الطلب.</li>
                        </ul>
                    )}
                    <p className="text-center text-xs text-gray-600 mt-3 font-semibold">
                        شكراً لاختياركم {brandName} Clothing
                    </p>
                </div>
            </div>
        );
    }
);

PaymentReceipt.displayName = "PaymentReceipt";
