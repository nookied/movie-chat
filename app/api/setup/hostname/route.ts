import { NextResponse } from 'next/server';
import os from 'os';

/** Returns the machine's hostname for constructing .local mDNS URLs. */
export async function GET() {
  try {
    return NextResponse.json({ hostname: os.hostname() });
  } catch {
    return NextResponse.json({ hostname: null });
  }
}
