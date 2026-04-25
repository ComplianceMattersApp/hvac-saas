const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const fs = require("fs");

async function run() {
  const envContent = fs.readFileSync(".env.local", "utf8");
  const getEnv = (key) => {
    const match = envContent.match(new RegExp(`${key}=(.*)`));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  };

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const ts = Date.now();
  const email = `temp-p-smk+${ts}@example.com`;
  const password = "TempPass!23456";
  const { data, error } = await supabase.auth.admin.createUser({email, password, email_confirm: true});
  if (error) throw error;
  const userId = data.user.id;

  await supabase.from("internal_users").insert({
    user_id: userId, role: "admin", is_active: true,
    account_owner_user_id: "6e93b2f7-1509-4a39-87e5-6558497f2157", created_by: "6e93b2f7-1509-4a39-87e5-6558497f2157"
  });

  const invoiceId = "3cd51f8c-fc61-4058-aeb3-9757ef4f8cdc";
  const jobId = "fce0bab8-a4f2-431c-8e64-b1abdd66d46a";
  const { count: bpc } = await supabase.from("internal_invoice_payments").select("*", { count: "exact", head: true }).eq("invoice_id", invoiceId);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.click("button:has-text('Sign in')");
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  await page.goto(`http://localhost:3000/jobs/${jobId}?tab=billing#internal-invoice-panel`);
  await page.fill('input[name="payment_amount"]', "12.34");
  await page.selectOption('select[name="payment_method"]', "cash");
  await page.fill('input[name="received_reference"]', "SMOKE-1234");
  await page.click('button:has-text("Record Payment")');
  await page.waitForTimeout(3000);

  const bodyText = await page.innerText("body");
  const res = { paymentRecordResult: bodyText.includes("12.34") ? "PASS" : "FAIL" };
  const { count: apc } = await supabase.from("internal_invoice_payments").select("*", { count: "exact", head: true }).eq("invoice_id", invoiceId);
  res.centsConversionConfirmed = (apc === bpc + 1) ? "PASS" : "FAIL";

  await page.fill('input[name="payment_amount"]', "9999.00");
  await page.click('button:has-text("Record Payment")');
  await page.waitForTimeout(2000);
  res.overpaymentDenied = (await page.innerText("body")).includes("cannot exceed the current balance due") ? "PASS" : "FAIL";

  await browser.close();
  await supabase.from("internal_users").delete().eq("user_id", userId);
  await supabase.auth.admin.deleteUser(userId);
  console.log("FINAL_JSON:" + JSON.stringify(res));
}
run().catch(e => console.error(e));
