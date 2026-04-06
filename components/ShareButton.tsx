'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

// Cache resolved values — neither changes during a session
let cachedUrl: string | null = null;
let cachedQrDataUrl: string | null = null;

export default function ShareButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;

    async function resolve() {
      if (cachedUrl && cachedQrDataUrl) {
        setUrl(cachedUrl);
        setQrDataUrl(cachedQrDataUrl);
        return;
      }

      let resolved = cachedUrl;

      if (!resolved) {
        const port = window.location.port || '3000';
        const hostname = window.location.hostname;

        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
          resolved = `http://${hostname}:${port}`;
        } else {
          resolved = `http://${hostname}:${port}`;
          try {
            const r = await fetch('/api/setup/hostname', { cache: 'no-store' });
            const data: { hostname?: string } = await r.json();
            resolved = data.hostname ? `http://${data.hostname}.local:${port}` : resolved;
          } catch {
            // keep the fallback
          }
        }
        cachedUrl = resolved;
      }

      const dataUrl = await QRCode.toDataURL(resolved, { width: 180, margin: 1 });
      cachedQrDataUrl = dataUrl;
      setUrl(resolved);
      setQrDataUrl(dataUrl);
    }

    resolve();
  }, [open]);

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
        aria-label="Share with family"
        title="Share with family"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      </button>

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
