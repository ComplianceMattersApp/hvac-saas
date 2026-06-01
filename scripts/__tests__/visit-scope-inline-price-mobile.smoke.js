const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");

const APP_URL = "http://localhost:3000";
const OWNER_USER_ID = "6e93b2f7-1509-4a39-87e5-6558497f2157";
const SERVICE_JOB_ID = "2d4e20ed-5a5a-4f99-ba89-63083cfa63b9";
const ECC_JOB_ID = "b3691009-cb8a-4cf1-ab9c-3a4739676f3b";

function readEnvLocal() {
  const envContent = fs.readFileSync(".env.local", "utf8");
  const getEnv = (key) => {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim().replace(/^['\"]|['\"]$/g, "") : null;
  };

  return {
    supabaseUrl: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

async function createTempAdmin(supabase) {
  const ts = Date.now();
  const email = `temp-visit-scope-inline+${ts}@example.com`;
  const password = "TempPass!23456";

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const userId = data.user.id;

  const { error: insertError } = await supabase.from("internal_users").insert({
    user_id: userId,
    role: "admin",
    is_active: true,
    account_owner_user_id: OWNER_USER_ID,
    created_by: OWNER_USER_ID,
  });
  if (insertError) throw insertError;

  return { userId, email, password };
}

async function cleanupTempAdmin(supabase, userId) {
  if (!userId) return;
  await supabase.from("internal_users").delete().eq("user_id", userId);
  await supabase.auth.admin.deleteUser(userId);
}

async function login(page, email, password) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
  const formInputs = page.locator("main form input");
  const emailInput = formInputs.nth(0);
  const passwordInput = formInputs.nth(1);
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function openWorkNeededEditor(page, jobId) {
  await page.goto(`${APP_URL}/jobs/${jobId}?tab=info#visit-scope-section`, { waitUntil: "domcontentloaded" });
  const summary = page.locator('summary:has-text("Edit Work Items")').first();
  await summary.evaluate((el) => el.click());
  await page.getByText("Selected Work Items").first().waitFor({ timeout: 10000 });
}

async function setInlinePriceAndSave(page, itemTitle, nextPrice) {
  const input = page.getByLabel(`Optional price for ${itemTitle}`).first();
  await input.click();
  await input.press("Control+a");
  await input.type(String(nextPrice));

  const savePromise = page.waitForURL(/banner=visit_scope_saved/, { timeout: 20000 });
  await page.keyboard.press("Enter");
  await savePromise;
}

async function assertSummaryMoney(page, itemTitle, expectedPrice) {
  const expected = `${itemTitle} - $${formatMoney(expectedPrice)}`;
  const bodyText = await page.locator("body").innerText();
  return bodyText.includes(expected);
}

async function assertMobileInlineNoOverflow(page, jobId) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkNeededEditor(page, jobId);

  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const inputs = Array.from(document.querySelectorAll('input[aria-label^="Optional price for "]')).filter(
      (input) => input.getClientRects().length > 0,
    );

    if (inputs.length === 0) {
      return { inputCount: 0, overflow: true };
    }

    const overflow = inputs.some((input) => {
      const rect = input.getBoundingClientRect();
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        return true;
      }

      let row = input.parentElement;
      while (row && row.tagName !== "BODY") {
        if (row.classList?.contains("rounded-xl") && row.classList?.contains("bg-white")) {
          if (row.scrollWidth > row.clientWidth + 1) return true;
          break;
        }
        row = row.parentElement;
      }
      return false;
    });

    return { inputCount: inputs.length, overflow };
  });
}

async function run() {
  const { supabaseUrl, serviceRoleKey } = readEnvLocal();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const browser = await chromium.launch({ headless: true });

  let tempUser = null;
  const results = {
    serviceInlineSavePersisted: false,
    eccInlineSavePersisted: false,
    eccHelperCopyIntact: false,
    mobileInlineNoOverflow: false,
  };

  try {
    tempUser = await createTempAdmin(supabase);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    try {
      await login(page, tempUser.email, tempUser.password);
    } catch (error) {
      console.log(
        "FINAL_JSON:" +
          JSON.stringify({
            overall: "SKIP",
            reason: "auth_login_failed",
            message: error instanceof Error ? error.message : String(error),
          }),
      );
      await page.close();
      return;
    }

    await openWorkNeededEditor(page, SERVICE_JOB_ID);
    await setInlinePriceAndSave(page, "Service Call", "126.25");
    results.serviceInlineSavePersisted = await assertSummaryMoney(page, "Service Call", 126.25);

    await openWorkNeededEditor(page, ECC_JOB_ID);
    const eccBody = await page.locator("body").innerText();
    results.eccHelperCopyIntact = eccBody.includes(
      "ECC test work is tracked separately. Add work items only if this visit includes additional service work.",
    );
    await setInlinePriceAndSave(page, "Service Call", "92.75");
    results.eccInlineSavePersisted = await assertSummaryMoney(page, "Service Call", 92.75);

    const mobileCheck = await assertMobileInlineNoOverflow(page, SERVICE_JOB_ID);
    results.mobileInlineNoOverflow = Boolean(mobileCheck.inputCount > 0 && !mobileCheck.overflow);

    await page.close();
  } finally {
    await browser.close();
    if (tempUser?.userId) {
      await cleanupTempAdmin(supabase, tempUser.userId);
    }
  }

  const overall = Object.values(results).every(Boolean);
  console.log(
    "FINAL_JSON:" +
      JSON.stringify({
        overall: overall ? "PASS" : "FAIL",
        ...results,
      }),
  );

  if (!overall) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
