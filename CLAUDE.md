# movie-chat — Claude Instructions

## Architecture
- **Dev machine**: macOS, runs `npm run dev` or `pm2 start`
- **Plex**: runs on a **separate machine** on the local network (not the dev machine)
- **Transmission**: runs on the same separate machine as Plex
- **Ollama**: may run locally or on the separate machine — ask if unclear
- All external service URLs are configured via `.env.local` (PLEX_BASE_URL, TRANSMISSION_BASE_URL, etc.)

## Development Guidelines
When implementing any change, identify whether it affects the **movie flow**, the **TV show flow**, or both. If it touches both, verify the behaviour in each separately — the two flows diverge significantly (movie: YTS torrent + single download; TV: EZTV/Knaben + season picker + multi-season logic).

## Debugging Guidelines
When debugging connection or API issues, always ask the user about the deployment topology first (e.g., "Is the server running locally or on a remote machine?"). Do not assume services are running on the same machine as the development environment.

Before debugging, map out the architecture: what services are involved, where each one runs (local vs remote), and how they communicate. Ask me to clarify anything you're unsure about before attempting fixes.
