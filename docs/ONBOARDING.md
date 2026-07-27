# Onboarding: test-auditor

Welcome. This guide is for engineers joining the team who have never seen this library. It walks the codebase from **process start → report + viewer → process exit**, then answers common questions.

---

## What this library is

**test-auditor** is a Node.js CLI that audits **Jest** unit-test suites (especially Next.js / JS / TS apps). In one run it:

1. Finds test files
2. Statically analyzes those files (our own Babel AST rules)
3. Runs Jest with coverage (unless `--skip-run`)
4. Parses coverage output
5. Computes a quality score
6. Writes a Markdown report **we** generate
7. Optionally opens an interactive browser viewer for that report

It is **not** a Jest plugin, **not** a replacement for Jest, and **not** a general-purpose test runner for Playwright / Cypress / Vitest / Mocha.

---

## Repo map (where to look)

```text
test-auditor/
├── package.json          # bin → dist/cli.js; ships dist/ + viewer/
├── tsconfig.json         # compiles src/ → dist/
├── README.md             # user-facing install / --path guide
├── src/                  # TypeScript source (edit here)
│   ├── cli.ts            # ENTRY POINT
│   ├── discovery.ts
│   ├── staticAnalyzer.ts
│   ├── rules/types.ts
│   ├── testRunner.ts
│   ├── coverageParser.ts
│   ├── qualityScore.ts
│   ├── reportGenerator.ts
│   └── viewerServer.ts
├── viewer/               # static HTML/CSS/JS report UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── dist/                 # compiled JS (what npm runs) — do not edit by hand
```

Build: `npm run build` → `tsc` writes `dist/` and makes `dist/cli.js` executable.

Published binary name: `test-auditor` → `dist/cli.js`.

---

## End-to-end walkthrough (entry → exit)

Think of one command:

```bash
npx test-auditor --path /path/to/jest-project
```

### 0. Process starts

1. OS runs the shebang / Node on `dist/cli.js` (built from `src/cli.ts`).
2. `commander` parses flags:
   - `--path` (required) — Jest project root
   - `--output` — report path (default `./audit-report.md`)
   - `--skip-run` — static analysis only
   - `--no-open` — skip browser viewer

All orchestration lives in the `.action(...)` callback in `cli.ts`.

### 1. Discovery — `discovery.ts`

**CLI calls:** `discoverTestFiles(projectPath)`

**What it does:** Glob for common Jest unit-test patterns under the project (e.g. `*.test.*`, `*.spec.*`, `__tests__`), while skipping e2e-ish paths (Playwright / Cypress style folders).

**Output:** `string[]` of absolute (or resolved) test file paths.

**CLI prints:** how many test files were found.

### 2. Static analysis — `staticAnalyzer.ts` + `rules/types.ts`

**CLI calls:** `files.flatMap((f) => analyzeFile(f))`

**What it does:**

- Reads each test file
- Parses it with `@babel/parser`
- Walks the AST with `@babel/traverse`
- Applies **our** rule strategies (focused/skip/todo, flakes, snapshots, RTL anti-patterns, secrets, network, Next.js hygiene, etc.)

**Types / strategy metadata:** `src/rules/types.ts`  
(`StrategyId`, `TestIssue`, `STRATEGY_META` titles & blurbs)

**Output:** `TestIssue[]` — file, line, rule, strategy, message, severity (`error` | `warning` | `info`).

**Important:** This step does **not** use Jest’s result. It only reads source text. Jest can be skipped entirely (`--skip-run`) and static findings still appear.

**CLI prints:** error / warning counts.

### 3. Run Jest — `testRunner.ts`

**CLI calls:** `runJestTests(projectPath, { expectedSuites, onProgress })`  
(unless `--skip-run`)

**What it does:**

- Spawns `npx jest` in the **target project** via `execa` (not a reimplementation of Jest)
- Forces useful flags: `--json`, `--outputFile=…`, `--coverage`, coverage reporters `json-summary` + `json`
- Watches Jest’s stderr for `PASS` / `FAIL` suite lines to drive the CLI progress bar
- Reads Jest’s JSON report (from temp file, with stdout fallback)
- Maps suites → pass/fail counts, failure messages, per-test case rows, optional in-memory `coverageMap`

**Output:** `RunSummary` (totals, pending, todo, `testResults`, `testCases`, `coverageMap`).

**CLI prints:** failed / passed / total.

