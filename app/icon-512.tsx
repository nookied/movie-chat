import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon512() {
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
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: '#252525',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '8px solid #e5a00d',
          }}
        >
          <svg viewBox="0 0 24 24" width="230" height="230" fill="#e5a00d">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  );
}
