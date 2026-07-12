import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | EveryStep FieldWorks",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-stone-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-lg font-bold text-[#0f1f35]">EveryStep FieldWorks</p>
            <p className="text-xs font-medium text-stone-500">by Compliance Matters</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-[#c2622a] underline-offset-4 hover:underline"
          >
            Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-stone-500">Last updated: July 11, 2026</p>
        <h1 className="mt-2 text-2xl font-bold text-[#0f1f35]">
          Privacy Policy — EveryStep FieldWorks by Compliance Matters
        </h1>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">1. Introduction</h2>
        <p className="text-stone-700 leading-relaxed">
          EveryStep FieldWorks (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is a field
          service management platform operated by Compliance Matters. This Privacy Policy explains how
          we collect, use, and protect information when you use our application at
          app.compliancemattersca.com.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">2. Information We Collect</h2>
        <p className="text-stone-700 leading-relaxed">We collect information you provide directly:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-stone-700 leading-relaxed">
          <li>Account information: name, email address, business name, phone number</li>
          <li>
            Job and customer data: customer names, service addresses, job details, notes, and
            documents you enter into the platform
          </li>
          <li>
            Payment information: payment records and billing details (payment processing is handled by
            Stripe)
          </li>
          <li>Usage data: how you interact with the application</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">
          3. How We Use Your Information
        </h2>
        <p className="text-stone-700 leading-relaxed">We use the information we collect to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-stone-700 leading-relaxed">
          <li>Provide and operate the EveryStep FieldWorks platform</li>
          <li>Process and manage jobs, invoices, and payments</li>
          <li>Sync invoice data to QuickBooks Online when you authorize this integration</li>
          <li>Send notifications and communications related to your account</li>
          <li>Improve and maintain our services</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">
          4. QuickBooks Online Integration
        </h2>
        <p className="text-stone-700 leading-relaxed">
          If you connect your QuickBooks Online account, we store OAuth access tokens and refresh
          tokens to enable invoice synchronization. These tokens are encrypted at rest using
          AES-256-GCM encryption. We sync invoice data one-way from EveryStep FieldWorks to QuickBooks
          Online. We do not modify or delete data in your QuickBooks account beyond what you explicitly
          authorize. You may disconnect the integration at any time from your Company Profile settings.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">5. Data Storage and Security</h2>
        <p className="text-stone-700 leading-relaxed">
          Your data is stored on Supabase infrastructure hosted in the United States. We implement
          industry-standard security measures including:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-stone-700 leading-relaxed">
          <li>Encryption in transit (HTTPS/TLS)</li>
          <li>Encryption at rest for sensitive credentials</li>
          <li>Row-level security policies on all data</li>
          <li>Authentication required for all data access</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">6. Data Sharing</h2>
        <p className="text-stone-700 leading-relaxed">
          We do not sell your personal information. We share data only with:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-stone-700 leading-relaxed">
          <li>
            Service providers necessary to operate the platform (Supabase, Vercel, Stripe, Twilio,
            Intuit/QuickBooks)
          </li>
          <li>As required by law</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">7. Your Rights</h2>
        <p className="text-stone-700 leading-relaxed">
          You may request access to, correction of, or deletion of your personal data by contacting us
          at eddie@compliancemattersca.com.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">8. Contact</h2>
        <p className="text-stone-700 leading-relaxed">
          Compliance Matters
          <br />
          Stockton, California
          <br />
          eddie@compliancemattersca.com
        </p>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto max-w-3xl px-6 py-6 text-sm text-stone-500">
          <Link href="/login" className="text-[#c2622a] underline-offset-4 hover:underline">
            Return to login
          </Link>
        </div>
      </footer>
    </div>
  );
}
