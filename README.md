# test-auditor — Integration Guide

Audit Jest test suites in any Next.js (or JS/TS) app: discover tests, run static checks, execute Jest with coverage, and write a Markdown report.

---

## Before you start

You need:

- Node.js installed
- A Next.js (or JS/TS) app that already uses **Jest**
- The folder where that app’s Jest config / `npm test` lives

---

## Client project setup (recommended)

One-time setup so every developer can run `npm run audit` without re-entering the API URL or API key.

### 1. Install

```bash
npm install --save-dev test-auditor
```

### 2. Initialize project config

From your repo root (or the monorepo root):

```bash
npx test-auditor init
```

This creates `.test-auditor.json` (safe to commit):

```json
{
  "apiUrl": "https://api.example.com/api/reports"
}
```

You can also copy `.test-auditor.json.example` and edit the URL.

### 3. Configure `.test-auditor.json` (primary configuration)

`npx test-auditor init` creates this file at the project/monorepo root:

```json
{
  "apiUrl": "http://localhost:3000/api/reports",
  "apiKey": "<PROJECT_API_KEY>",
  "cmsReadiness": false,
  "schedule": {
    "enabled": false,
    "frequency": "daily",
    "time": "09:00",
    "timezone": "UTC"
  }
}
```

- **apiUrl** — report upload endpoint (not prompted during `npm run audit`)
- **apiKey** — project API key (sent via `x-api-key` header only)
- **cmsReadiness** — set `true` to include CMS checks without prompting each time

Keep secrets out of git: add `.test-auditor.json` to `.gitignore` if it contains your API key.

Environment variables (`TEST_AUDITOR_API_KEY`, `TEST_AUDITOR_API_URL`) still work as optional fallbacks for CI.

### 4. Add an npm script

```json
{
  "scripts": {
    "audit": "test-auditor --path . --no-open"
  }
}
```

`test-auditor init` can add this and ensures `test-auditor` is listed under **devDependencies**.

### 5. Run

```bash
npm run audit
```

Pass extra flags after `--`:

```bash
npm run audit -- --cms-readiness
```

### CMS readiness (opt-in)

CMS checks are **off by default**. When enabled (`--cms-readiness` or `"cmsReadiness": true`):

1. The CLI asks whether to include CMS readiness (interactive runs).
2. CMS packages are **detected from the app's `package.json`** dependencies.
3. **One CMS detected** → used automatically (no source/target prompts).
4. **Multiple CMSs detected** → you choose how they are used (migration, used together, or pick which to check).

Non-interactive migration:

```bash
test-auditor --path . --cms-from aem --cms-to contentful --no-open
```

### Configuration precedence

| Setting | Precedence |
|---------|------------|
| API URL | CLI `--api-url` → `TEST_AUDITOR_API_URL` → `.test-auditor.json` → default |
| API key | CLI `--api-key` → `.test-auditor.json` → `TEST_AUDITOR_API_KEY` (fallback) |
| CMS readiness | CLI `--cms-readiness` / `--no-cms` → `.test-auditor.json` → off |

---

## Finding the correct `--path` (most important)

`--path` must point to the folder where Jest is configured — the same place you would run `npm test` or `npm run test:coverage`.

### How to get the path

In your terminal:

```bash
cd /path/to/your/app
pwd
```

`pwd` prints the absolute path. Copy that value into `--path`.

Example:

```bash
pwd
# /Users/you/Documents/my-next-app
```

Then:

```bash
npx test-auditor --path /Users/you/Documents/my-next-app
```

You can also use `.` if your shell is already inside that folder:

```bash
cd /Users/you/Documents/my-next-app
npx test-auditor --path .
```

---

## Where to point `--path`

### Normal Next.js app (single package)

```text
my-next-app/          ← point --path HERE
  package.json        (has "test" / jest)
  jest.config.js
  app/ or pages/
  ...
```

```bash
npx test-auditor --path /Users/you/Documents/my-next-app
```

