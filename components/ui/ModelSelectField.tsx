import Field from './Field';

export default function ModelSelectField({ label, value, models, placeholder = 'Type a model name or connect to load list', onChange }: {
  label: string;
  value: string;
  models: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  // No models yet (service not connected) — fall back to plain text input
  if (models.length === 0) {
    return (
      <Field
        label={label}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
    );
  }

  // If the saved value isn't in the list, keep it selected as a custom entry at the top
  const inList = models.includes(value);
  const effectiveValue = value || '';

  return (
    <div className="px-4 py-3">
      {/* Mobile: label on its own row */}
      <div className="mb-1.5 sm:hidden">
        <label className="text-gray-400 text-xs">{label}</label>
      </div>
      <div className="flex items-center gap-4">
        <label className="hidden sm:block w-44 flex-shrink-0 text-gray-400 text-xs">{label}</label>
        <div className="flex-1 min-w-0 relative flex items-center">
          <select
            value={effectiveValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent text-gray-100 text-sm focus:outline-none
              cursor-pointer border-0 appearance-none pr-5"
          >
            {!effectiveValue && <option value="" disabled>Select a model…</option>}
            {!inList && effectiveValue && (
              <option value={effectiveValue} style={{ background: '#252525' }}>{effectiveValue}</option>
            )}
            {models.map((m) => (
              <option key={m} value={m} style={{ background: '#252525' }}>{m}</option>
            ))}
          </select>
          <svg viewBox="0 0 24 24" fill="currentColor"
            className="w-3 h-3 text-gray-500 pointer-events-none absolute right-0">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </div>
        <div className="w-5 flex-shrink-0 hidden sm:block" />
      </div>
    </div>
  );
}
