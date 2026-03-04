import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

// Named export required for Next.js to serve this as /icon-192.png
export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#1a1a1a',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '150px',
            height: '150px',
            borderRadius: '50%',
            background: '#252525',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '3px solid #e5a00d',
          }}
        >
          <svg viewBox="0 0 24 24" width="86" height="86" fill="#e5a00d">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  );
}
