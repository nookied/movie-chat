'use client';

interface Props {
  color: 'blue' | 'yellow' | 'red';
  label: string;
  value: string;
}

const COLORS = {
  blue: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
  yellow: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
  red: 'bg-red-900/40 text-red-300 border-red-700/50',
};

export default function ScoreBadge({ color, label, value }: Props) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${COLORS[color]}`}>
      {label} {value}
    </span>
  );
}
