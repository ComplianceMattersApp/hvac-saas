import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STARTER_KIT_V1_SEEDS,
  applyPricebookSeeding,
  createPricebookSeedingStoreFromSupabase,
  dryRunPricebookSeeding,
  type PricebookSeedingStore,
  validateSeedDefinitions,
  PricebookStarterSeedDefinition,
} from '../pricebook-seeding';
import { SupabaseClient } from '@supabase/supabase-js';

describe('PricebookSeeding', () => {
  describe('validateSeedDefinitions', () => {
    it('should validate V1 seed definitions with unique seed keys', () => {
      const errors = validateSeedDefinitions(STARTER_KIT_V1_SEEDS);
      expect(errors).toEqual([]);
    });

    it('should validate V1 seed definitions all include starter_version', () => {
      STARTER_KIT_V1_SEEDS.forEach((seed) => {
        expect(seed.starter_version).toBeTruthy();
        expect(seed.starter_version).toBe('starter_v1');
      });
    });

    it('should detect duplicate seed keys', () => {
      const duplicateSeed = [
        ...STARTER_KIT_V1_SEEDS.slice(0, 2),
        STARTER_KIT_V1_SEEDS[0], // duplicate
      ];
      const errors = validateSeedDefinitions(duplicateSeed);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('Duplicate seed_key'))).toBe(true);
    });

    it('should detect empty seed_key', () => {
      const invalidSeed: PricebookStarterSeedDefinition[] = [
        {
          ...STARTER_KIT_V1_SEEDS[0],
          seed_key: '',
        },
      ];
      const errors = validateSeedDefinitions(invalidSeed);
      expect(errors.some((e) => e.includes('empty seed_key'))).toBe(true);
    });

    it('should detect empty starter_version', () => {
      const invalidSeed: PricebookStarterSeedDefinition[] = [
        {
          ...STARTER_KIT_V1_SEEDS[0],
          starter_version: '',
        },
      ];
      const errors = validateSeedDefinitions(invalidSeed);
      expect(errors.some((e) => e.includes('empty starter_version'))).toBe(true);
    });

    it('should detect invalid item_type', () => {
      const invalidSeed: PricebookStarterSeedDefinition[] = [
        {
          ...STARTER_KIT_V1_SEEDS[0],
          item_type: 'invalid' as any,
        },
      ];
      const errors = validateSeedDefinitions(invalidSeed);
      expect(errors.some((e) => e.includes('invalid item_type'))).toBe(true);
    });

    it('should detect is_starter=false', () => {
      const invalidSeed: PricebookStarterSeedDefinition[] = [
        {
          ...STARTER_KIT_V1_SEEDS[0],
          is_starter: false,
        },
      ];
      const errors = validateSeedDefinitions(invalidSeed);
      expect(errors.some((e) => e.includes('is_starter=false'))).toBe(true);
    });

    it('should ensure all V1 seeds have unique seed_key', () => {
      const seed_keys = STARTER_KIT_V1_SEEDS.map((s) => s.seed_key);
      const unique_keys = new Set(seed_keys);
      expect(unique_keys.size).toBe(seed_keys.length);
    });

    it('should ensure all V1 seeds have exactly 12 items', () => {
      expect(STARTER_KIT_V1_SEEDS).toHaveLength(12);
    });
  });

  describe('dryRunPricebookSeeding', () => {
    let mockStore: PricebookSeedingStore;
    let listExistingSeedRowsMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      listExistingSeedRowsMock = vi.fn();
      mockStore = {
        listExistingSeedRows: listExistingSeedRowsMock,
        insertSeedRows: vi.fn(),
      };
    });

    it('should return insert candidates when account has no existing seed rows', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await dryRunPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(12);
      expect(result.skipped_count).toBe(0);
      expect(result.inserted_rows).toHaveLength(12);
      expect(result.inserted_rows![0]).toEqual({
        seed_key: 'starter_v1.fees.service_call',
        item_name: 'Service Call',
      });
    });

    it('should skip rows with existing seed_key', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: [
          {
            seed_key: 'starter_v1.fees.service_call',
            item_name: 'Service Call',
          },
          {
            seed_key: 'starter_v1.diagnostics.diagnostic_fee',
            item_name: 'Diagnostic Fee',
          },
        ],
        error: null,
      });

      const result = await dryRunPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(10);
      expect(result.skipped_count).toBe(2);
      expect(result.skipped_rows).toHaveLength(2);
    });

    it('should require explicit account_owner_user_id', async () => {
      const result = await dryRunPricebookSeeding(
        mockStore,
        '',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('account_owner_user_id'))).toBe(
        true
      );
    });

    it('should detect invalid seed definitions in dry-run', async () => {
      const invalidSeeds: PricebookStarterSeedDefinition[] = [
        {
          ...STARTER_KIT_V1_SEEDS[0],
          item_type: 'invalid' as any,
        },
      ];

      const result = await dryRunPricebookSeeding(
        mockStore,
        'test-account-id',
        invalidSeeds
      );

      expect(result.inserted_count).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should handle database errors', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: null,
        error: { message: 'Connection error' },
      });

      const result = await dryRunPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('Connection error'))).toBe(true);
    });
  });

  describe('applyPricebookSeeding', () => {
    let mockStore: PricebookSeedingStore;
    let listExistingSeedRowsMock: ReturnType<typeof vi.fn>;
    let insertSeedRowsMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      listExistingSeedRowsMock = vi.fn();
      insertSeedRowsMock = vi.fn();
      mockStore = {
        listExistingSeedRows: listExistingSeedRowsMock,
        insertSeedRows: insertSeedRowsMock,
      };
    });

    it('should insert missing rows', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: [],
        error: null,
      });
      insertSeedRowsMock.mockResolvedValue({
        error: null,
      });

      const result = await applyPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(12);
      expect(result.skipped_count).toBe(0);
      expect(insertSeedRowsMock).toHaveBeenCalled();

      // Verify insert was called with correct payload
      const insertCall = insertSeedRowsMock.mock.calls[0]?.[0];
      expect(insertCall).toBeDefined();
      expect(insertCall.length).toBe(12);
      expect(insertCall[0]).toHaveProperty('account_owner_user_id', 'test-account-id');
    });

    it('should skip rows when called twice (idempotency)', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: STARTER_KIT_V1_SEEDS.map((s) => ({
          seed_key: s.seed_key,
          item_name: s.item_name,
        })),
        error: null,
      });

      const result = await applyPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(0);
      expect(result.skipped_count).toBe(12);
      expect(insertSeedRowsMock).not.toHaveBeenCalled();
    });

    it('should not duplicate when called multiple times', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: [
          {
            seed_key: 'starter_v1.fees.service_call',
            item_name: 'Service Call',
          },
        ],
        error: null,
      });
      insertSeedRowsMock.mockResolvedValue({
        error: null,
      });

      const result = await applyPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(11);
      expect(result.skipped_count).toBe(1);

      // Verify insert only includes 11 rows (excluding the existing one)
      const insertCall = insertSeedRowsMock.mock.calls[0]?.[0];
      expect(insertCall.length).toBe(11);
      expect(insertCall.every((row: any) => row.seed_key !== 'starter_v1.fees.service_call')).toBe(
        true
      );
    });

    it('should require explicit account_owner_user_id', async () => {
      const result = await applyPricebookSeeding(
        mockStore,
        '',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('account_owner_user_id'))).toBe(
        true
      );
      expect(insertSeedRowsMock).not.toHaveBeenCalled();
    });

    it('should handle insert errors', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: [],
        error: null,
      });
      insertSeedRowsMock.mockResolvedValue({
        error: { message: 'Insert failed' },
      });

      const result = await applyPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('Insert failed'))).toBe(true);
    });

    it('should handle select errors gracefully', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: null,
        error: { message: 'Select failed' },
      });

      const result = await applyPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_count).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('Select failed'))).toBe(true);
    });

    it('should populate inserted_rows with seed metadata', async () => {
      listExistingSeedRowsMock.mockResolvedValue({
        data: [],
        error: null,
      });
      insertSeedRowsMock.mockResolvedValue({
        error: null,
      });

      const result = await applyPricebookSeeding(
        mockStore,
        'test-account-id',
        STARTER_KIT_V1_SEEDS
      );

      expect(result.inserted_rows).toBeDefined();
      expect(result.inserted_rows!.length).toBe(12);
      expect(result.inserted_rows![0]).toEqual({
        seed_key: 'starter_v1.fees.service_call',
        item_name: 'Service Call',
      });
    });

    it('creates a Supabase-backed store adapter', async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };

      const store = createPricebookSeedingStoreFromSupabase(
        mockClient as unknown as SupabaseClient,
      );

      const listResult = await store.listExistingSeedRows('test-account-id');
      expect(listResult.data).toEqual([]);

      const insertResult = await store.insertSeedRows([
        {
          ...STARTER_KIT_V1_SEEDS[0],
          account_owner_user_id: 'test-account-id',
        },
      ]);
      expect(insertResult.error).toBeNull();
      expect(mockClient.from).toHaveBeenCalledWith('pricebook_items');
    });
  });

  describe('STARTER_KIT_V1_SEEDS constants', () => {
    it('should have exactly 12 seeds', () => {
      expect(STARTER_KIT_V1_SEEDS).toHaveLength(12);
    });

    it('should have unique seed keys', () => {
      const keys = STARTER_KIT_V1_SEEDS.map((s) => s.seed_key);
      const unique_keys = new Set(keys);
      expect(unique_keys.size).toBe(12);
    });

    it('should have all seeds marked as is_starter=true', () => {
      STARTER_KIT_V1_SEEDS.forEach((seed) => {
        expect(seed.is_starter).toBe(true);
      });
    });

    it('should have all seeds with starter_version=starter_v1', () => {
      STARTER_KIT_V1_SEEDS.forEach((seed) => {
        expect(seed.starter_version).toBe('starter_v1');
      });
    });

    it('should have all valid item_types', () => {
      const validTypes = ['service', 'material', 'diagnostic', 'adjustment'];
      STARTER_KIT_V1_SEEDS.forEach((seed) => {
        expect(validTypes).toContain(seed.item_type);
      });
    });

    it('should include expected seed keys', () => {
      const expectedKeys = [
        'starter_v1.fees.service_call',
        'starter_v1.diagnostics.diagnostic_fee',
        'starter_v1.maintenance.preventive_maintenance_residential',
        'starter_v1.maintenance.preventive_maintenance_commercial',
        'starter_v1.refrigerant.r410a_per_lb',
        'starter_v1.parts.filter_replacement',
        'starter_v1.parts.thermostat_standard',
        'starter_v1.repair.capacitor_replacement',
        'starter_v1.repair.contactor_replacement',
        'starter_v1.compliance.ecc_title_24_test',
        'starter_v1.labor.hourly',
        'starter_v1.adjustments.discount_adjustment',
      ];

      expectedKeys.forEach((key) => {
        expect(STARTER_KIT_V1_SEEDS.some((s) => s.seed_key === key)).toBe(true);
      });
    });
  });
});