### Monorepo (npm/yarn/pnpm workspaces, Turborepo, etc.)

Do **not** point at the monorepo root if Jest lives inside a workspace package.

```text
seabiscuit-pwa/                 ← NOT here (usually)
  package.json                  (turbo scripts only)
  apps/
    web/                        ← point --path HERE
      package.json              (has "test" / jest)
      config/tests/jest.config.js
      ...
    ...
  packages/
    ...
```

```bash
npx test-auditor --path /Users/you/Documents/seabiscuit-pwa/apps/web
```

**Rule of thumb:** `--path` = folder that contains the Jest config (or `package.json` → `jest` field) for the app you want to audit.

| Setup | Point `--path` at |
|--------|-------------------|
| Single Next app | App root (where `package.json` + Jest live) |
| Monorepo | The workspace package that runs Jest (e.g. `apps/web`) |
| Wrong | Monorepo root with no real Jest project → often **0 tests / no coverage** |

---

## Option A — Install from npm (published package)

Use this when `test-auditor` is published and you want a normal dependency.

### Steps

1. Open a terminal in **your Next app** (or the monorepo package with Jest):

   ```bash
   cd /Users/you/Documents/my-next-app
   # monorepo example:
   # cd /Users/you/Documents/seabiscuit-pwa/apps/web
   ```

2. Install the CLI:

   ```bash
   npm install -D test-auditor
   ```

3. Confirm your path:

   ```bash
   pwd
   ```

4. Run the auditor:

   ```bash
   npx test-auditor --path "$(pwd)"
   ```

   Or with an explicit path and output file:

   ```bash
   npx test-auditor \
     --path /Users/you/Documents/my-next-app \
     --o ./audit-report.md
   ```

5. Open the report:

   ```bash
   open ./audit-report.md
   # or open the path printed under "Report"
   ```

### Optional npm script

In that app’s `package.json`:

```json
{
  "scripts": {
    "audit:tests": "test-auditor --path ."
  }
}
```

Then:

```bash
npm run audit:tests
```

---

## Option B — Local development with `npm link`

Use this while developing `test-auditor` itself, or before it is published.

### Steps (library side)

1. Go to the library folder and build:

   ```bash
   cd /Users/you/Documents/UTC-Audit/test-auditor
   npm install
   npm run build
   ```

2. Register a global link for the package name (`test-auditor`):

   ```bash
   npm link
   ```

### Steps (Next app side)

3. Go to the app (or monorepo Jest package) and link it:

   ```bash
   cd /Users/you/Documents/seabiscuit-pwa/apps/web
   npm link test-auditor
   ```

4. Run:

   ```bash
   pwd
   npx test-auditor --path "$(pwd)"
   ```

After each library code change:

```bash
cd /Users/you/Documents/UTC-Audit/test-auditor
npm run build
# app already linked — just re-run npx test-auditor
```

---

## Do you need `npm unlink`?

**Yes, when you are done using the local link** — otherwise the app keeps using your local folder instead of the published npm package.

### When to unlink

| Situation | Unlink? |
|-----------|---------|
| Still developing the library against the app | No — keep the link |
| Switching the app to the **published** npm version | **Yes** |
| Finished local testing and want a clean install | **Yes** |
| Seeing weird behavior (old/local code still running) | **Yes**, then reinstall |

### How to unlink (order matters)

**1. In the Next app** (removes the link from that project):

```bash
cd /Users/you/Documents/seabiscuit-pwa/apps/web
npm unlink test-auditor
```

If you had also installed it from npm, restore a normal install:

```bash
npm install -D test-auditor
```

**2. Optional — remove the global link** (from the library machine):

```bash
cd /Users/you/Documents/UTC-Audit/test-auditor
npm unlink -g test-auditor
```

You only need the global unlink when no project should use that local link anymore.

---

## CLI options

