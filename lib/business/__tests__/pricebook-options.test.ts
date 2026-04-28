import { describe, expect, it } from 'vitest';
import {
  PRICEBOOK_CATEGORY_OPTIONS,
  PRICEBOOK_UNIT_LABEL_OPTIONS,
  isKnownPricebookCategory,
  isKnownPricebookUnitLabel,
  parsePricebookCategory,
  parsePricebookUnitLabel,
} from '../pricebook-options';

describe('pricebook-options', () => {
  it('includes D3B category additions only', () => {
    expect(PRICEBOOK_CATEGORY_OPTIONS).toContain('Electrical');
    expect(PRICEBOOK_CATEGORY_OPTIONS).toContain('Compliance Docs');
  });

  it('includes D3B unit additions and excludes cfm', () => {
    expect(PRICEBOOK_UNIT_LABEL_OPTIONS).toContain('trip');
    expect(PRICEBOOK_UNIT_LABEL_OPTIONS).toContain('doc');
    expect(PRICEBOOK_UNIT_LABEL_OPTIONS).not.toContain('cfm');
  });

  it('accepts all current valid controlled units', () => {
    const validUnits = [
      'each',
      'hr',
      'lb',
      'visit',
      'test',
      'job',
      'flat',
      'system',
      'trip',
      'doc',
    ];

    validUnits.forEach((unit) => {
      expect(parsePricebookUnitLabel(unit)).toBe(unit);
      expect(isKnownPricebookUnitLabel(unit)).toBe(true);
    });
  });

  it('rejects invalid unit labels including cfm', () => {
    ['cfm', 'set', 'ton', ''].forEach((unit) => {
      expect(parsePricebookUnitLabel(unit)).toBeNull();
      expect(isKnownPricebookUnitLabel(unit)).toBe(false);
    });

    expect(parsePricebookUnitLabel(' cfm ')).toBeNull();
    expect(isKnownPricebookUnitLabel(' cfm ')).toBe(false);
  });

  it('accepts new categories and still rejects invalid categories', () => {
    expect(parsePricebookCategory('Electrical')).toBe('Electrical');
    expect(parsePricebookCategory('Compliance Docs')).toBe('Compliance Docs');
    expect(isKnownPricebookCategory('Electrical')).toBe(true);
    expect(isKnownPricebookCategory('Compliance Docs')).toBe(true);

    expect(parsePricebookCategory('Unknown Category')).toBeNull();
    expect(isKnownPricebookCategory('Unknown Category')).toBe(false);
  });
});
