'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Section from '@/components/ui/Section';
import Field from '@/components/ui/Field';
import StatusIcon from '@/components/ui/StatusIcon';
import type { ServiceStatus } from '@/components/ui/StatusIcon';

// ── Step definitions ─────────────────────────────────────────────────────────

type StepId = 'summary' | 'plex' | 'metadata';

const STEPS: { id: StepId; title: string; subtitle: string }[] = [
  { id: 'summary',  title: 'Setup Complete',  subtitle: 'Here\'s what was installed for you' },
  { id: 'plex',     title: 'Plex Library',    subtitle: 'Connect your movie library' },
  { id: 'metadata', title: 'Movie Info',      subtitle: 'Posters, ratings, and descriptions' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function saveConfig(fields: Record<string, string>) {
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

async function testService(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// ── Main wizard ──────────────────────────────────────────────────────────────

function SetupWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [detected, setDetected] = useState<Record<string, string>>({});

  // Form state
  const [plexUrl, setPlexUrl] = useState('');
  const [plexToken, setPlexToken] = useState('');
  const [tmdbKey, setTmdbKey] = useState('');
  const [omdbKey, setOmdbKey] = useState('');

  // OpenRouter OAuth (if user came back from sign-in)
  const [openRouterConnected, setOpenRouterConnected] = useState(false);

  // Status
  const [plexStatus, setPlexStatus] = useState<ServiceStatus>('idle');
  const [tmdbStatus, setTmdbStatus] = useState<ServiceStatus>('idle');
  const [omdbStatus, setOmdbStatus] = useState<ServiceStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Check for OpenRouter OAuth callback
  useEffect(() => {
    if (searchParams.get('openrouter') === 'connected') {
      setOpenRouterConnected(true);
    }
    const err = searchParams.get('error');
    if (err) {
      setErrorMsg('Cloud AI sign-in failed — you can try again or skip for now.');
    }
  }, [searchParams]);

  // Auto-detect services on mount
  useEffect(() => {
    fetch('/api/setup/detect', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        setDetected(data);
        if (data.plex) setPlexUrl(data.plex);
      })
      .catch(() => {});
  }, []);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // ── Step handlers ──────────────────────────────────────────────────────────

  const savePlex = useCallback(async () => {
    if (!plexUrl || !plexToken) return;
    setPlexStatus('checking');
    await saveConfig({ plexBaseUrl: plexUrl, plexToken: plexToken });
    const ok = await testService(
      `/api/plex/test?baseUrl=${encodeURIComponent(plexUrl)}&token=${encodeURIComponent(plexToken)}`
    );
    setPlexStatus(ok ? 'ok' : 'error');
    if (!ok) setErrorMsg('Could not connect to Plex. Check the address and token.');
  }, [plexUrl, plexToken]);

  const saveMetadata = useCallback(async () => {
    const fields: Record<string, string> = {};
    if (tmdbKey) fields.tmdbApiKey = tmdbKey;
    if (omdbKey) fields.omdbApiKey = omdbKey;
    if (Object.keys(fields).length > 0) await saveConfig(fields);

    if (tmdbKey) {
      setTmdbStatus('checking');
      const ok = await testService(`/api/tmdb/test?key=${encodeURIComponent(tmdbKey)}`);
      setTmdbStatus(ok ? 'ok' : 'error');
    }
    if (omdbKey) {
      setOmdbStatus('checking');
      const ok = await testService(`/api/omdb/test?key=${encodeURIComponent(omdbKey)}`);
      setOmdbStatus(ok ? 'ok' : 'error');
    }
  }, [tmdbKey, omdbKey]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  function finishWizard() {
    document.cookie = 'movie-chat-configured=1; path=/; max-age=86400';
    router.push('/');
  }

  async function handleNext() {
    setErrorMsg('');
    if (currentStep.id === 'plex') await savePlex();
    if (currentStep.id === 'metadata') await saveMetadata();
    isLast ? finishWizard() : setStep(step + 1);
  }

  function handleBack() {
    setErrorMsg('');
    if (step > 0) setStep(step - 1);
  }

  function handleSkip() {
    isLast ? finishWizard() : setStep(step + 1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-plex-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Movie Chat</h1>
          <p className="text-gray-500 text-sm mt-1">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-plex-accent' : 'bg-plex-border'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <Section title={currentStep.title} description={currentStep.subtitle}>

          {/* ── Step 1: Summary ─────────────────────────────────────────── */}
          {currentStep.id === 'summary' && (
            <>
              <div className="px-4 py-3">
                <p className="text-gray-500 text-xs">
                  These were set up automatically. You can change any of these later in Settings.
                </p>
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <StatusIcon status={detected.ollama ? 'ok' : 'error'} />
                <div>
                  <div className="text-sm text-gray-200">AI Assistant (Ollama)</div>
                  <div className="text-xs text-gray-500">
                    {detected.ollama ? 'Running locally — your conversations stay private' : 'Not detected — you can set it up in Settings'}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <StatusIcon status={detected.plex ? 'ok' : 'idle'} />
                <div>
                  <div className="text-sm text-gray-200">Plex Media Server</div>
                  <div className="text-xs text-gray-500">
                    {detected.plex ? 'Found on your computer' : 'Installed — needs to be connected (next step)'}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 flex items-center gap-3">
                <StatusIcon status={detected.transmission ? 'ok' : 'idle'} />
                <div>
                  <div className="text-sm text-gray-200">Transmission</div>
                  <div className="text-xs text-gray-500">
                    {detected.transmission ? 'Ready for downloads' : 'Installed — open it from your Applications folder'}
                  </div>
                </div>
              </div>

              {/* Optional: Cloud AI upsell */}
              <div className="px-4 py-3 border-t border-plex-border">
                <div className="flex items-center gap-3">
                  <StatusIcon status={openRouterConnected ? 'ok' : 'idle'} />
                  <div className="flex-1">
                    <div className="text-sm text-gray-200">Cloud AI (optional)</div>
                    <div className="text-xs text-gray-500">
                      {openRouterConnected
                        ? 'Connected — will be used as primary AI'
                        : 'Faster and smarter than Local AI. Free account.'}
                    </div>
                  </div>
                </div>
                {!openRouterConnected && (
                  <a
                    href={`https://openrouter.ai/auth?callback_url=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/api/openrouter/callback`
                        : 'http://localhost:3000/api/openrouter/callback'
                    )}`}
                    className="inline-block mt-2 ml-8 bg-plex-card border border-plex-border text-gray-300 text-xs px-4 py-1.5 rounded-lg
                      hover:border-gray-500 hover:text-white transition-colors"
                  >
                    Connect Cloud AI
                  </a>
                )}
              </div>
            </>
          )}

          {/* ── Step 2: Plex ────────────────────────────────────────────── */}
          {currentStep.id === 'plex' && (
            <>
              <div className="px-4 py-3">
                <p className="text-gray-500 text-xs">
                  Plex was installed on your computer. To connect it to Movie Chat,
                  you need your Plex token — a special password that lets this app
                  check what movies you already have.
                </p>
              </div>

              {detected.plex && plexStatus === 'idle' && (
                <div className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon status="ok" />
                    <span className="text-green-400 text-sm">Plex is running at {detected.plex}</span>
                  </div>
                </div>
              )}

              <Field
                label="Plex address"
                value={plexUrl}
                placeholder={detected.plex || 'http://localhost:32400'}
                status={plexStatus}
                onChange={setPlexUrl}
              />
              <Field
                label="Plex token"
                value={plexToken}
                placeholder="Paste your Plex token here"
                type="password"
                status={plexStatus}
                onChange={setPlexToken}
              />
              <div className="px-4 py-2 pb-3">
                <p className="text-gray-600 text-xs mb-1">
                  To find your token: open Plex in your browser, go to any movie,
                  click the &quot;...&quot; menu, click &quot;Get Info&quot;, then &quot;View XML&quot;.
                  The token is in the URL after &quot;X-Plex-Token=&quot;.
                </p>
                <a
                  href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-plex-accent text-xs hover:underline"
                >
                  Detailed instructions with pictures
                </a>
              </div>

              {errorMsg && <p className="text-red-400 text-xs px-4 pb-3">{errorMsg}</p>}
            </>
          )}

          {/* ── Step 3: Movie Info ──────────────────────────────────────── */}
          {currentStep.id === 'metadata' && (
            <>
              <div className="px-4 py-3">
                <p className="text-gray-500 text-xs">
                  These two free services add movie posters, plot summaries,
                  and ratings (IMDb, Rotten Tomatoes) to each recommendation.
                  The app works without them, but it looks much better with them.
                </p>
              </div>

              <div className="px-4 pt-2 pb-1">
                <p className="text-gray-400 text-xs font-medium">Posters and descriptions</p>
              </div>
              <Field
                label="TMDB key"
                value={tmdbKey}
                placeholder="Paste your key here"
                type="password"
                status={tmdbStatus}
                onChange={setTmdbKey}
              />
              <div className="px-4 py-1">
                <a
                  href="https://www.themoviedb.org/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-plex-accent text-xs hover:underline"
                >
                  Get a free TMDB key (takes about 1 minute)
                </a>
              </div>

              <div className="px-4 pt-3 pb-1">
                <p className="text-gray-400 text-xs font-medium">IMDb and Rotten Tomatoes ratings</p>
              </div>
              <Field
                label="OMDB key"
                value={omdbKey}
                placeholder="Paste your key here"
                type="password"
                status={omdbStatus}
                onChange={setOmdbKey}
              />
              <div className="px-4 py-1 pb-3">
                <a
                  href="https://www.omdbapi.com/apikey.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-plex-accent text-xs hover:underline"
                >
                  Get a free OMDB key (takes about 1 minute)
                </a>
              </div>
            </>
          )}
        </Section>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className={`text-sm px-4 py-2 rounded-lg transition-colors ${
              step === 0
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Back
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 px-4 py-2 hover:text-gray-300 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="text-sm bg-plex-accent text-white px-6 py-2 rounded-lg
                hover:bg-plex-accent/90 transition-colors font-medium"
            >
              {isLast ? "I'm done" : 'Next'}
            </button>
          </div>
        </div>

        {/* Power user escape hatch */}
        <div className="text-center mt-8">
          <a href="/settings" className="text-gray-600 text-xs hover:text-gray-400 transition-colors">
            I know what I&apos;m doing — take me to advanced settings
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SetupWizard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-plex-bg" />}>
      <SetupWizardInner />
    </Suspense>
  );
}
