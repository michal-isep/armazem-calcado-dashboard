# Armazem Calcado Dashboard

ANDEC / PROPL 2026/2027 - Trabalho pratico 3: warehouse operations dashboard for a footwear manufacturer.

Stack: Next.js (frontend), NestJS (backend), PostgreSQL. Spec-driven development with Claude Code.

## Team
| Person | GitHub | Role |
|---|---|---|
| Lead (Michal Olaf Binek) | michal-isep | Owns repo, merges pull requests, runs Claude Code sessions |
| Federico | fedefrap | Reviewer / validator of calculations |
| Leo | leomancio23 | Docs and spec writing, test cases |
| Paola | (pending) | Docs and spec writing, manual testing |

## Simple rules for everyone
1. Never commit the API key, `.claude/settings.local.json` or the CSV files (already git-ignored).
2. Edit text files in `docs/` using the GitHub website (pencil icon) or VS Code; no terminal needed.
3. Work on a branch, open a pull request, the lead merges. Do not push to `main` directly.
4. Ask the lead before running Claude Code (it spends the shared token budget).

## Layout
- `docs/` - specifications
- `apps/` - frontend and backend (created during the workshop)
- `data/` - original CSVs, local only, never committed
- `CLAUDE.md` - instructions Claude Code reads automatically

## Run locally
Needs Node 24+, npm and Docker. Copy `.env.example` to `.env` and fill in the values (`.env` is git-ignored; never commit it). Export the same variables in the shell that starts the API and the web app.

1. Database: `docker compose up -d --wait` (compose reads `.env`)
2. API: `cd apps/api && npm install && npm run start:dev`, then check `GET /health`
3. Web: `cd apps/web && npm install && npm run dev`, then open http://localhost:3000

Full instructions will be completed in issue #25.
