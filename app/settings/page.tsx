'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ConfigFields {
  openRouterApiKey: string;
  openRouterModel: string;
  plexBaseUrl: string;
  plexToken: string;
  tmdbApiKey: string;
  omdbApiKey: string;
  transmissionBaseUrl: string;
  transmissionUsername: string;
  transmissionPassword: string;
  transmissionDownloadDir: string;
  libraryDir: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
}

const EMPTY: ConfigFields = {
  openRouterApiKey: '', openRouterModel: '',
  plexBaseUrl: '', plexToken: '',
  tmdbApiKey: '', omdbApiKey: '',
  transmissionBaseUrl: '', transmissionUsername: '',
  transmissionPassword: '', transmissionDownloadDir: '',
  libraryDir: '',
  ollamaBaseUrl: '', ollamaModel: '',
};

const SENSITIVE = new Set(['openRouterApiKey', 'plexToken', 'tmdbApiKey', 'omdbApiKey', 'transmissionPassword']);

type ServiceStatus = 'idle' | 'checking' | 'ok' | 'error';

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === 'checking') {
    return <span className="w-2 h-2 rounded-full bg-gray-500 animate-pulse block" />;
  }
  if (status === 'ok') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-500">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.09-7.09 1.41 1.41L10 16.5z" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-500">
        <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
      </svg>
    );
  }
  return <span className="w-4 h-4 block" />;
}

