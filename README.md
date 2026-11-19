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
Follow the steps in order. The dashboard describes the current state of the data only; it has no forecasts or savings.

### 1. Prerequisites
- Node 24+ and npm
- Docker (for the PostgreSQL database)
- A local copy of the three CSV files (see step 4). They are not in the repository (ADR 0007).

### 2. Environment variables
Copy `.env.example` to `.env` and fill in the values (`.env` is git-ignored; never commit it). Docker Compose reads `.env` by itself. The API, the ETL and the web app do not, so export the same variables in the shell that starts each of them.

| Variable | Used by | Meaning |
|---|---|---|
| `POSTGRES_USER` | Docker Compose (database) | Database user. Required. |
| `POSTGRES_PASSWORD` | Docker Compose (database) | Database password. Required. |
| `POSTGRES_DB` | Docker Compose (database) | Database name. Required. |
| `POSTGRES_PORT` | Docker Compose (database) | Port on your machine for the database. Optional, 5432 if empty or unset; set another one if 5432 is taken. |
| `DATABASE_URL` | API and ETL | Connection string to that database; it must use the same user, password, database and port. Required. |
| `API_PORT` | API | Port the API listens on. Optional, 3001 if unset. |
| `API_URL` | Web app (server side only) | Base address of the API, without a trailing slash, with the port from `API_PORT`. Required. |
| `DATA_DIR` | ETL | Folder with the CSVs. Optional, `../../data` (the repository `data/` folder) if unset. |
| `TEST_DATABASE_URL` | API e2e tests only | A throwaway database the tests may wipe. Never your real one. Not needed to run the dashboard. |

### 3. Database
`docker compose up -d --wait`

This starts PostgreSQL 17 and waits until it is healthy. The data is kept in the `pgdata` volume.

### 4. CSV files
Put these three files in `data/` (local only, git-ignored, never committed):
- `Customer_Order.csv`
- `Picking_Wave.csv`
- `Product.csv`

The names must match exactly. The files are `;`-separated. The ETL only reads them and never edits them. The other CSVs that may be in `data/` are not loaded in this version.

### 5. ETL
With `DATABASE_URL` exported:

`cd apps/api && npm install && npm run etl`

To read the CSVs from another folder, set `DATA_DIR` or run `npm run etl -- <folder>`.

The ETL empties and reloads the tables in one transaction, so it is safe to run again: the result is the same each time, and a failed run keeps the previous data. It prints `ETL done from <folder>` and then one line per count: rows per file (`product_rows`, `customer_order_rows`, `picking_wave_rows`), the rows per rule (`customer_order_excluded_quantity_0`, `customer_order_blank_size_unknown`, `customer_order_exact_duplicates_flagged`), valid rows, orders before and after the exclusion, and units per file. Quantity-0 lines are loaded but marked invalid, and exact duplicates are marked and kept. Compare the counts with `docs/data-profile.md`.

### 6. API
With `DATABASE_URL` and `API_PORT` exported:

`cd apps/api && npm run start:dev`

Check `GET /health` (for example `http://localhost:3001/health` with the default port). `200` with `{"status":"ok","database":"up"}` means the API reaches the database; `503` means it does not.

### 7. Web app
With `API_URL` exported (in a second terminal):

`cd apps/web && npm install && npm run dev`

Open http://localhost:3000. The Overview is the main page; Products, Waves and Warehouse zones are in the navigation.

### Troubleshooting
- **`docker compose` says a required variable is missing a value:** `POSTGRES_USER`, `POSTGRES_PASSWORD` or `POSTGRES_DB` is missing in `.env`.
- **Port already in use for the database:** set `POSTGRES_PORT` to a free port and use the same port in `DATABASE_URL`.
- **`ETL failed: DATABASE_URL is not set`:** export `DATABASE_URL` in the shell that runs `npm run etl`.
- **`Error: ENOENT: no such file or directory, open '<folder>/<name>.csv'` (with a Node stack trace, no `ETL failed` line):** that file is missing from the folder the ETL reads (`DATA_DIR`, the folder given to `npm run etl --`, or `data/`). The ETL reads `Product.csv` first, so it may name only one missing file at a time.
- **`ETL failed: ... row N: ...`:** a value in that CSV does not have the expected format (date `dd/mm/yyyy hh:mm`, whole-number quantity, required column). The old data is kept.
- **Pages show "unavailable":** the API is not running, `API_URL` is not set or points to the wrong port, or the API rejected the filters. Check `GET /health`. The message on the page says which one it is (`API_URL is not set`, `API unreachable`, or `API answered <status>`).
- **`/health` answers 503:** the database is down or `DATABASE_URL` is wrong. Run `docker compose ps`.
