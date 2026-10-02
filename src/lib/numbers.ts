// Números no formato pt-BR (vírgula decimal). Peso sempre em kg, até 2 casas.

/**
 * Converte texto digitado em número. Aceita vírgula ou ponto.
 * Mais de 2 casas decimais são truncadas ("12,555" → 12.55).
 * Retorna null para vazio, inválido ou negativo.
 */
export function parseDecimal(input: string | number | null | undefined, maxDecimals = 2): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? truncate(input, maxDecimals) : null;
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  const n = Number(`${int || '0'}.${frac.slice(0, maxDecimals) || '0'}`);
  return Number.isFinite(n) ? n : null;
}

function truncate(n: number, decimals: number): number {
  const [int, frac = ''] = String(n).split('.');
  return Number(`${int}.${frac.slice(0, decimals) || '0'}`);
}

/** Inteiro ≥ 0 (repetições). */
export function parseIntSafe(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 12.5 → "12,5" */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return nf.format(n);
}

/** 12.5 → "12,5 kg" */
export function formatKg(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${nf.format(n)} kg`;
}

/** volume grande com 1 casa: 1234.5 → "1.234,5" */
export function formatVolume(n: number): string {
  return nf1.format(n);
}

/** Valor para preencher um campo de texto (vírgula). */
export function toInputValue(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return String(n).replace('.', ',');
}
