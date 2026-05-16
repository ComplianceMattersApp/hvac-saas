import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  prepareSmsProviderDeliveryPreflight,
  type PrepareSmsProviderDeliveryPreflightParams,
  type PrepareSmsProviderDeliveryPreflightResult,
} from "@/lib/communications/sms-provider-delivery-preflight";

describe("SMS Provider Delivery Preflight Helper (F6B)", () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("happy path: ready_for_provider intent creates not_submitted delivery", () => {
    it("creates delivery for eligible ready_for_provider intent", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Your technician is on the way.",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: mockIntent,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: null,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: "delivery-abc" },
            error: null,
          }),
        });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(true);
      expect(result.deduped).toBe(false);
      expect(result.deliveryId).toBe("delivery-abc");
      expect(result.readyForProviderSubmit).toBe(true);
      expect(result.blockedReasons).toEqual([]);
      expect(result.providerName).toBe("twilio");
      expect(result.providerStatus).toBe("not_submitted");
      expect(result.liveSendEnabled).toBe(false);
    });

    it("maps account/intent/provider fields correctly in created delivery", async () => {
      const mockIntent = {
        id: "intent-456",
        account_owner_user_id: "owner-789",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test message",
        contact_recipient_id: "recipient-111",
        recipient_phone_snapshot: "+15559876543",
        template_key: "on_the_way",
        template_version: "v2.0",
        job_event_id: "event-222",
      };

      let insertPayload: any;

      mockSupabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: mockIntent,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: null,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn((payload) => {
            insertPayload = payload;
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValueOnce({
                data: { id: "delivery-xyz" },
                error: null,
              }),
            };
          }),
        });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-789",
        smsMessageIntentId: "intent-456",
      });

      expect(result.created).toBe(true);
      expect(insertPayload).toEqual({
        account_owner_user_id: "owner-789",
        sms_message_intent_id: "intent-456",
        provider_name: "twilio",
        provider_status: "not_submitted",
      });
    });
  });

  describe("deduplication: existing delivery and insert conflict", () => {
    it("returns deduped true when delivery already exists", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test message",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: mockIntent,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: { id: "existing-delivery-123" },
            error: null,
          }),
        });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.deduped).toBe(true);
      expect(result.deliveryId).toBe("existing-delivery-123");
      expect(result.readyForProviderSubmit).toBe(true);
      expect(result.blockedReasons).toEqual([]);
    });

    it("handles insert unique conflict as deduped success", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test message",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: mockIntent,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: null,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            error: {
              code: "23505",
              message: "Unique constraint violation",
            },
            data: null,
          }),
        });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.deduped).toBe(true);
      expect(result.readyForProviderSubmit).toBe(true);
      expect(result.blockedReasons).toEqual([]);
    });
  });

  describe("blocking: missing/invalid intent data", () => {
    it("blocks when intent not found", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-nonexistent",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("intent_not_found");
      expect(result.readyForProviderSubmit).toBe(false);
    });

    it("blocks when message_class is not on_the_way", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "promotional",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("invalid_message_class");
    });

    it("blocks when decision_outcome is not ready_for_provider", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "blocked",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons.some((r) => r.includes("decision_outcome_not_ready"))).toBe(true);
    });

    it("blocks when message_body_snapshot is missing", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("missing_message_body_snapshot");
    });

    it("blocks when recipient_phone_snapshot is missing", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("missing_recipient_phone_snapshot");
    });

    it("blocks when template_version is missing", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: null,
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("missing_template_version");
    });

    it("blocks when job_event_id is missing", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("missing_job_event_id");
    });
  });

  describe("safety boundaries: no provider/send/webhook behavior", () => {
    it("does not call Twilio or provider APIs", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: mockIntent,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: null,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: "delivery-abc" },
            error: null,
          }),
        });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      // Only Supabase calls should occur (no provider API mocks should be called)
      expect(result.created).toBe(true);
      // Verify only 3 from() calls: intent read, existing delivery check, insert delivery
      expect(mockSupabase.from).toHaveBeenCalledTimes(3);
    });

    it("does not return canSend", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: "delivery-abc" },
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect((result as any).canSend).toBeUndefined();
    });

    it("always returns liveSendEnabled false", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: mockIntent,
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { id: "delivery-abc" },
          error: null,
        }),
      });

      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      expect(result.liveSendEnabled).toBe(false);
    });
  });

  describe("immutability: does not update other tables", () => {
    it("does not update sms_message_intents", async () => {
      const mockIntent = {
        id: "intent-123",
        account_owner_user_id: "owner-123",
        message_class: "on_the_way",
        decision_outcome: "ready_for_provider",
        message_body_snapshot: "Test",
        contact_recipient_id: "recipient-456",
        recipient_phone_snapshot: "+15551234567",
        template_key: "on_the_way",
        template_version: "v1.0",
        job_event_id: "event-789",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: mockIntent,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValueOnce({
            data: null,
            error: null,
          }),
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: "delivery-abc" },
            error: null,
          }),
        });

      await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "intent-123",
      });

      // Verify from() calls: first for sms_message_intents (read-only), then for sms_provider_deliveries (select and insert)
      const calls = mockSupabase.from.mock.calls.map((c: any) => c[0]);
      // Verify the sequence: sms_message_intents (select), sms_provider_deliveries (select), sms_provider_deliveries (insert)
      expect(calls).toEqual(["sms_message_intents", "sms_provider_deliveries", "sms_provider_deliveries"]);
    });
  });

  describe("account scope validation", () => {
    it("blocks when missing accountOwnerUserId", async () => {
      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "",
        smsMessageIntentId: "intent-123",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("missing_account_owner_user_id");
    });

    it("blocks when missing smsMessageIntentId", async () => {
      const result = await prepareSmsProviderDeliveryPreflight({
        supabase: mockSupabase,
        accountOwnerUserId: "owner-123",
        smsMessageIntentId: "",
      });

      expect(result.created).toBe(false);
      expect(result.blockedReasons).toContain("missing_sms_message_intent_id");
    });
  });
});
