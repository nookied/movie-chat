import { NextRequest, NextResponse } from 'next/server';
import { statfsSync, existsSync } from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dirPath = searchParams.get('path');

  if (!dirPath || typeof dirPath !== 'string') {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
  }

  // Must be absolute path
  if (!path.isAbsolute(dirPath)) {
    return NextResponse.json({ error: 'path must be absolute' }, { status: 400 });
  }

  // Walk up to find an existing ancestor so we can still report space even if
  // the leaf folder hasn't been created yet (e.g. a freshly configured library dir)
  let checkPath = dirPath;
  let attempts = 0;
  while (!existsSync(checkPath) && attempts < 10) {
    const parent = path.dirname(checkPath);
    if (parent === checkPath) break; // reached filesystem root
    checkPath = parent;
    attempts++;
  }

  if (!existsSync(checkPath)) {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 });
  }

  try {
    const stats = statfsSync(checkPath);

    // bsize = fundamental block size, blocks = total blocks, bavail = blocks
    // available to unprivileged users (excludes OS-reserved space)
    const total = stats.blocks * stats.bsize;
    const free  = stats.bavail * stats.bsize;
    const used  = total - free;
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;

    return NextResponse.json({ total, free, used, percent });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read disk info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
