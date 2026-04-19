'use client';

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

// Cache resolved values — neither changes during a session
let cachedUrl: string | null = null;
let cachedQrDataUrl: string | null = null;
let cachedWindowOrigin: string | null = null;

function buildOrigin(protocol: string, hostname: string, port: string): string {
  const defaultPort = protocol === 'https:' ? '443' : '80';
  const portSuffix = port && port !== defaultPort ? `:${port}` : '';
  return `${protocol}//${hostname}${portSuffix}`;
}

interface ShareButtonProps {
  variant?: 'icon' | 'row';
}

export default function ShareButton({ variant = 'icon' }: ShareButtonProps = {}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedResetTimeoutRef.current) clearTimeout(copiedResetTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function resolve() {
      const currentOrigin = window.location.origin;
      if (cachedWindowOrigin === currentOrigin && cachedUrl && cachedQrDataUrl) {
        setUrl(cachedUrl);
        setQrDataUrl(cachedQrDataUrl);
        return;
      }

      let resolved = cachedWindowOrigin === currentOrigin ? cachedUrl : null;

      if (!resolved) {
        const port = window.location.port || '3000';
        const hostname = window.location.hostname;
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          resolved = buildOrigin(protocol, hostname, port);
        } else {
          resolved = buildOrigin(protocol, hostname, port);
          try {
            const r = await fetch('/api/setup/hostname', { cache: 'no-store' });
            const data: { hostname?: string } = await r.json();
            resolved = data.hostname ? buildOrigin(protocol, `${data.hostname}.local`, port) : resolved;
          } catch {
            // keep the fallback
          }
        }
        cachedUrl = resolved;
        cachedWindowOrigin = currentOrigin;
      }

      try {
        const dataUrl = await QRCode.toDataURL(resolved, { width: 180, margin: 1 });
        if (cancelled) return;
        cachedQrDataUrl = dataUrl;
        setUrl(resolved);
        setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) {
          setUrl(resolved);
          setQrDataUrl('');
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function copyUrl() {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      if (copiedResetTimeoutRef.current) clearTimeout(copiedResetTimeoutRef.current);
      setCopied(true);
      copiedResetTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(false);
    });
  }

  return (
    <>
      {variant === 'row' ? (
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
        >
          Show QR code
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          aria-label="Share with family"
          title="Share with family"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-plex-card border border-plex-border rounded-2xl p-6 w-80 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-semibold text-lg text-center mb-1">Share with family</h2>
            <p className="text-gray-500 text-xs text-center mb-5">
              Scan this QR code with a phone to open Movie Chat
            </p>

            {/* QR Code */}
            <div className="flex justify-center mb-5">
              <div className="bg-white rounded-xl p-3">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="QR code"
                    width={180}
                    height={180}
                    className="block"
                  />
                ) : (
                  <div className="w-[180px] h-[180px] flex items-center justify-center text-gray-400 text-xs">
                    Generating…
                  </div>
                )}
              </div>
            </div>

            {/* URL + copy */}
            <div className="flex items-center gap-2 bg-plex-bg rounded-lg px-3 py-2 mb-4">
              <span className="flex-1 text-gray-300 text-sm truncate font-mono">{url}</span>
              <button
                onClick={copyUrl}
                className="text-xs text-plex-accent hover:text-white transition-colors flex-shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p className="text-gray-600 text-xs text-center mb-4">
              Works for anyone on the same Wi-Fi network
            </p>

            <button
              onClick={() => setOpen(false)}
              className="w-full text-sm text-gray-400 hover:text-white py-2 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
