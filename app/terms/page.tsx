import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | EveryStep FieldWorks",
};

export default function TermsOfServicePage() {
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
          Terms of Service — EveryStep FieldWorks by Compliance Matters
        </h1>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">1. Acceptance of Terms</h2>
        <p className="text-stone-700 leading-relaxed">
          By accessing or using EveryStep FieldWorks (&ldquo;the Service&rdquo;), operated by
          Compliance Matters, you agree to be bound by these Terms of Service.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">2. Description of Service</h2>
        <p className="text-stone-700 leading-relaxed">
          EveryStep FieldWorks is a field service management platform that helps HVAC and trades
          businesses manage jobs, scheduling, invoicing, and customer communications.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">3. Account Responsibilities</h2>
        <p className="text-stone-700 leading-relaxed">You are responsible for:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-stone-700 leading-relaxed">
          <li>Maintaining the security of your account credentials</li>
          <li>All activity that occurs under your account</li>
          <li>Ensuring the accuracy of data you enter into the platform</li>
          <li>Complying with all applicable laws in your use of the Service</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">4. Acceptable Use</h2>
        <p className="text-stone-700 leading-relaxed">You agree not to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-stone-700 leading-relaxed">
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to gain unauthorized access to any part of the Service</li>
          <li>Interfere with or disrupt the Service</li>
          <li>Share your account credentials with unauthorized parties</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">5. Data Ownership</h2>
        <p className="text-stone-700 leading-relaxed">
          You retain ownership of all data you enter into EveryStep FieldWorks. We do not claim
          ownership of your customer data, job records, or business information.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">
          6. QuickBooks Online Integration
        </h2>
        <p className="text-stone-700 leading-relaxed">
          The QuickBooks Online integration syncs your invoice data to your connected QuickBooks
          company. You are responsible for ensuring your use of this integration complies with
          Intuit&apos;s terms of service. We are not affiliated with or endorsed by Intuit Inc.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">7. Payment and Billing</h2>
        <p className="text-stone-700 leading-relaxed">
          Access to EveryStep FieldWorks may require a subscription fee. Subscription terms are
          presented at signup. All fees are non-refundable unless otherwise stated.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">8. Limitation of Liability</h2>
        <p className="text-stone-700 leading-relaxed">
          The Service is provided &ldquo;as is.&rdquo; Compliance Matters shall not be liable for any
          indirect, incidental, or consequential damages arising from your use of the Service.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">9. Modifications</h2>
        <p className="text-stone-700 leading-relaxed">
          We may update these Terms at any time. Continued use of the Service after changes constitutes
          acceptance of the updated Terms.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">10. Contact</h2>
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
