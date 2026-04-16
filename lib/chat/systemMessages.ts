export function plexFoundSystemMessage(title: string): string {
  return `[System] "${title}" is on Plex. Tell the user it's in their library — no need to download.`;
}

export function titleAvailableSystemMessage(title: string, season?: number): string {
  if (season !== undefined) {
    const seasonLabel = season === 0 ? 'Complete Series' : `Season ${season}`;
    return `[System] "${title}" ${seasonLabel} is available. Ask the user: "Want me to download ${seasonLabel} of ${title}?"`;
  }

  return `[System] "${title}" is available. Ask the user: "Want me to download ${title}?"`;
}

export function noSuitableQualitySystemMessage(title: string): string {
  return `[System] No good copy of "${title}" is available. Tell the user and suggest one alternative.`;
}

export function notFoundSystemMessage(title: string): string {
  return `[System] "${title}" wasn't found anywhere — may not exist or wrong spelling. Tell the user and suggest one alternative.`;
}

export function downloadNotReadySystemMessage(title: string): string {
  return `[System] No download ready for "${title}". Try asking again after the availability check completes.`;
}

export function downloadSkippedSystemMessage(title: string, season?: number): string {
  if (season !== undefined && season > 0) {
    return `[System] "${title}" Season ${season} is already in your Plex library — download skipped.`;
  }

  return `[System] "${title}" is already in your Plex library — download skipped.`;
}

export function downloadFailedSystemMessage(message: string): string {
  return `[System] Download failed: ${message}`;
}
