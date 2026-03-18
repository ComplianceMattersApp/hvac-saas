import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET() {
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing RESEND_API_KEY" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from: "Compliance Matters <reports@mail.compliancemattersca.com>",
      to: ["eddie@compliancemattersca.com"],
      subject: "Compliance Matters test email",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Test email successful</h2>
          <p>Your Resend integration is working.</p>
          <p>This is the first live system email from Compliance Matters.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Resend test email error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}