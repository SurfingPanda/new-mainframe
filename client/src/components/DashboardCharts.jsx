import { useEffect, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';
import { getTheme } from '../lib/theme.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Re-renders charts when the user toggles light/dark so axis + legend colors track the theme.
function useThemePalette() {
  const [theme, setTheme] = useState(() => getTheme());
  useEffect(() => {
    const onChange = (e) => setTheme(e.detail);
    window.addEventListener('themechange', onChange);
    return () => window.removeEventListener('themechange', onChange);
  }, []);
  const dark = theme === 'dark';
  return {
    text: dark ? '#cbd5e1' : '#64748b',      // slate-300 / slate-500
    grid: dark ? 'rgba(148,163,184,0.15)' : 'rgba(15,23,42,0.06)',
    tooltipBg: dark ? '#1e293b' : '#0f172a'  // slate-800 / slate-900
  };
}

const EMPTY = (label) => (
  <div className="flex h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
    {label}
  </div>
);

export function ChartDoughnut({ labels, values, colors, emptyLabel = 'No data' }) {
  const palette = useThemePalette();
  if (!values.some((v) => v > 0)) return EMPTY(emptyLabel);

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'right',
        labels: { color: palette.text, boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 10 }
      },
      tooltip: { backgroundColor: palette.tooltipBg, padding: 10, cornerRadius: 6 }
    }
  };
  return (
    <div className="h-52">
      <Doughnut data={data} options={options} />
    </div>
  );
}

export function ChartBar({ labels, values, color = '#3f5b95', horizontal = false, emptyLabel = 'No data' }) {
  const palette = useThemePalette();
  if (!values.some((v) => v > 0)) return EMPTY(emptyLabel);

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: color,
        borderRadius: 4,
        maxBarThickness: 38
      }
    ]
  };
  const valueAxis = {
    beginAtZero: true,
    ticks: { color: palette.text, precision: 0, font: { size: 11 } },
    grid: { color: palette.grid, drawBorder: false }
  };
  const labelAxis = {
    ticks: { color: palette.text, font: { size: 11 } },
    grid: { display: false, drawBorder: false }
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: palette.tooltipBg, padding: 10, cornerRadius: 6 }
    },
    scales: horizontal
      ? { x: valueAxis, y: labelAxis }
      : { x: labelAxis, y: valueAxis }
  };
  return (
    <div className="h-52">
      <Bar data={data} options={options} />
    </div>
  );
}
