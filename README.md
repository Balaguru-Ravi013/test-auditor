# test-auditor — Integration Guide

Audit Jest test suites in any Next.js (or JS/TS) app: discover tests, run static checks, execute Jest with coverage, and write a Markdown report.

---

## Before you start

You need:

- Node.js installed
- A Next.js (or JS/TS) app that already uses **Jest**
- The folder where that app’s Jest config / `npm test` lives

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

Examples:

```bash
# Full audit + coverage
npx test-auditor --path /Users/you/Documents/my-next-app

# Custom report location
npx test-auditor --path /Users/you/Documents/my-next-app -o ~/Desktop/audit-report.md

# Static checks only (faster)
npx test-auditor --path /Users/you/Documents/my-next-app --skip-run
```

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
4. Writes a Markdown report (`audit-report.md` by default)

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
