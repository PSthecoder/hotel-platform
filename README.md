# Mumbai Boutique Hotels – Full-Stack Booking & Enquiry Platform

[![CI](https://github.com/YOUR-USER/YOUR-REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR-USER/YOUR-REPO/actions)

A booking and enquiry website for a fictional 14-property Mumbai boutique hotel group, with guest and admin roles,
an analytics dashboard (Occupancy, ADR, RevPAR), a data-cleaning seed pipeline, tests, and CI/CD.

| | |
|---|---|
| **Live front end** | `<your-vercel-url>` |
| **Live API** | `<your-render-url>/api` · Swagger docs at `/api/docs` |
| **Architecture** | [docs/architecture.md](docs/architecture.md) |

## Features
- Sign-up / login with **JWT access tokens + rotating refresh tokens** (httpOnly cookie, reuse detection)
- **Role-based access**: `user` and `admin`
- **CRUD** for properties, room types, rooms, bookings, enquiries, reviews
- **Search with filters**: city, dates (real availability), guests, price, room type, rating, sorting, pagination
- **Image upload** with magic-byte checks, 2 MB cap
- **Admin dashboard**: Occupancy %, ADR, RevPAR, per-property table, daily trend
- **Validation on both client and server** (Zod), one consistent JSON error shape, structured logs (Winston)
- **No double booking**: PostgreSQL exclusion constraint
- **Stretch**: email notifications + BullMQ job queue (falls back to in-process when Redis is not configured)

## Tech stack
React 18 + Vite · Node 20 + Express 4 · PostgreSQL 16 · Zod · bcrypt · JWT · Winston · BullMQ/Redis · GitHub Actions · Vercel · Render

## Quick start (local)
Prerequisites: Node 20+, PostgreSQL 14+ (with the `btree_gist` extension, included in standard installs).

```bash
# 1. Database
createdb hotel_dev

# 2. API
cd server
cp ../.env.example .env            # then edit DATABASE_URL and set JWT_ACCESS_SECRET
npm install
npm run migrate                    # create tables
npm run seed                       # generate messy raw data, clean it, load it (prints a quality report)
npm run dev                        # http://localhost:4000  (docs: /api/docs)

# 3. Front end (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                        # http://localhost:5173
```

Seeded logins (development only): `admin@hotel.test` / `Admin@12345` (or your `ADMIN_PASSWORD`) and `guest@hotel.test` / `Guest@12345`.

> After the first `npm install`, commit the generated `package-lock.json` files in `server/` and `client/`.

## Tests
```bash
cd server && npm test        # unit tests + API tests (API tests need DATABASE_URL, they skip otherwise)
cd client && npm test        # validation tests (Vitest)
```
CI (`.github/workflows/ci.yml`) runs these on **every push** against a PostgreSQL service container, also smoke-tests the seed pipeline, builds the client, scans for secrets, and (on `main`) triggers the Render deploy.

## Seed data and the messy cases
`npm run seed` first generates raw CSVs (`server/db/raw`, git-ignored) that imitate exports from 14 properties, then cleans and loads them:

| Messy case | Rule |
|---|---|
| Same room type, different names (`Deluxe Sea View`, `Premier Ocean`, `DLX-SV`) | Alias map → one canonical type (`services/cleaning.js`) |
| Rates in INR and USD | USD converted at `USD_INR_RATE`; original amount + currency kept |
| Check-out before check-in | Swapped if plausible and logged; zero-night/implausible rows quarantined |
| Duplicates, blank amounts, invalid ratings, `DD/MM/YYYY` vs ISO dates | Removed / base-rate fallback / quarantined / parsed explicitly |

Every change is written to the `data_quality_log` table.

## Deployment
**Database + API (Render)**: New → Blueprint → select this repo (`render.yaml`). Set the `sync:false` variables
(`CORS_ORIGIN`, `PUBLIC_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, optional SMTP/Redis). After the first deploy, run `npm run seed`
once from the Render shell (set `ALLOW_SEED=true` for that run). In Render, copy the **Deploy Hook** URL into the GitHub secret `RENDER_DEPLOY_HOOK_URL`.

**Front end (Vercel)**: Import the repo, set **Root Directory = `client`**, add env `VITE_API_URL=https://<your-render-url>/api`.

**Environment variables**: see [`.env.example`](.env.example). Real values live only in the Render/Vercel dashboards and GitHub Secrets – never in git.

Notes for the free tier:
- The Render free API sleeps when idle (first request can take ~30 s). Use an uptime pinger on `/api/health` before a demo.
- Render's disk is ephemeral, so uploaded images are lost on redeploy. For permanent images use a Render disk (paid) or switch `middleware/upload.js` to S3/Cloudinary.
- The refresh cookie is `SameSite=None; Secure` in production. Browsers that block third-party cookies (e.g. Safari) will not persist logins across Vercel↔Render domains; serving both under one parent domain (e.g. `app.example.com` and `api.example.com`) fixes that.

## Project layout
```
client/   React + Vite SPA           server/   Express API (routes, middleware, services, jobs)
server/db schema.sql, migrate.js     server/scripts  generate-raw-data.js, seed.js
server/tests  unit/ + api/           docs/     architecture, diagrams
```

## Scaling the weakest part
Availability search and dashboard aggregation scan `bookings` by date range. Plan: (1) verify with `EXPLAIN ANALYZE`, (2) Redis cache for
search/property lists, (3) pre-aggregated daily stats table refreshed by a job, (4) read replica for search/reporting, (5) multiple stateless API
instances, (6) partition `bookings` by year. Correctness under load is preserved because overlap prevention lives in the database.
