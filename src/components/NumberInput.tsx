import { useEffect, useState } from 'react';
import { parseDecimal, parseIntSafe, toInputValue } from '../lib/numbers';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  decimal?: boolean;
  label: string;
  placeholder?: string;
  id?: string;
  className?: string;
  onEnter?: () => void;
}

/** Campo numérico pt-BR: aceita vírgula ou ponto, fonte ≥ 16px (evita zoom do iOS). */
export function NumberInput({ value, onChange, decimal, label, placeholder, id, className, onEnter }: Props) {
  const [text, setText] = useState(toInputValue(value));
  useEffect(() => {
    const parsed = decimal ? parseDecimal(text) : parseIntSafe(text);
    if (parsed !== value) setText(toInputValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      className={`input num ${className ?? ''}`}
      inputMode={decimal ? 'decimal' : 'numeric'}
      pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        setText(t);
        onChange(decimal ? parseDecimal(t) : parseIntSafe(t));
      }}
    />
  );
}
