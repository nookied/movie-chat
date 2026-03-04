# Movie Chat

An AI-powered movie assistant for your Plex library. Chat naturally to get personalised recommendations, check what's already in your library, and download anything that isn't — all from one interface.

---

## What it does

- **Chat with an AI** to get movie recommendations based on your mood, genre preferences, favourite actors, or anything else
- **Checks your Plex library** instantly — every suggestion shows whether it's already available to watch
- **One-click downloads** — each recommendation card has a Download button; no need to type anything
- **Moves completed downloads** to your Plex folder automatically and triggers a library scan
- Works from **any device on your local network** — desktop, phone, tablet
- **Resilient AI** — falls back to a local Ollama model automatically if the cloud API is unavailable

---

## Screenshots

> _Chat interface with recommendation cards, Plex status badges, and download tracking_

---

## Prerequisites

Before you start, you'll need:

| Service | What it's for | Cost |
|---|---|---|
| [Node.js](https://nodejs.org) v18+ | Run the app | Free |
| [Plex Media Server](https://www.plex.tv) | Your media library | Free |
| [Transmission](https://transmissionbt.com) | Download manager | Free |
| [OpenRouter](https://openrouter.ai) account | AI chat (cloud) | Free tier available |
| [TMDB API key](https://www.themoviedb.org/settings/api) | Movie metadata & posters | Free |
| [OMDB API key](https://www.omdbapi.com/apikey.aspx) | IMDb & Rotten Tomatoes scores | Free tier available |
| [Ollama](https://ollama.com) _(optional)_ | Local AI fallback | Free |

---

## Installation

### Option A — one-liner (easiest)

Paste this into your terminal. It clones the repo, installs dependencies, and optionally sets up auto-start:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/nookied/movie-chat/main/install.sh)"
```

You'll need [git](https://git-scm.com) and [Node.js](https://nodejs.org) v18+ installed first.

### Option B — manual

```bash
git clone https://github.com/nookied/movie-chat.git
cd movie-chat
npm run setup
```

`npm run setup` checks prerequisites, installs dependencies, and offers to configure [pm2](https://pm2.keymetrics.io) for auto-start on reboot.

---

### After installing — configure your services

Open **http://localhost:3000/settings** (or click the gear icon ⚙️ in the top right) and fill in each section. Everything is saved locally to `config.local.json` — no environment variables needed.

---

## Configuration

Open the Settings page and work through each section:

### OpenRouter (AI Chat)

The cloud LLM that powers the conversation.

1. Sign up at [openrouter.ai](https://openrouter.ai) — there is a free tier
2. Generate an API key
3. Paste it into the **API Key** field
4. Select a model from the dropdown, or leave the default (`mistralai/mistral-small-3.1-24b-instruct:free`)

### Ollama (Optional — Local Fallback)

A locally-running AI that takes over automatically if OpenRouter is unavailable or returns an empty response. Can also be used exclusively.

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2:3b`
3. Set **Base URL** to `http://localhost:11434` (this is pre-filled by default)
4. Select `llama3.2:3b` (or whichever model you pulled) from the **Model** dropdown
5. Use **Send test message** to verify it's responding correctly
6. Toggle **"Use Ollama exclusively"** if you want to skip OpenRouter entirely and always use your local model

> **Tip:** For best results with longer conversations, increase Ollama's context window to 8 192 tokens. In your Modelfile add `PARAMETER num_ctx 8192`, or run: `ollama create llama3.2:3b-ctx8k -f Modelfile`

### Plex

Your media server — used to check which movies you already own.

1. Find your Plex server URL (usually `http://localhost:32400` if running locally)
2. Get your Plex token:
   - Open Plex Web, play any media item
   - Open your browser's developer tools → Network tab
   - Look for any request to your Plex server — the token is in the URL as `X-Plex-Token=...`
   - Alternatively: [how to find your Plex token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)
3. Enter both in the Settings page (URL is pre-filled with the default)

### TMDB

Provides movie posters, synopses, genres, runtime, and director.

1. Create a free account at [themoviedb.org](https://www.themoviedb.org)
2. Go to **Settings → API** and request a free API key
3. Paste the key into the **API Key** field

### OMDB

Provides IMDb ratings and Rotten Tomatoes scores.

1. Get a free API key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx)
2. Paste it into the **API Key** field

### Transmission

The download client that manages your torrents.

1. Install Transmission from [transmissionbt.com](https://transmissionbt.com)
2. Enable the remote (web) interface — in Transmission: **Preferences → Remote → Enable remote access**
3. Set the **Base URL** (pre-filled with the default: `http://localhost:9091`)
4. Enter credentials if you've set a username/password in Transmission's preferences, or leave blank if no auth is configured
5. Set **Download directory** to match Transmission's download folder

### File Management

Controls where completed downloads go after they finish.

- **Library directory** — set this to your Plex Movies folder (e.g. `/Volumes/Drive/Plex/Movies`)
- A disk space indicator shows how full the drive is
- When a download completes, the app automatically:
  1. Copies the video file to `Library directory/Movie Title/`
  2. Removes the torrent from Transmission
  3. Triggers a Plex library scan so it appears immediately
- If left blank, the torrent is just removed from Transmission and the file stays in the download folder

---

## Usage

### Getting recommendations

Just chat! Some examples:
- _"I'm in the mood for something scary but not too gory"_
- _"Suggest a feel-good comedy from the 90s"_
- _"Something like Interstellar"_
- _"What should I watch with my kids tonight?"_

The assistant recommends one film at a time. Each recommendation shows as a card with:
- Movie poster, year, runtime, director
- IMDb, TMDB, and Rotten Tomatoes scores
- A synopsis
- Whether it's **already in your Plex library**
- A **Download button** if a copy is available

### Watching something you already have

If the movie is already in your library, the card shows a green **"On Plex"** badge. The assistant will point you there directly.

### Downloading something new

If the movie isn't in your library and a copy is available, you have two options:

- **Click the Download button** on the recommendation card directly, or
- **Reply in chat** — the assistant will ask _"Want me to download [Title]?"_ and start the download when you confirm

Either way, a download tracker card appears showing progress. When it finishes, the file is automatically moved to your library and Plex is refreshed.

### Starting a new conversation

Click the **pencil icon** ✏️ in the top right to start fresh. Your previous conversation is cleared.

---

## Access from other devices

The app is restricted to your local network — requests from outside are blocked automatically.

Open `http://<your-mac-ip>:3000` on your phone or tablet — find your Mac's IP in **System Settings → Wi-Fi → Details**. You can also use your Mac's hostname: `http://your-mac-name.local:3000`.

> **Note:** `crypto.randomUUID()` requires a secure context (HTTPS). Over plain HTTP on a local IP, the app falls back to a `Math.random`-based UUID, which is fine for local use.

---

## Architecture overview

```
Browser
  └── ChatInterface (Next.js / React)
        ├── Sends messages to /api/chat
        │     ├── OpenRouter (cloud LLM, retry + backoff)
        │     └── Ollama (local fallback — server-side after retries,
        │                 or client-side if OpenRouter streams nothing)
        ├── RecommendationCard
        │     ├── /api/plex/check      → is it in the library?
        │     ├── /api/reviews         → TMDB metadata + OMDB ratings
        │     ├── /api/torrents/search → YTS 1080p availability
        │     └── Download button      → triggers triggerDownload()
        └── DownloadTracker
              ├── /api/transmission/add    → start download
              ├── /api/transmission/status → poll progress (cross-device)
              ├── /api/transmission/control → pause/resume/cancel
              └── /api/files/move  → copy to library + Plex refresh
```

**Key design choices:**
- All config lives in `config.local.json` (gitignored) — no `.env` files needed
- The LLM communicates intent via XML tags: `<recommendation>` triggers a card, `<download>` triggers a torrent
- Chat history is persisted to `localStorage` (up to 200 messages)
- App-initiated torrent IDs are tracked server-side in `app-torrents.json` so downloads started on one device are visible from any device
- OpenRouter's free tier sometimes returns an empty stream; the client automatically retries via Ollama before surfacing an error

---

## Security

The app is designed for trusted local-network use only. It includes:

- **Local-network restriction** — middleware blocks all requests from non-LAN IPs; only RFC-1918 addresses and `.local` mDNS hostnames are allowed
- **Rate limiting** — 30 requests/minute per IP on the chat endpoint
- **Magnet URL validation** — only well-formed `magnet:?xt=urn:btih:` links are accepted
- **SSRF protection** — Plex, Transmission, and Ollama URLs must be localhost or RFC-1918 addresses
- **Torrent ownership** — Transmission control actions (pause/cancel) only work on torrents added through this app
- **Path traversal protection** — file move operations are restricted to the configured library directory

> Do not expose this app to the public internet.

---

## Troubleshooting

**"Cannot reach Ollama — is it running?"**
Start Ollama: `ollama serve` (it may already be running as a background service after installation).

**"No API key configured"**
Go to Settings and add your OpenRouter API key, or enable "Use Ollama exclusively" to skip OpenRouter entirely.

**Ollama responses are cut off mid-sentence**
The model's context window may be too small for long conversations. Set `num_ctx` to at least `8192` in your Modelfile and recreate the model. See the Ollama section above.

**Recommendation card shows no poster / ratings**
Check that your TMDB and OMDB API keys are set correctly in Settings. Both have free tiers with generous limits.

**Download completes but file doesn't appear in Plex**
- Make sure **Library directory** is set correctly in Settings
- Check that Plex has permission to read the directory
- You can trigger a manual library scan in Plex if needed

**App isn't picking up a download I started on another device**
This is handled automatically — the app uses a shared server-side registry. Reload the page on your current device and the download tracker will appear.

**The free OpenRouter model doesn't follow the format**
Switch to a specific model in Settings (e.g. `mistralai/mistral-small-3.1-24b-instruct:free`) or enable Ollama exclusively for more consistent behaviour.

---

## Running as a service (auto-start on boot)

`npm run setup` offers to configure this automatically. If you skipped it or want to set it up manually:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # prints a command — run it to register with your OS
```

**Day-to-day commands:**

```bash
pm2 status          # check if the app is running
pm2 logs movie-chat # tail the logs
pm2 restart movie-chat
pm2 stop movie-chat
```

> Works on both macOS (LaunchAgent) and Linux (systemd).

---

## Development

```bash
npm run dev    # development server with hot reload (port 3000)
npm run build  # production build
npm run lint   # ESLint
```

All configuration is read from `config.local.json` at runtime — no server restart needed after saving settings.
