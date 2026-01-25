import type { Customer } from "@repo/database";
import { type CustomerDemographicsSchema } from "./demographics-form.schema";

/**
 * Direct mapping from Customer (DB) to Form Values
 */
export function mapCustomerToFormValues(customer: Customer): Partial<CustomerDemographicsSchema> {
    return {
        id: customer.id,
        name: customer.name || "",
        nick_name: customer.nick_name || "",
        arabic_name: customer.arabic_name || "",
        arabic_nickname: customer.arabic_nickname || "",
        country_code: customer.country_code || "",
        phone: customer.phone || "",
        alternate_mobile: customer.alternate_mobile || "",
        whatsapp: customer.whatsapp || false,
        insta_id: customer.insta_id || "",
        email: customer.email || "",
        nationality: customer.nationality || "",
        city: customer.city || "",
        area: customer.area || "",
        block: customer.block || "",
        street: customer.street || "",
        house_no: customer.house_no || "",
        address_note: customer.address_note || "",
        dob: customer.dob ? new Date(customer.dob).toISOString() : undefined,
        account_type: (customer.account_type as any) || "Primary",
        customer_segment: customer.customer_segment || "",
        notes: customer.notes || "",
        whatsapp_alt: customer.whatsapp_alt || false,
        relation: customer.relation || undefined,
    };
}

/**
 * Direct mapping from Form Values to Customer (DB)
 */
export function mapFormValuesToCustomer(formValues: CustomerDemographicsSchema): Partial<Customer> {
    const cleanValue = (val: any) => (val === "" || val === undefined ? null : val);

    return {
        name: formValues.name,
        nick_name: cleanValue(formValues.nick_name),
        arabic_name: cleanValue(formValues.arabic_name),
        arabic_nickname: cleanValue(formValues.arabic_nickname),
        country_code: cleanValue(formValues.country_code),
        phone: formValues.phone,
        alternate_mobile: cleanValue(formValues.alternate_mobile),
        whatsapp: formValues.whatsapp,
        insta_id: cleanValue(formValues.insta_id),
        email: cleanValue(formValues.email),
        nationality: cleanValue(formValues.nationality),
        city: cleanValue(formValues.city),
        area: cleanValue(formValues.area),
        block: cleanValue(formValues.block),
        street: cleanValue(formValues.street),
        house_no: cleanValue(formValues.house_no),
        address_note: cleanValue(formValues.address_note),
        dob: formValues.dob && formValues.dob !== "" ? new Date(formValues.dob) : null,
        account_type: formValues.account_type as any,
        customer_segment: cleanValue(formValues.customer_segment),
        notes: cleanValue(formValues.notes),
        whatsapp_alt: formValues.whatsapp_alt,
        relation: cleanValue(formValues.relation),
    };
}
