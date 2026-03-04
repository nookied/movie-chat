import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        {/* Outer ring */}
        <div
          style={{
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            background: '#252525',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '3px solid #e5a00d',
          }}
        >
          {/* Play button */}
          <svg viewBox="0 0 24 24" width="80" height="80" fill="#e5a00d">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  );
}
