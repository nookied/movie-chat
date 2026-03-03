'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ConfigFields {
  ollamaBaseUrl: string;
  ollamaModel: string;
  plexBaseUrl: string;
  plexToken: string;
  tmdbApiKey: string;
  omdbApiKey: string;
  transmissionBaseUrl: string;
  transmissionUsername: string;
  transmissionPassword: string;
  transmissionDownloadDir: string;
  libraryDir: string;
}

const EMPTY: ConfigFields = {
  ollamaBaseUrl: '', ollamaModel: '',
  plexBaseUrl: '', plexToken: '',
  tmdbApiKey: '', omdbApiKey: '',
  transmissionBaseUrl: '', transmissionUsername: '',
  transmissionPassword: '', transmissionDownloadDir: '',
  libraryDir: '',
};

// Fields the server masks — "set" means a value exists but isn't revealed
const SENSITIVE = new Set(['plexToken', 'tmdbApiKey', 'omdbApiKey', 'transmissionPassword']);

export default function SettingsPage() {
  const [form, setForm] = useState<ConfigFields>(EMPTY);
  // Track which sensitive fields were already configured on load
  const [sensitiveSet, setSensitiveSet] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        const wasSet = new Set<string>();
        const filled: Partial<ConfigFields> = {};

        for (const [k, v] of Object.entries(data)) {
          if (SENSITIVE.has(k) && v === 'set') {
            wasSet.add(k);
            filled[k as keyof ConfigFields] = ''; // show empty, placeholder explains
          } else {
            filled[k as keyof ConfigFields] = v ?? '';
          }
        }

        setSensitiveSet(wasSet);
        setForm({ ...EMPTY, ...filled });
      })
      .catch(() => {/* load silently fails — form stays empty */});
  }, []);

  function handleChange(key: keyof ConfigFields, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (status !== 'idle') setStatus('idle');
  }

  async function handleSave() {
    setStatus('saving');
    setErrorMsg('');

    const body: Partial<Record<string, string>> = { ...form };

    // For sensitive fields: if still empty AND was set before, send "set" so server skips it
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
      setStatus('saved');
      // Update sensitiveSet to reflect any newly saved sensitive values
      const newSet = new Set(sensitiveSet);
      for (const key of SENSITIVE) {
        const val = form[key as keyof ConfigFields];
        if (val) newSet.add(key);
        else if (val === '' && !sensitiveSet.has(key)) newSet.delete(key);
      }
      setSensitiveSet(newSet);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  function sensitiveplaceholder(key: keyof ConfigFields) {
    return sensitiveSet.has(key) ? 'Already set — type to change, clear to remove' : 'Not configured';
  }

  return (
    <div className="min-h-screen bg-plex-bg text-gray-100">
      {/* Header */}
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

        {/* Ollama */}
        <Section title="Ollama" description="Local LLM server">
          <Field label="Base URL" value={form.ollamaBaseUrl} placeholder="http://localhost:11434"
            onChange={(v) => handleChange('ollamaBaseUrl', v)} />
          <Field label="Model" value={form.ollamaModel} placeholder="llama3.2"
            onChange={(v) => handleChange('ollamaModel', v)} />
        </Section>

        {/* Plex */}
        <Section title="Plex" description="Media server">
          <Field label="Base URL" value={form.plexBaseUrl} placeholder="http://localhost:32400"
            onChange={(v) => handleChange('plexBaseUrl', v)} />
          <Field label="Token" value={form.plexToken} placeholder={sensitiveplaceholder('plexToken')}
            type="password" onChange={(v) => handleChange('plexToken', v)} />
        </Section>

        {/* TMDB */}
        <Section title="TMDB" description="Movie metadata & posters — themoviedb.org">
          <Field label="API Key" value={form.tmdbApiKey} placeholder={sensitiveplaceholder('tmdbApiKey')}
            type="password" onChange={(v) => handleChange('tmdbApiKey', v)} />
        </Section>

        {/* OMDB */}
        <Section title="OMDB" description="IMDb & Rotten Tomatoes scores — omdbapi.com">
          <Field label="API Key" value={form.omdbApiKey} placeholder={sensitiveplaceholder('omdbApiKey')}
            type="password" onChange={(v) => handleChange('omdbApiKey', v)} />
        </Section>

        {/* Transmission */}
        <Section title="Transmission" description="Torrent client">
          <Field label="Base URL" value={form.transmissionBaseUrl} placeholder="http://localhost:9091"
            onChange={(v) => handleChange('transmissionBaseUrl', v)} />
          <Field label="Username" value={form.transmissionUsername} placeholder="Leave blank if no auth"
            onChange={(v) => handleChange('transmissionUsername', v)} />
          <Field label="Password" value={form.transmissionPassword} placeholder={sensitiveplaceholder('transmissionPassword')}
            type="password" onChange={(v) => handleChange('transmissionPassword', v)} />
          <Field label="Download directory" value={form.transmissionDownloadDir} placeholder="/Users/you/Downloads/Torrents"
            onChange={(v) => handleChange('transmissionDownloadDir', v)} />
          <TransmissionTestRow />
        </Section>

        {/* File Management */}
        <Section title="File Management" description="Plex library path for moving completed downloads">
          <Field label="Library directory" value={form.libraryDir} placeholder="/Volumes/ExternalDrive/Movies"
            onChange={(v) => handleChange('libraryDir', v)} />
        </Section>

        {/* Save */}
        <div className="flex items-center gap-4 pt-2 pb-8">
          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            className="px-6 py-2.5 rounded-xl bg-plex-accent text-black font-semibold text-sm
              hover:bg-plex-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'saving' ? 'Saving…' : 'Save settings'}
          </button>

          {status === 'saved' && (
            <span className="text-green-400 text-sm">Saved</span>
          )}
          {status === 'error' && (
            <span className="text-red-400 text-sm">Error: {errorMsg}</span>
          )}
        </div>

      </div>
    </div>
  );
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

function Field({ label, value, placeholder, type = 'text', onChange }: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password';
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <label className="w-44 flex-shrink-0 text-gray-400 text-xs">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-gray-100 text-sm placeholder-gray-600
          focus:outline-none focus:text-white transition-colors"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

function TransmissionTestRow() {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const test = useCallback(async () => {
    setState('testing');
    setMessage('');
    try {
      const res = await fetch('/api/transmission/test');
      const data = await res.json();
      if (data.ok) {
        setState('ok');
        setMessage(data.version ? `Connected · v${data.version}` : 'Connected');
      } else {
        setState('error');
        setMessage(data.error ?? 'Connection failed');
      }
    } catch {
      setState('error');
      setMessage('Could not reach server');
    }
  }, []);

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-44 flex-shrink-0" />
      <div className="flex items-center gap-3 flex-1">
        <button
          onClick={test}
          disabled={state === 'testing'}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300
            hover:border-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          {state === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {state === 'ok' && (
          <span className="text-xs text-green-400">{message}</span>
        )}
        {state === 'error' && (
          <span className="text-xs text-red-400">{message}</span>
        )}
      </div>
    </div>
  );
}
