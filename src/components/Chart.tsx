// Chart.js carregado sob demanda (chunk separado). Cores sólidas lidas dos tokens CSS.
import { useEffect, useRef } from 'react';
import type { Chart as ChartJS, ChartConfiguration } from 'chart.js';

let chartLib: Promise<typeof import('chart.js/auto')> | null = null;
const loadChart = () => (chartLib ??= import('chart.js/auto'));

export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const SERIES = ['#2563EB', '#F59E0B', '#16A34A', '#DB2777', '#7C3AED', '#0891B2', '#EA580C', '#475569'];

interface Props { config: ChartConfiguration; height?: number; label: string }

export function Chart({ config, height = 220, label }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<ChartJS | null>(null);
  useEffect(() => {
    let alive = true;
    void loadChart().then(({ default: C }) => {
      if (!alive || !canvas.current) return;
      const text = cssVar('--text-muted'), grid = cssVar('--border');
      C.defaults.color = text;
      C.defaults.borderColor = grid;
      C.defaults.font.family = cssVar('--font') || 'system-ui';
      chart.current?.destroy();
      chart.current = new C(canvas.current, {
        ...config,
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: (config.data.datasets?.length ?? 0) > 1, labels: { boxWidth: 12 } } },
          ...config.options,
        },
      });
    });
    return () => { alive = false; chart.current?.destroy(); chart.current = null; };
  }, [config]);
  return (
    <div style={{ position: 'relative', height }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
