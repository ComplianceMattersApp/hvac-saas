import {
  normalizeFullName,
  normalizePhone10,
  isSameCustomerByNamePhone,
} from "./duplicate";

export async function findOrCreateCustomer(params: {
  supabase: any;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const { supabase, firstName, lastName, phone, email } = params;

  const inputFullName = normalizeFullName(firstName ?? "", lastName ?? "");
  const inputPhone10 = normalizePhone10(phone ?? "");
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  // Try to reuse existing customer by (name + phone)
  if (inputPhone10) {
    const digits = inputPhone10; // already last-10 digits
const a = digits.slice(0, 3);
const p = digits.slice(3, 6);
const l = digits.slice(6);

const patternDigits = `%${digits}%`;
const patternGrouped = `%${a}%${p}%${l}%`; // matches dashes/spaces/parentheses

let query = supabase
  .from("customers")
  .select("id, first_name, last_name, full_name, phone, owner_user_id")
  .or(`phone.ilike.${patternDigits},phone.ilike.${patternGrouped}`)
  .limit(25);

if (userId) {
  query = query.eq("owner_user_id", userId);
}

const { data: candidates, error } = await query;

    if (error) throw error;

const match = (candidates ?? []).find((c: any) => {
  const cPhone10 = normalizePhone10(c.phone);
  return cPhone10 === inputPhone10;
});

    if (match?.id) {
      return { customerId: match.id as string, reused: true };
    }
  }

  // No match → create
  const { data: customer, error: insertErr } = await supabase
    .from("customers")
    .insert({
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null,
      phone: phone || null,
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;

  return { customerId: customer.id as string, reused: false };
}