import StatusIcon, { ServiceStatus } from './StatusIcon';

export default function Field({ label, value, placeholder, type = 'text', status, onChange }: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password';
  status?: ServiceStatus;
  onChange: (v: string) => void;
}) {
  return (
    <div className="px-4 py-3">
      {/* Mobile: label + status on one row, input below */}
      <div className="flex items-center gap-2 mb-1.5 sm:hidden">
        <label className="flex-1 text-gray-400 text-xs">{label}</label>
        {status && status !== 'idle' && <StatusIcon status={status} />}
      </div>
      <div className="flex items-center gap-4">
        <label className="hidden sm:block w-44 flex-shrink-0 text-gray-400 text-xs">{label}</label>
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-gray-100 text-sm placeholder-gray-600
            focus:outline-none focus:text-white transition-colors"
          spellCheck={false}
          autoComplete="off"
        />
        <div className="hidden sm:flex w-5 flex-shrink-0 items-center justify-center">
          {status && status !== 'idle' && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}
