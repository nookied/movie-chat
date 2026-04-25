import fs from 'fs';
import path from 'path';

/** Shared helper used by /api/config and /api/diagnostics/bundle so the
 *  package.json read path only lives in one place. Not cached — tests rely
 *  on being able to override fs mocks between calls, and the file is only
 *  hit a handful of times per session. */
export function getVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}
