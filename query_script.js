const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

function parseEnv(path) {
  const content = fs.readFileSync(path, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return env;
}

const env = parseEnv(".env.local");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("--- 1. internal_invoice_payments ---");
  const { data: payments, count: paymentsCount, error: err1 } = await supabase
    .from("internal_invoice_payments")
    .select("id,invoice_id,job_id,amount_cents,payment_method,payment_status,paid_at,recorded_by_user_id", { count: "exact" })
    .order("id", { ascending: false })
    .limit(10);
  
  if (err1) console.error("Error 1:", err1.message);
  else {
    console.log("Count:", paymentsCount);
    console.table(payments);
  }

  console.log("\n--- 2. job_events (payment_recorded) ---");
  const { data: events, error: err2 } = await supabase
    .from("job_events")
    .select("id,job_id,event_type,created_at,meta")
    .eq("event_type", "payment_recorded")
    .order("created_at", { ascending: false })
    .limit(10);

  if (err2) console.error("Error 2:", err2.message);
  else console.log(JSON.stringify(events, null, 2));

  console.log("\n--- 3. One Issued Invoice & Line Items ---");
  const { data: invoices, error: err3 } = await supabase
    .from("internal_invoices")
    .select("id,job_id,total_cents,status")
    .eq("status", "issued")
    .limit(1);

  if (err3) console.error("Error 3:", err3.message);
  else if (invoices && invoices.length > 0) {
    const inv = invoices[0];
    const { count: liCount, error: errLi } = await supabase
      .from("internal_invoice_line_items")
      .select("*", { count: "exact", head: true })
      .eq("invoice_id", inv.id);
    
    console.log({
      invoice: inv,
      line_items_count: liCount
    });
  } else {
    console.log("No issued invoices found.");
  }

  console.log("\n--- 4. Draft/Void Invoices Count ---");
  const { data: counts, error: err4 } = await supabase
    .from("internal_invoices")
    .select("status");

  if (err4) console.error("Error 4:", err4.message);
  else {
    const summary = counts.reduce((acc, curr) => {
      if (curr.status === "draft" || curr.status === "void") {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
      }
      return acc;
    }, { draft: 0, void: 0 });
    console.log(summary);
  }

  console.log("\n--- 5. internal_business_profiles & Invoices ---");
  const { data: profiles, error: err5 } = await supabase
    .from("internal_business_profiles")
    .select("*")
    .limit(1);

  if (err5) console.error("Error 5:", err5.message);
  else {
    const { data: profilesAll, error: err6 } = await supabase
      .from("internal_business_profiles")
      .select("*");

    if (err6) console.error("Error 6:", err6.message);
    else {
      const result = [];
      for (const p of profilesAll) {
        let hasInvoices = false;
        if (p.account_owner_user_id) {
          const { count } = await supabase
            .from("internal_invoices")
            .select("*", { count: "exact", head: true })
            .eq("business_profile_id", p.account_owner_user_id); // Assuming this is the link
          hasInvoices = count > 0;
        }
        result.push({
          billing_mode: p.billing_mode,
          has_external_billing: p.external_billing !== undefined ? !!p.external_billing : "N/A",
          account_owner_user_id: p.account_owner_user_id,
          has_invoices: hasInvoices
        });
      }
      console.log(result);
    }
  }
}

run();
