# 🎮 Game Hub

A polished multiplayer game lounge built with Next.js, TypeScript, Prisma, PostgreSQL, NextAuth, and a custom WebSocket server.

---

## 🧠 Overview

Game Hub is a full-stack social gaming project focused on quick access, clean player identity, party-based matchmaking, and live multiplayer flows.

The app includes Google authentication, first-time profile creation, friends and invites, party management, public and private queues, live lobby synchronization, and a complete TicTacToe multiplayer experience with rematch and return-to-lobby flows.

The project is built as a real product-style app rather than a static demo, with an App Router frontend, Prisma-backed data model, and a custom Node + WebSocket runtime for realtime communication.

---

## 📸 Preview

![Mini Trello Screenshot](./public/images/README%20Preview/PreviewImage.png)

---

## 🔥 Features

- 🔐 **Google authentication** powered by NextAuth and Prisma Adapter
- 👤 **First-time onboarding flow** with in-game name, short tag, and avatar selection
- 👥 **Friends system** with requests, accept / decline flow, and shared player identity
- 🎯 **Party lobby system** with owner controls, seat management, invites, and queue state
- 🌐 **Public and private matchmaking modes** for the supported game catalog
- ⚡ **Realtime updates** for presence, lobby changes, invites, and match state
- ❌⭕ **Online TicTacToe** with turn sync, winner detection, rematch requests, and match overlay
- 🏆 **Animated match result overlay** with reusable UI and winner presentation
- 🎨 **Custom product UI** with a stylized login flow, lobby layout, floating panels, and responsive screens

---

## 🎯 Product Highlights

- **Login** is treated like a real branded entry point, not a default auth screen
- **Create profile** gives new users a structured onboarding step before entering the app
- **Games** works as the main multiplayer lounge where players can queue, invite, and manage parties
- **Friends sidebar** acts as a live social layer for requests, identities, and lobby invites
- **TicTacToe match room** is designed as a complete multiplayer surface, not just a basic board

---

## 🕹️ Current Game Support

At the moment the game catalog includes:

- ❌⭕ **TicTacToe**
  - Public matchmaking for solo queue
  - Private party mode for direct friend play
  - Live board sync
  - Winner / draw resolution
  - Rematch flow

The internal game catalog is already structured so more games can be added later without redesigning the whole lobby system.

---

## 🛠️ Tech Stack

**Frontend:**

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4

**Authentication & Data:**

- NextAuth
- Prisma
- PostgreSQL
- Neon

**Realtime & Multiplayer:**

- Custom Node server
- Native `ws` WebSocket server
- Session-aware websocket auth

**Deployment:**

- Railway for the full app runtime
- Neon for the database

---

## 🧩 Main Capabilities

- Sign in with Google and restore the same player identity across sessions
- Complete onboarding with a custom in-game name, tag, and avatar
- Send and receive friend requests
- Open the friends panel from the main app flow
- Create or restore a lobby automatically when entering the games area
- Invite friends into a private party
- Start public or private TicTacToe sessions based on queue mode
- Keep party members synchronized with realtime updates and fallback refreshes
- Play TicTacToe in a dedicated match room with live turn updates
- Request rematches and return the party to the lobby after a finished match

---

## 🏗️ Architecture Notes

Game Hub uses a custom server entrypoint instead of running only the default Next.js runtime.

Why:

- the project needs long-lived WebSocket connections
- realtime events are tied to authenticated users
- party, presence, and match updates are pushed live through a shared server process

Important deployment note:

- the current architecture is best suited to a persistent Node host such as Railway
- a split setup like `Vercel + separate realtime host` would require an additional shared event bridge or pub/sub layer

---

## 🚀 Local Development

```bash
# install dependencies
npm install

# build the project
npm run build

# start local development server
npm run dev
```

Open `http://localhost:3000` in your browser.

Useful commands:

```bash
# lint the project
npm run lint

# production build check
npm run build

# start production server locally
npm run start
```

---

## 🔐 Environment Variables

Create a local `.env` file and provide the required values.

Required:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional / environment-specific:

- `HOST`
- `PORT`
- `NEXT_PUBLIC_REALTIME_ORIGIN`

Notes:

- `NEXTAUTH_URL` should be the full base URL of the deployed app, without a trailing slash
- `NEXT_PUBLIC_REALTIME_ORIGIN` is only needed if the frontend and realtime server are hosted on different domains
- `GOOGLE_REDIRECT_URI` is not used by the current codebase

Example production callback for Google OAuth:

```text
https://your-domain/api/auth/callback/google
```

---

## 🌍 Deployment

**Recommended production setup:**

- **App runtime:** Railway
- **Database:** Neon PostgreSQL
- **Auth provider:** Google OAuth

Production notes:

- Railway should run the custom Node server with a public domain attached
- the app must listen on Railway's assigned `PORT`
- `NEXTAUTH_URL` must match the final public domain exactly
- Google OAuth must include the production callback URL
- the current custom server is configured for Railway-style hosting with production binding on `0.0.0.0`

Build / start commands:

```bash
npm run build
npm run start
```

---

## 🌐 Live Demo

[Game Hub](https://game-hub-production-4276.up.railway.app/)

---

## 📁 Project Structure

- `app/(site)` — main authenticated site routes and product surfaces
- `app/api` — auth, friends, lobbies, and match endpoints
- `app/login` — branded sign-in entry point
- `app/create` — onboarding flow for first-time players
- `components/GamesLobby.tsx` — party lobby UI and queue controls
- `components/Friends.tsx` — friends sidebar, invites, and social realtime UI
- `components/TicTacToeMatch.tsx` — live TicTacToe match room
- `components/MatchResultOverlay.tsx` — reusable finished-match overlay
- `lib/auth.ts` — NextAuth configuration
- `lib/lobbies.ts` — lobby lifecycle, seat logic, and matchmaking helpers
- `lib/matches.ts` — TicTacToe match state and move logic
- `lib/realtime-bridge.mjs` — process-local realtime bridge used by the server
- `server.mjs` — custom HTTP + WebSocket runtime
- `prisma/schema.prisma` — PostgreSQL data model

---

## ✅ Status

Game Hub is currently in an advanced MVP state with:

- Google login
- onboarding flow
- friends system
- party lobbies
- public and private queue logic
- live multiplayer TicTacToe
- realtime presence and updates
- Railway-compatible deployment setup

---

## 📌 Roadmap Ideas

- Add more games to the shared lobby system
- Introduce a distributed realtime bridge for multi-instance scaling
- Expand party and moderation features
- Add richer player profile and account settings
- Improve production observability and deployment automation

---

## 📄 License

No license has been added yet.
