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
        <p className="text-sm text-stone-500">Last updated: August 4, 2026</p>
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
          <li>
            Synchronize eligible invoice and recorded payment information with QuickBooks Online when
            you authorize this integration
          </li>
          <li>Send notifications and communications related to your account</li>
          <li>Improve and maintain our services</li>
        </ul>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">
          4. QuickBooks Online Integration
        </h2>
        <p className="text-stone-700 leading-relaxed">
          If you connect your QuickBooks Online account, we store OAuth access tokens and refresh
          tokens to enable synchronization. These tokens are encrypted at rest using AES-256-GCM
          encryption. EveryStep FieldWorks may synchronize eligible invoice and recorded payment
          information with QuickBooks Online when an account has enabled the integration. After a
          payment is successfully confirmed and recorded in EveryStep, EveryStep may create a related
          QuickBooks Online payment and apply it to the corresponding invoice. If you void an invoice
          in EveryStep, EveryStep may void the corresponding QuickBooks Online invoice so both systems
          reflect the same status; an invoice that QuickBooks Online shows as already paid is left
          unchanged for your review. Synchronization depends on account configuration, provider
          availability, authorization status, and successful record matching.
        </p>
        <p className="mt-3 text-stone-700 leading-relaxed">
          QuickBooks Online is used as a downstream accounting synchronization service. EveryStep
          remains the operational source of truth for job activity, invoices, and recorded payment
          status. We do not modify or delete data in your QuickBooks account beyond what you explicitly
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
          <li>Account-scoped access controls and row-level security protections where applicable</li>
          <li>
            Authentication and secure limited-purpose access controls for protected information
          </li>
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

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">
          7. SMS/Text Messaging Program
        </h2>
        <p className="text-stone-700 leading-relaxed">
          Compliance Matters may send text messages to customers who have consented to receive
          operational communications. These messages may include appointment confirmations,
          appointment reminders, scheduling updates, technician or rater on-the-way notifications,
          service updates, and customer-requested communications. These are transactional,
          service-related communications and are not marketing messages.
        </p>
        <p className="mt-3 text-stone-700 leading-relaxed">
          Customers may provide SMS consent verbally during appointment scheduling or through other
          approved consent methods made available by Compliance Matters. SMS consent is optional,
          applies only to operational communications, and is not a condition of purchasing or
          receiving services. Customers can receive services without agreeing to text messages.
        </p>
        <p className="mt-3 text-stone-700 leading-relaxed">
          Message frequency varies based on customer appointments, service activity, and
          communication needs. Message and data rates may apply depending on your mobile carrier and
          plan. Customers may opt out of SMS communications at any time by replying STOP. Customers
          may request assistance by replying HELP or contacting Compliance Matters directly. Delivery
          of text messages is subject to carrier and network availability.
        </p>
        <p className="mt-3 text-stone-700 leading-relaxed">
          Mobile numbers, SMS consent information, and messaging preferences are not sold or shared
          with third parties or affiliates for marketing or promotional purposes. We may share this
          information with service providers necessary to operate and deliver authorized messaging
          communications. SMS consent information is used only for authorized communications.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">8. Your Rights</h2>
        <p className="text-stone-700 leading-relaxed">
          You may request access to, correction of, or deletion of your personal data by contacting us
          at eddie@compliancemattersca.com.
        </p>

        <h2 className="mt-8 mb-2 text-lg font-semibold text-[#0f1f35]">9. Contact</h2>
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