| Option | Meaning | Default |
|--------|---------|---------|
| `-p, --path <path>` | Project to audit (Jest root) | **required** |
| `-o, --output <path>` | Markdown report path | `./audit-report.md` |
| `--skip-run` | Static analysis only (do not run Jest) | off |
| `--no-open` | Do not open the interactive viewer after audit | off (viewer opens by default) |
| `--no-cms` | Skip CMS readiness check | off (opt-in via prompt or `--cms-readiness`) |
| `--cms-readiness` | Include CMS readiness check | off unless set in `.test-auditor.json` |
| `--cms-from <id>` | CMS currently used (with `--cms-to`) | — |
| `--cms-to <id>` | CMS being adopted (with `--cms-from`) | — |
| `--cms-config <path>` | Merge/override built-in CMS registry JSON | built-in `config/cms-registry.json` |
| `--no-completeness` | Skip source↔test gap / completeness analysis | off (completeness runs by default) |
| `--json-output <path>` | JSON report path (used for upload and local archive) | same as `-o` with `.json` extension |
| `--upload` | Upload the JSON report to the configured backend API | on when `TEST_AUDITOR_API_KEY` is set |
| `--no-upload` | Skip report upload even when credentials are configured | off |
| `--api-key <key>` | Project API key (sent via `x-api-key` header) | `TEST_AUDITOR_API_KEY` |
| `--api-url <url>` | Report upload API URL | `TEST_AUDITOR_API_URL` or `http://localhost:3000/api/reports` |
| `--api-timeout <ms>` | Report upload timeout in milliseconds | `TEST_AUDITOR_API_TIMEOUT` or `300000` (5 min) |

Examples:

```bash
# Full audit + coverage
npx test-auditor --path /Users/you/Documents/my-next-app

# Custom report location
npx test-auditor --path /Users/you/Documents/my-next-app -o ~/Desktop/audit-report.md

# Static checks only (faster)
npx test-auditor --path /Users/you/Documents/my-next-app --skip-run

# Skip CMS migration prompts
npx test-auditor --path /Users/you/Documents/my-next-app --no-cms

# Skip completeness (source↔test gap) analysis
npx test-auditor --path /Users/you/Documents/my-next-app --no-completeness

# CI: CMS migration audit without interactive prompts (e.g. AEM → Contentful)
npx test-auditor --path /Users/you/Documents/my-next-app --cms-from aem --cms-to contentful --no-open
```

### Upload audit reports to the backend

After each audit, test-auditor writes a JSON report alongside the Markdown report (for example `audit-report.json` when `-o ./audit-report.md`).

When a **project API key** is configured, the JSON report is uploaded automatically to your backend API. The upload payload matches the backend contract:

```json
{
  "reportId": "<uuid>",
  "generatedAt": "<ISO-8601 timestamp>",
  "reportJson": { "...full local audit-report.json contents..." },
  "pipeline": { "...optional CI metadata when detected..." }
}
```

The API key is still sent only via the `x-api-key` header. Each API key belongs to exactly one project — the backend derives `projectId` and `clientId` from the key, so you do not pass those IDs from the CLI.

**Recommended (environment variables, CI/CD friendly):**

```bash
TEST_AUDITOR_API_URL=https://api.example.com/api/reports \
TEST_AUDITOR_API_KEY=<PROJECT_API_KEY> \
npx test-auditor --path .
```

**CLI flags (override environment variables):**

```bash
npx test-auditor \
  --path . \
  --api-url https://api.example.com/api/reports \
  --api-key <PROJECT_API_KEY>
```

**Configuration precedence:**

```text
CLI flag  →  environment variable  →  project config file  →  default
```

Optional project config files (in the audited project directory):

- `.test-auditor.json`
- `test-auditor.config.json`

Example `.test-auditor.json`:

```json
{
  "apiUrl": "https://api.example.com/api/reports",
  "apiKey": "<PROJECT_API_KEY>",
  "apiTimeout": 300000,
  "upload": true
}
```

**Important:**