If `--skip-run`, CLI invents an empty `RunSummary` (zeros) and continues.

### 4. Coverage — `coverageParser.ts`

**CLI calls:** `parseCoverage(projectPath, runSummary.coverageMap)`

**What it does:** Prefer, in order:

1. Coverage summary files Jest wrote under the project (e.g. `coverage/coverage-summary.json`)
2. Istanbul `coverage-final.json`-style maps
3. The in-memory `coverageMap` from Jest JSON (if present)

**Output:** `FileCoverage[]` — per-file statements / branches / functions / lines %.

**Note:** Coverage numbers come from **Jest/Istanbul**. We only normalize and surface them.

### 5. Quality score — `qualityScore.ts`

**CLI calls:** `computeQualityScore(staticIssues, runSummary, coverage)`

**What it does:** Starts at 100, deducts for:

- Our static findings (errors weigh more than warnings/info)
- Failed-test rate from Jest
- Low average line coverage (or missing coverage)

Also buckets issues by strategy for the report’s “Strategies” section.

**Output:** score 0–100, grade A–F, label, summary blurb, `byStrategy[]`.

### 6. Markdown report — `reportGenerator.ts`

**CLI calls:** `generateMarkdownReport({ staticIssues, runSummary, coverage, quality }, outputPath)`

**What it does:** **We** write a Markdown file (default `audit-report.md`) with sections such as:

- Quality Score (+ Strategies table)
- Summary metrics
- Static Analysis Issues
- Failed Tests (from Jest messages we captured)
- Test Cases (individual statuses from Jest JSON)
- Coverage table

**This file is created by test-auditor, not by Jest.**  
Jest may also write its own artifacts under the app’s `coverage/` folder; that is separate.

**CLI prints:** absolute report path.

### 7. Viewer (optional) — `viewerServer.ts` + `viewer/`

**CLI calls:** `openReportViewer(outputPath)` unless `--no-open`.

**What it does:**

1. Starts a tiny local HTTP server on `127.0.0.1` (random free port)
2. Serves static files from package `viewer/` (`index.html`, `styles.css`, `app.js`)
3. Serves the generated report at `/report.md`
4. Opens the default browser to that URL
5. **Keeps the CLI process alive** until Ctrl+C (SIGINT/SIGTERM), then closes the server

**Browser side (`viewer/app.js`):**

- Fetches `/report.md` (or user drops/opens a `.md` file)
- Parses Markdown tables/sections into JSON-like structures
- Renders quality hero, metric strip, strategy cards, accordions, modals, filters, pagination

**Exit:** User presses Ctrl+C → server closes → CLI prints Done → process exits.

With `--no-open`, step 7 is skipped; CLI exits right after writing the report.

---

## Pipeline diagram

```text
  ┌─────────────────────────────────────────────────────────────┐
  │  cli.ts                                                     │
  │                                                             │
  │  discoverTestFiles ──► analyzeFile (× N)                    │
  │         │                    │                              │
  │         │                    ▼                              │
  │         │              staticIssues[]                       │
  │         │                    │                              │
  │         ▼                    │                              │
  │  runJestTests (npx jest)     │                              │
  │         │                    │                              │
  │         ▼                    │                              │
  │    RunSummary                │                              │
  │         │                    │                              │
  │         ▼                    │                              │
  │  parseCoverage ◄── coverageMap / coverage/*.json            │
  │         │                    │                              │
  │         └────────┬───────────┘                              │
  │                  ▼                                          │
  │         computeQualityScore                                 │
  │                  │                                          │
  │                  ▼                                          │
  │         generateMarkdownReport ──► audit-report.md          │
  │                  │                                          │
  │                  ▼                                          │
  │         openReportViewer ──► HTTP + browser (until Ctrl+C)  │
  └─────────────────────────────────────────────────────────────┘
```

---

## What each `src/` file does

| File | Role |
|------|------|
| **`cli.ts`** | Entry point. Parses CLI flags, prints colored progress, wires every step in order, decides whether to open the viewer. |
| **`discovery.ts`** | Finds unit-test files via glob; excludes obvious e2e paths. |
| **`rules/types.ts`** | Shared types: severities, strategy IDs, `TestIssue`, human-readable `STRATEGY_META`. |
| **`staticAnalyzer.ts`** | Babel parse + traverse; emits static `TestIssue`s per strategy/rule. Purely our logic on source files. |
| **`testRunner.ts`** | Spawns Jest in the target app, parses Jest JSON, builds `RunSummary` / test cases / failure messages. |
| **`coverageParser.ts`** | Reads Jest/Istanbul coverage artifacts into a simple per-file % list. |
| **`qualityScore.ts`** | Combines static issues + Jest run + coverage into score/grade/strategy breakdown. |
| **`reportGenerator.ts`** | Writes the Markdown audit report we own. |
| **`viewerServer.ts`** | Local static file server + `/report.md` + open browser + wait for Ctrl+C. |

