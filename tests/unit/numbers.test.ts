import { describe, expect, it } from 'vitest';
import { formatKg, formatNumber, parseDecimal, parseIntSafe, toInputValue } from '../../src/lib/numbers';

describe('parseDecimal', () => {
  it('aceita vírgula e ponto', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal(' 7 ')).toBe(7);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('20,')).toBe(20);
  });
  it('trunca para 2 casas', () => {
    expect(parseDecimal('12,555')).toBe(12.55);
    expect(parseDecimal('61.359')).toBe(61.35);
    expect(parseDecimal(12.555)).toBe(12.55);
  });
  it('vazio, negativo e inválido → null', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal('-5')).toBeNull();
    expect(parseDecimal(-5)).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
  });
});

describe('parseIntSafe', () => {
  it('só inteiros ≥ 0', () => {
    expect(parseIntSafe('12')).toBe(12);
    expect(parseIntSafe('0')).toBe(0);
    expect(parseIntSafe('1,5')).toBeNull();
    expect(parseIntSafe('-1')).toBeNull();
    expect(parseIntSafe('')).toBeNull();
  });
});

describe('formatação pt-BR', () => {
  it('exibe com vírgula', () => {
    expect(formatNumber(12.5)).toBe('12,5');
    expect(formatKg(12.5)).toBe('12,5 kg');
    expect(formatKg(20)).toBe('20 kg');
    expect(formatKg(null)).toBe('—');
    expect(toInputValue(12.25)).toBe('12,25');
  });
});
