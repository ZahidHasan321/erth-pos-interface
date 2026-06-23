import { z } from 'zod';

export const customerDemographicsSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  nick_name: z.string().optional().nullable(),
  arabic_name: z.string().optional().nullable(),
  arabic_nickname: z.string().optional().nullable(),
  country_code: z.string().optional().nullable(),
  alternative_country_code: z.string().optional().nullable(),
  alternate_mobile: z.string().optional().nullable(),
  whatsapp: z.boolean().default(true),
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
  // The linked Primary for a Secondary account (SPEC §5). The link is this FK,
  // not a shared phone number.
  primary_customer_id: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
}).superRefine((val, ctx) => {
  // A Secondary must carry a linked Primary and a relation; a Primary carries
  // neither (the mapper nulls primary_customer_id for a Primary).
  if (val.account_type === 'Secondary') {
    if (!val.primary_customer_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primary_customer_id'],
        message: 'Select the primary account this customer is linked to',
      });
    }
    if (!val.relation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relation'],
        message: 'Relation is required for a secondary account',
      });
    }
  }
});

export type CustomerDemographicsSchema = z.infer<typeof customerDemographicsSchema>;

export const customerDemographicsDefaults: CustomerDemographicsSchema = {
  name: '',
  phone: '',
  nick_name: '',
  arabic_name: '',
  arabic_nickname: '',
  country_code: '+965',
  alternative_country_code: '+965',
  alternate_mobile: '',
  whatsapp: true,
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
  primary_customer_id: null,
  notes: '',
};