### Viewer package (not under `src/`, but part of the product)

| File | Role |
|------|------|
| **`viewer/index.html`** | Shell: dropzone, report regions, modal, tooltip host. |
| **`viewer/styles.css`** | Layout and theme for the interactive report. |
| **`viewer/app.js`** | Client-only Markdown parser + UI (metrics, strategies, accordions, modals, filters). No Node APIs. |

---

## FAQs

### How does the viewer start?

1. After the Markdown report is written, `cli.ts` calls `openReportViewer(reportPath)` (unless `--no-open`).
2. `viewerServer.ts` creates an HTTP server that serves `viewer/` and maps `/report.md` → the report file on disk.
3. It opens `http://127.0.0.1:<port>/` in the system browser.
4. `viewer/app.js` auto-fetches `/report.md` over HTTP and renders it.
5. The CLI process stays alive serving files until you hit **Ctrl+C**.

You can also open `viewer/index.html` manually and use **Open report** / drag-and-drop (no auto `/report.md` unless something serves it).

### How is the audit file created?

**We create it.** `reportGenerator.generateMarkdownReport` uses `fs.writeFileSync` to write Markdown to `--output` (default `./audit-report.md` in the cwd where you invoked the CLI).

Jest may create its own `coverage/` files inside the **target project**; those are inputs we read, not the audit report.

### Is Jest running by us?

**Yes, we invoke it.** `testRunner.ts` runs `npx jest …` inside `--path` via `execa`.  

We do **not** embed Jest’s engine. The target project must already have Jest installed/configured so `npx jest` works there.

With `--skip-run`, we never start Jest.

### Is the report created by us or by Jest?

| Artifact | Who creates it |
|----------|----------------|
| `audit-report.md` (or `--output`) | **test-auditor** (`reportGenerator.ts`) |
| Jest JSON result (temp file) | **Jest** (we request it with `--json` / `--outputFile`) |
| `coverage/*.json` under the app | **Jest / Istanbul** (we request coverage reporters) |
| Interactive UI | **test-auditor** (`viewer/` + `viewerServer.ts`) |

### Are static findings purely our logic, or a mix with Jest?

**Purely our logic** on test **source files** (Babel AST rules in `staticAnalyzer.ts`).

Jest does **not** produce those static rule IDs. Jest contributes **runtime** data: pass/fail/pending/todo, failure messages, coverage. The quality score and Markdown report **combine** both worlds, but the “Static Analysis Issues” rows are ours alone.

### Does this library work only for Jest?

**Practically yes for a full audit.**

- **Designed for:** Jest unit tests in JS/TS (including Next.js apps that use Jest).
- **Static analysis** could theoretically scan any similar test file syntax, but discovery patterns, `--skip-run` empty runtime, and especially **`testRunner` / coverage** assume Jest.
- **Not supported as first-class:** Vitest, Mocha, Jasmine, Playwright, Cypress, etc. E2E-style folders are intentionally ignored in discovery.

If someone asks “can we support Vitest?”, that would be a new runner + coverage adapter — not a small config tweak.

---

## Mental model (one sentence)

> We find tests, judge their **source quality** ourselves, ask **Jest** how the suite **ran** and what **coverage** looks like, then write **our** Markdown report and optionally host **our** viewer until you stop the process.

---

## Suggested first tasks for a new member

1. Read `src/cli.ts` top to bottom once.
2. Run against a small Jest app: `npx test-auditor --path <app> --no-open` and open the Markdown.
3. Run again without `--no-open` and watch `viewerServer` + browser.
4. Add a temporary `console.log` in `analyzeFile` and confirm static issues change when you edit a fixture test.
5. Skim one strategy block inside `staticAnalyzer.ts` and match it to `STRATEGY_META` in `rules/types.ts`.

---

## Related docs

- User install / `--path` / monorepo guidance: [`README.md`](../README.md)