function Section({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-white font-semibold text-sm">{title}</h2>
        <p className="text-gray-500 text-xs mt-0.5">{description}</p>
      </div>
      <div className="rounded-xl border border-plex-border bg-plex-card divide-y divide-plex-border">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, type = 'text', status, onChange }: {
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

function ModelSelectField({ label, value, models, placeholder = 'Type a model name or connect to load list', onChange }: {
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm] = useState<ConfigFields>(EMPTY);
  const [sensitiveSet, setSensitiveSet] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  // Per-service connectivity status
  const [openRouterStatus, setOpenRouterStatus] = useState<ServiceStatus>('idle');
  const [openRouterModels, setOpenRouterModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<ServiceStatus>('idle');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [plexStatus, setPlexStatus] = useState<ServiceStatus>('idle');
  const [tmdbStatus, setTmdbStatus] = useState<ServiceStatus>('idle');
  const [omdbStatus, setOmdbStatus] = useState<ServiceStatus>('idle');
  const [transmissionStatus, setTransmissionStatus] = useState<ServiceStatus>('idle');

  const runChecks = useCallback(async (currentSensitiveSet: Set<string>) => {
    // OpenRouter — special: also captures available free models list
    const openRouterCheck = async () => {
      if (!currentSensitiveSet.has('openRouterApiKey')) return;
      setOpenRouterStatus('checking');
      try {
        const res = await fetch('/api/openrouter/test');
        const data = await res.json();
        setOpenRouterStatus(data.ok ? 'ok' : 'error');
        if (Array.isArray(data.models)) setOpenRouterModels(data.models);
      } catch {
        setOpenRouterStatus('error');
      }
    };

    // Ollama — also captures installed models list
    const ollamaCheck = async () => {
      setOllamaStatus('checking');
      try {
        const res = await fetch('/api/ollama/test');
        const data = await res.json();
        setOllamaStatus(data.ok ? 'ok' : 'error');
        if (Array.isArray(data.models)) setOllamaModels(data.models);
      } catch {
        setOllamaStatus('error');
      }
    };

    const otherChecks: Array<{
      endpoint: string;
      setStatus: (s: ServiceStatus) => void;
      shouldRun: boolean;
    }> = [
      { endpoint: '/api/plex/test',         setStatus: setPlexStatus,         shouldRun: currentSensitiveSet.has('plexToken') },
      { endpoint: '/api/tmdb/test',         setStatus: setTmdbStatus,         shouldRun: currentSensitiveSet.has('tmdbApiKey') },
      { endpoint: '/api/omdb/test',         setStatus: setOmdbStatus,         shouldRun: currentSensitiveSet.has('omdbApiKey') },
      { endpoint: '/api/transmission/test', setStatus: setTransmissionStatus, shouldRun: true },
    ];

    await Promise.all([
      openRouterCheck(),
      ollamaCheck(),
      ...otherChecks.map(async ({ endpoint, setStatus, shouldRun }) => {
        if (!shouldRun) return;
        setStatus('checking');
        try {
          const res = await fetch(endpoint);
          const data = await res.json();
          setStatus(data.ok ? 'ok' : 'error');
        } catch {
          setStatus('error');
        }
      }),
    ]);
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        const wasSet = new Set<string>();
        const filled: Partial<ConfigFields> = {};

        for (const [k, v] of Object.entries(data)) {
          if (SENSITIVE.has(k) && v === 'set') {
            wasSet.add(k);
            filled[k as keyof ConfigFields] = '';
          } else {
            filled[k as keyof ConfigFields] = v ?? '';
          }
        }

        setSensitiveSet(wasSet);
        setForm({ ...EMPTY, ...filled });
        runChecks(wasSet);
      })
      .catch(() => {});
  }, [runChecks]);

  function handleChange(key: keyof ConfigFields, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  }

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError('');

    const body: Partial<Record<string, string>> = { ...form };

    for (const key of SENSITIVE) {
      if (form[key as keyof ConfigFields] === '' && sensitiveSet.has(key)) {
        body[key] = 'set';
      }
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSaveStatus('saved');

      const newSet = new Set(sensitiveSet);
      for (const key of SENSITIVE) {
        const val = form[key as keyof ConfigFields];
        if (val) newSet.add(key);
        else if (val === '' && !sensitiveSet.has(key)) newSet.delete(key);
      }
      setSensitiveSet(newSet);

      runChecks(newSet);
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  function sensitiveplaceholder(key: keyof ConfigFields) {
    return sensitiveSet.has(key) ? 'Already set — type to change, clear to remove' : 'Not configured';
  }

  return (
    <div className="min-h-screen bg-plex-bg text-gray-100">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-plex-border bg-plex-card">
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          aria-label="Back to chat"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </Link>
        <div>
          <h1 className="text-white font-semibold text-lg leading-none">Settings</h1>
          <p className="text-gray-400 text-xs mt-0.5">Saved to config.local.json — overrides .env.local</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        <Section title="OpenRouter" description="Cloud LLM powering the chat assistant — free tier available at openrouter.ai">
          <Field label="API Key" value={form.openRouterApiKey} placeholder={sensitiveplaceholder('openRouterApiKey')}
            type="password" status={openRouterStatus} onChange={(v) => handleChange('openRouterApiKey', v)} />
          <ModelSelectField label="Model" value={form.openRouterModel}
            placeholder="Connect to OpenRouter to see available models"
            models={openRouterModels} onChange={(v) => handleChange('openRouterModel', v)} />
        </Section>

        <Section title="Ollama (Fallback)" description="Local LLM — used automatically when OpenRouter is unavailable. Install a model with: ollama pull llama3.2:3b">
          <Field label="Base URL" value={form.ollamaBaseUrl} placeholder="http://localhost:11434"
            status={ollamaStatus} onChange={(v) => handleChange('ollamaBaseUrl', v)} />
          <ModelSelectField label="Model" value={form.ollamaModel}
            placeholder="e.g. llama3.2:3b — run ollama pull first"
            models={ollamaModels} onChange={(v) => handleChange('ollamaModel', v)} />
        </Section>

        <Section title="Plex" description="Media server">
          <Field label="Base URL" value={form.plexBaseUrl} placeholder="http://localhost:32400"
            status={plexStatus} onChange={(v) => handleChange('plexBaseUrl', v)} />
          <Field label="Token" value={form.plexToken} placeholder={sensitiveplaceholder('plexToken')}
            type="password" status={plexStatus} onChange={(v) => handleChange('plexToken', v)} />
        </Section>

        <Section title="TMDB" description="Movie metadata & posters — themoviedb.org">
          <Field label="API Key" value={form.tmdbApiKey} placeholder={sensitiveplaceholder('tmdbApiKey')}
            type="password" status={tmdbStatus} onChange={(v) => handleChange('tmdbApiKey', v)} />
        </Section>

        <Section title="OMDB" description="IMDb & Rotten Tomatoes scores — omdbapi.com">
          <Field label="API Key" value={form.omdbApiKey} placeholder={sensitiveplaceholder('omdbApiKey')}
            type="password" status={omdbStatus} onChange={(v) => handleChange('omdbApiKey', v)} />
        </Section>

        <Section title="Transmission" description="Torrent client">
          <Field label="Base URL" value={form.transmissionBaseUrl} placeholder="http://localhost:9091"
            status={transmissionStatus} onChange={(v) => handleChange('transmissionBaseUrl', v)} />
          <Field label="Username" value={form.transmissionUsername} placeholder="Leave blank if no auth"
            onChange={(v) => handleChange('transmissionUsername', v)} />
          <Field label="Password" value={form.transmissionPassword} placeholder={sensitiveplaceholder('transmissionPassword')}
            type="password" onChange={(v) => handleChange('transmissionPassword', v)} />
          <Field label="Download directory" value={form.transmissionDownloadDir} placeholder="/Users/you/Downloads/Torrents"
            onChange={(v) => handleChange('transmissionDownloadDir', v)} />
        </Section>

        <Section title="File Management" description="Plex library path for moving completed downloads">
          <Field label="Library directory" value={form.libraryDir} placeholder="/Volumes/ExternalDrive/Movies"
            onChange={(v) => handleChange('libraryDir', v)} />
        </Section>

        <div className="flex items-center gap-4 pt-2 pb-8">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="px-6 py-2.5 rounded-xl bg-plex-accent text-black font-semibold text-sm
              hover:bg-plex-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save settings'}
          </button>
          {saveStatus === 'saved' && <span className="text-green-400 text-sm">Saved</span>}
          {saveStatus === 'error' && <span className="text-red-400 text-sm">Error: {saveError}</span>}
        </div>

      </div>
    </div>
  );
}
