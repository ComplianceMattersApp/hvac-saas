-- Compliance Matters: pricebook items starter seed
-- Purpose: seed a starter set of common HVAC pricebook items for each
-- provisioned account that does not already have starter items.
--
-- Idempotency contract:
--   Each item is inserted only if no row with the same account_owner_user_id +
--   item_name + is_starter = true already exists. This avoids duplicate seeding
--   without requiring a unique constraint on those columns.
--
-- Target: all rows in public.internal_business_profiles (one per provisioned account).
--   To seed a specific account only, add:
--     AND ibp.account_owner_user_id = '<target-uuid>'
--   to each WHERE NOT EXISTS clause.
--
-- Scope: Pricebook domain only. No existing tables are altered.
-- No hard delete in V1. Starter items may be edited or deactivated by the account.

BEGIN;

-- 1. Service Call
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Service Call',
  'service',
  'HVAC - General',
  'Standard service call fee.',
  95.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Service Call'
    AND pi.is_starter = true
);

-- 2. Diagnostic Fee
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Diagnostic Fee',
  'diagnostic',
  'HVAC - General',
  'System diagnostic / inspection fee.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Diagnostic Fee'
    AND pi.is_starter = true
);

-- 3. Preventive Maintenance - Residential
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Preventive Maintenance - Residential',
  'service',
  'HVAC - Maintenance',
  'Residential HVAC preventive maintenance visit.',
  150.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Preventive Maintenance - Residential'
    AND pi.is_starter = true
);

-- 4. Preventive Maintenance - Commercial
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Preventive Maintenance - Commercial',
  'service',
  'HVAC - Maintenance',
  'Commercial HVAC preventive maintenance visit.',
  250.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Preventive Maintenance - Commercial'
    AND pi.is_starter = true
);

-- 5. Refrigerant R-410A (per lb)
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Refrigerant R-410A (per lb)',
  'material',
  'Refrigerant',
  'R-410A refrigerant, priced per pound. Update to your current rate.',
  0.00,
  'lb',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Refrigerant R-410A (per lb)'
    AND pi.is_starter = true
);

-- 6. Filter Replacement
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Filter Replacement',
  'material',
  'Parts',
  'Air filter replacement. Update to your stocked filter price.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Filter Replacement'
    AND pi.is_starter = true
);

-- 7. Thermostat (Standard)
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Thermostat (Standard)',
  'material',
  'Parts',
  'Standard thermostat supply and installation. Update to your price.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Thermostat (Standard)'
    AND pi.is_starter = true
);

-- 8. Capacitor Replacement
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Capacitor Replacement',
  'service',
  'HVAC - Repair',
  'Run/start capacitor replacement, parts and labor.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Capacitor Replacement'
    AND pi.is_starter = true
);

-- 9. Contactor Replacement
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Contactor Replacement',
  'service',
  'HVAC - Repair',
  'Contactor replacement, parts and labor.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Contactor Replacement'
    AND pi.is_starter = true
);

-- 10. ECC / Title 24 Test
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'ECC / Title 24 Test',
  'diagnostic',
  'Compliance',
  'Energy Code Compliance / Title 24 diagnostic test.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'ECC / Title 24 Test'
    AND pi.is_starter = true
);

-- 11. Labor (hourly)
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Labor (hourly)',
  'service',
  'Labor',
  'Technician labor, billed per hour. Update to your labor rate.',
  0.00,
  'hr',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Labor (hourly)'
    AND pi.is_starter = true
);

-- 12. Discount / Adjustment
INSERT INTO public.pricebook_items
  (account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active, is_starter)
SELECT
  ibp.account_owner_user_id,
  'Discount / Adjustment',
  'adjustment',
  'Adjustments',
  'Pricing discount or correction. Enter as a negative value if applicable.',
  0.00,
  'each',
  true,
  true
FROM public.internal_business_profiles ibp
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricebook_items pi
  WHERE pi.account_owner_user_id = ibp.account_owner_user_id
    AND pi.item_name = 'Discount / Adjustment'
    AND pi.is_starter = true
);

COMMIT;
