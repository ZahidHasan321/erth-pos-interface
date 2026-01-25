import type { Customer, AccountType } from "@/types";
import type { CustomerDemographicsSchema } from "@/components/forms/customer-demographics/demographics-form.schema";

export const mapCustomerToFormValues = (
  customer: Customer,
): Partial<CustomerDemographicsSchema> => {
  return {
    id: customer.id, 
    customerRecordId: customer.id.toString(),
    name: customer.name || "",
    nickName: customer.nick_name || "",
    arabicName: customer.arabic_name || "",
    arabicNickname: customer.arabic_nickname || "",
    countryCode: customer.country_code || "",
    mobileNumber: customer.phone || "", 
    alternativeCountryCode: "", // Not present in DB schema explicitly, might need to be split from phone or added
    alternativeMobileNumber: customer.alternate_mobile || "",
    whatsapp: customer.whatsapp || false, 
    instagram: customer.insta_id || "",
    email: customer.email || "",
    nationality: customer.nationality || "",
    address: {
      city: customer.city || "",
      area: customer.area || "",
      block: customer.block || "",
      street: customer.street || "",
      houseNumber: customer.house_no || "",
      addressNote: customer.address_note || "",
    },
    dob: customer.dob ? new Date(customer.dob) : undefined,
    accountType: customer.account_type || "",
    customerSegment: customer.customer_segment || "",
    note: customer.notes || "",
    whatsappOnAlt: customer.whatsapp_alt || false,
    relation: customer.relation || undefined,
  };
};

export const mapFormValuesToCustomer = (
  values: CustomerDemographicsSchema,
  customerId?: number | null,
): Partial<Customer> => {
  const customer: Partial<Customer> = {
      phone: values.mobileNumber,
      name: values.name,
      nick_name: values.nickName || undefined,
      arabic_name: values.arabicName || undefined,
      arabic_nickname: values.arabicNickname || undefined,
      country_code: values.countryCode,
      // AlternateCountryCode: values.alternativeCountryCode,
      alternate_mobile: values.alternativeMobileNumber,
      whatsapp: values.whatsapp || false,
      email: values.email || undefined,
      nationality: values.nationality || undefined,
      insta_id: values.instagram ? values.instagram : undefined,
      city: values.address.city || undefined,
      area: values.address.area || undefined,
      block: values.address.block || undefined,
      street: values.address.street || undefined,
      house_no: values.address.houseNumber,
      address_note: values.address.addressNote || undefined,
      dob: values.dob ? new Date(values.dob) : undefined,
      account_type: values.accountType as AccountType || undefined,
      customer_segment: values.customerSegment || undefined,
      notes: values.note || undefined,
      whatsapp_alt: values.whatsappOnAlt || false,
      relation: values.relation || undefined,
  };
  
  if (customerId) {
      customer.id = customerId;
  }
  
  return customer;
};
