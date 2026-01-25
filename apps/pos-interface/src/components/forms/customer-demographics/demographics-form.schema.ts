import { z } from 'zod';

export const customerDemographicsSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  nick_name: z.string().optional().nullable(),
  arabic_name: z.string().optional().nullable(),
  arabic_nickname: z.string().optional().nullable(),
  country_code: z.string().optional().nullable(),
  alternate_mobile: z.string().optional().nullable(),
  whatsapp: z.boolean().default(false),
  whatsapp_alt: z.boolean().default(false),
  email: z.string().email().optional().nullable().or(z.literal('')),
  insta_id: z.string().optional().nullable(),

  // Address
  city: z.string().optional().nullable(),
  block: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  house_no: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  address_note: z.string().optional().nullable(),

  // Demographics
  nationality: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  customer_segment: z.string().optional().nullable(),
  account_type: z.enum(['Primary', 'Secondary']).optional().nullable(),
  relation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CustomerDemographicsSchema = z.infer<typeof customerDemographicsSchema>;

export const customerDemographicsDefaults: CustomerDemographicsSchema = {
  name: '',
  phone: '',
  nick_name: '',
  arabic_name: '',
  arabic_nickname: '',
  country_code: '+965',
  alternate_mobile: '',
  whatsapp: false,
  whatsapp_alt: false,
  email: '',
  insta_id: '',
  city: '',
  block: '',
  street: '',
  house_no: '',
  area: '',
  address_note: '',
  nationality: 'Kuwait',
  dob: '',
  customer_segment: 'Low',
  account_type: 'Primary',
  relation: '',
  notes: '',
};