- The API key is sent only in the `x-api-key` HTTP header — configure it in `.test-auditor.json`.
- Add `.test-auditor.json` to `.gitignore` when it contains secrets.
- Upload is skipped when no API key is configured (audit still completes).
- Use `--upload` to require upload; use `--no-upload` to disable upload even when a key is set.
- Large reports (~50 MB) are streamed from the JSON file to minimize memory usage.
- If upload fails, the local JSON and Markdown reports are still preserved.

**Local development:**

```bash
TEST_AUDITOR_API_URL=http://localhost:3000/api/reports \
TEST_AUDITOR_API_KEY=<PROJECT_API_KEY> \
npx test-auditor --path . --no-open
```

On an interactive terminal, after discovery the CLI asks for **Current CMS** and **New CMS** (unless `--no-cms` or flags are set). Findings appear in a separate **CMS Migration** report section and viewer hero — they do **not** change the Quality Score.

By default the auditor also analyzes **application source** vs tests and writes a **Test Completeness** section (what is missing and what to write next). That score is also separate from Quality.
---

## View the report in a browser

After each audit, **test-auditor opens an interactive viewer automatically** and loads your `audit-report.md`.

The Markdown file is written into **your project** (e.g. `./audit-report.md`). The viewer UI ships **inside the npm package** (`node_modules/test-auditor/viewer/`). You do not copy it into the app — the CLI starts a tiny local server, opens your browser, and serves both the viewer and the report.

### What happens after audit

1. Report is written to `-o` / `--output` (default `./audit-report.md`)
2. Browser opens to a local URL (e.g. `http://127.0.0.1:xxxxx/`)
3. The report content loads automatically
4. Keep the terminal open while you browse; press **Ctrl+C** when finished

Skip the browser with:

```bash
npx test-auditor --path "$(pwd)" --no-open
```

### Manual open (if you used `--no-open`)

```bash
open node_modules/test-auditor/viewer/index.html
```

Then use **Open report** and pick your `audit-report.md`.

Or from the library checkout:

```bash
npm run viewer
# http://localhost:4173 — then open the md file
```

### Viewer features

- Accordion sections with in-panel scrolling
- Search / severity filters, coverage sort, paged tables
- Mobile-first layout; works in modern browsers

---

## What the auditor does

1. Discovers test files under `--path`
2. Runs static analysis (e.g. missing assertions, skipped tests)
3. Runs Jest with coverage (unless `--skip-run`)
4. Writes a Markdown report (`audit-report.md` by default) and a JSON report (`.json` alongside the Markdown file)
5. Uploads the JSON report when a project API key is configured (unless `--no-upload`)

Console styling:

- **Keys** (Project, Discovery, …) — bold, no color  
- **Red** — error counts / failed tests  
- **Yellow** — warnings / discovery count / in-progress %  
- **Green** — passed / done / completed % / report path  

---

## Troubleshooting

### Report shows `Total tests = 0` and no coverage

`--path` is probably wrong (often the **monorepo root**). Point it at the package that owns Jest (e.g. `apps/web`). Confirm with:

```bash
cd <that-package>
pwd
npm test
```

If `npm test` works there, use that folder for `--path`.

### `Permission denied` on `test-auditor`

Rebuild the library so the bin is executable:

```bash
cd /Users/you/Documents/UTC-Audit/test-auditor
npm run build
```

### Linked local version not updating

```bash
cd /Users/you/Documents/UTC-Audit/test-auditor
npm run build
```

Then run the auditor again from the app. If it still looks stale, unlink and link again (see above).

---

## Quick cheat sheet

```bash
# 1) Find path
cd /path/to/jest-app   # single app root OR monorepo apps/web
pwd

# 2a) From npm
npm install -D test-auditor
npx test-auditor --path "$(pwd)"

# 2b) From local library
cd /path/to/test-auditor && npm run build && npm link
cd /path/to/jest-app && npm link test-auditor
npx test-auditor --path "$(pwd)"

# 3) When finished with local link
cd /path/to/jest-app && npm unlink test-auditor
cd /path/to/test-auditor && npm unlink -g test-auditor
```
