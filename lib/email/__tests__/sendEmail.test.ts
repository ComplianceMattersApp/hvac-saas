import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: (...args: unknown[]) => sendMock(...args),
      },
    })),
  };
});

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.EMAIL_FROM;
    sendMock.mockResolvedValue({ id: "email-1", error: null });
  });

  it("supports existing html-only callers", async () => {
    const { sendEmail } = await import("@/lib/email/sendEmail");

    await sendEmail({
      to: "contractor@test.com",
      subject: "Subject",
      html: "<p>Hello</p>",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Compliance Matters <reports@mail.compliancemattersca.com>",
        to: ["contractor@test.com"],
        subject: "Subject",
        html: "<p>Hello</p>",
      }),
    );
    expect(sendMock.mock.calls[0]?.[0]?.text).toBeUndefined();
  });

  it("passes plain-text fallback when provided", async () => {
    const { sendEmail } = await import("@/lib/email/sendEmail");

    await sendEmail({
      to: "contractor@test.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["contractor@test.com"],
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    );
  });
});
