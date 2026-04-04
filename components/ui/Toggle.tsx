export default function Toggle({ label, description, enabled, onChange }: {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="hidden sm:block w-44 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
          <div>
            <span className="text-gray-200 text-sm">{label}</span>
            {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full
              border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
              ${enabled ? 'bg-plex-accent' : 'bg-gray-600'}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full
              bg-white shadow ring-0 transition duration-200 ease-in-out
              ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
        <div className="w-5 flex-shrink-0 hidden sm:block" />
      </div>
    </div>
  );
}
