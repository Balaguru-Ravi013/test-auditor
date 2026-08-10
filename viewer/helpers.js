export const PAGE_SIZE = 50;

/* Plain-language help for stakeholders + engineers */
export const CMS_CATEGORY_INFO = {
  legacy: {
    title: "Legacy",
    blurb: "References to the source CMS (imports, mocks, strings, fixtures) still present in unit tests.",
  },
  gap: {
    title: "Gap",
    blurb: "Source CMS usage without matching target CMS mocks/imports — migration incomplete for that file.",
  },
  progress: {
    title: "Progress",
    blurb: "Both source and target CMS patterns appear — partial migration in progress.",
  },
};

export const COMPLETENESS_TAG_INFO = {
  missing: {
    title: "Missing",
    blurb: "No matching unit test found for this source module.",
  },
  "weak-coverage": {
    title: "Weak coverage",
    blurb: "Tests exist but line coverage is low — expand edge and error paths.",
  },
  "perf-risk": {
    title: "Perf / loading",
    blurb: "Loading or performance-sensitive pattern that unit tests should also guard.",
  },
};

export const METRIC_HELP = {
  Score:
    "Overall suite health from 0–100. Starts at 100, then drops for static findings (errors cost more), failing tests, and low average line coverage.",
  Readiness:
    "CMS migration readiness from 0–100. Separate from Quality Score. Deducts for legacy CMS refs in tests; small bonus when target CMS patterns also appear.",
  Completeness:
    "How completely application source modules are covered by unit tests (0–100). Separate from Quality Score. Deducts for untested pages/APIs/components and weak coverage.",
  Grade:
    "Letter grade from the score: A ≥90, B ≥80, C ≥70, D ≥55, F below 55. Use it as a quick “how healthy is this suite?” signal.",
  "Legacy refs":
    "Number of test files that still reference the source (legacy) CMS via imports, mocks, strings, or fixture paths.",
  Untested:
    "Application source modules with no matching unit test file (by name, folder, or import). Click the Missing tests accordion for what to write.",
  "High-risk gaps":
    "High-priority completeness recommendations — usually untested pages/APIs or modules with loading/performance risks.",
  "Total tests":
    "Every test Jest registered: passed + failed + pending + todo. That is why Total is often larger than Passed + Failed alone.",
  Passed:
    "Tests that ran and succeeded. Click the card to list them. A high pass count is good only if failures and skips are also under control.",
  Failed:
    "Tests that ran and failed. These usually need a fix before release. Click to see failure messages.",
  Pending:
    "Tests that were intentionally skipped (for example it.skip / xit). They still count in Total, so a “green” suite can hide unfinished work. Click to list them.",
  Todo:
    "Placeholders (test.todo) for work not written yet. They inflate Total without protecting behavior. Click to list them.",
  "Static errors":
    "Serious code-quality findings in test files (for example focused .only tests, empty tests, secrets, unmocked network). Prefer fixing these first. Click to browse.",
  "Static warnings":
    "Important hygiene risks (skips, flakes, weak assertions, Testing Library anti-patterns). Not always blockers, but they erode trust. Click to browse.",
  "Static info":
    "Lower-priority readability and hygiene hints. Useful cleanup, usually not release-blocking. Click to browse.",
};

export const STRATEGY_INFO = {
  "disabled-focused": {
    title: "Disabled / focused tests",
    blurb:
      "Some tests are turned off (.skip) or forced to run alone (.only). That can hide bugs or make CI look healthier than it is.",
  },
  "async-flake": {
    title: "Async flake risks",
    blurb:
      "Timing-sensitive patterns (sleeps, missing awaits) that may pass sometimes and fail other times — hard to trust in CI.",
  },
  "snapshot-overuse": {
    title: "Snapshot overuse",
    blurb:
      "Too many large snapshots. Failures become “update the snapshot” instead of clear product regressions.",
  },
  "rtl-antipattern": {
    title: "Testing Library anti-patterns",
    blurb:
      "Tests dig into DOM internals instead of what users see. Small UI refactors then break many tests unnecessarily.",
  },
  "non-deterministic": {
    title: "Non-deterministic APIs",
    blurb:
      "Live clocks or random values without control. The same test can give different results on different runs.",
  },
  "debug-leftover": {
    title: "Debug leftovers",
    blurb:
      "console.log, screen.debug, or debugger left in tests — noise in CI logs and a sign of unfinished cleanup.",
  },
  "assertion-quality": {
    title: "Assertion quality",
    blurb:
      "Weak or empty checks. The test may “pass” without proving the behavior you care about.",
  },
  "empty-test": {
    title: "Empty tests",
    blurb:
      "Placeholder tests with no real checks. They inflate the pass count without adding safety.",
  },
  "duplicate-title": {
    title: "Duplicate titles",
    blurb:
      "Several tests share the same name, so failures are harder to find and discuss in reviews.",
  },
  "conditional-logic": {
    title: "Conditional test logic",
    blurb:
      "Assertions wrapped in if/catch can silently skip checks. A “green” suite may not have verified the path you think.",
  },
  "hardcoded-secret": {
    title: "Hardcoded secrets",
    blurb:
      "API keys or tokens appear in test files. That is a security risk if the repo is shared or published.",
  },
  "network-unmocked": {
    title: "Unmocked network I/O",
    blurb:
      "Tests may call real network services. Runs become slow, flaky, and can hit production or rate limits by accident.",
  },
  "mocking-quality": {
    title: "Mocking quality",
    blurb:
      "Mocks are redundant, unused, or replace the code under test — so the suite may not exercise real behavior.",
  },
  "nextjs-hygiene": {
    title: "Next.js test hygiene",
    blurb:
      "Next.js router/image/navigation used without the usual test doubles. Component tests can crash or behave inconsistently.",
  },
  readability: {
    title: "Readability",
    blurb:
      "Vague names or very deep nesting. Stakeholders and new engineers struggle to see what is covered.",
  },
  "timer-hygiene": {
    title: "Timer hygiene",
    blurb:
      "Fake timers started but not advanced or restored. Later tests can fail for unrelated timing reasons.",
  },
  "parse-error": {
    title: "Parse errors",
    blurb:
      "The auditor could not read this file. Findings may be incomplete until the syntax or parser setup is fixed.",
  },
};

export const METRIC_MODAL = {
  "Total tests": {
    kind: "tests",
    title: "All tests",
    sub: "Every test Jest registered in this run.",
    status: "all",
  },
  Passed: {
    kind: "tests",
    title: "Passed tests",
    sub: "Tests that ran successfully.",
    status: "passed",
  },
  Failed: {
    kind: "failed",
    title: "Failed tests",
    sub: "Failing tests with captured error output.",
    status: "failed",
  },
  Pending: {
    kind: "tests",
    title: "Pending / skipped tests",
    sub: "Skipped tests (it.skip / xit / pending). They count toward Total but do not protect behavior.",
    status: "pending",
  },
  Todo: {
    kind: "tests",
    title: "Todo tests",
    sub: "test.todo placeholders — planned tests that are not written yet.",
    status: "todo",
  },
  "Static errors": {
    kind: "issues",
    title: "Static analysis — errors",
    sub: "Highest-severity findings in test source. Prefer fixing these first.",
    severity: "error",
  },
  "Static warnings": {
    kind: "issues",
    title: "Static analysis — warnings",
    sub: "Important hygiene risks that reduce trust in the suite.",
    severity: "warning",
  },
  "Static info": {
    kind: "issues",
    title: "Static analysis — info",
    sub: "Lower-priority readability and hygiene hints.",
    severity: "info",
  },
};

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shortPath(filePath) {
  var parts = String(filePath).split(/[/\\]/);
  if (parts.length <= 3) return filePath;
  return "…/" + parts.slice(-3).join("/");
}

export function strategyMeta(idOrTitle) {
  var raw = String(idOrTitle || "").trim();
  if (!raw) return { id: "", title: "—", blurb: "" };
  if (STRATEGY_INFO[raw]) {
    return { id: raw, title: STRATEGY_INFO[raw].title, blurb: STRATEGY_INFO[raw].blurb };
  }
  var keys = Object.keys(STRATEGY_INFO);
  for (var i = 0; i < keys.length; i++) {
    var meta = STRATEGY_INFO[keys[i]];
    if (meta.title === raw) return { id: keys[i], title: meta.title, blurb: meta.blurb };
  }
  return { id: raw, title: raw, blurb: "Static analysis strategy applied to this suite." };
}

export function severityPill(severity) {
  var sev = String(severity || "").toLowerCase();
  var tone = sev === "error" ? "error" : sev === "info" ? "info" : "warning";
  return (
    '<span class="pill pill--' +
    tone +
    '">' +
    escapeHtml(sev || "—") +
    "</span>"
  );
}

export function cmsCategoryPill(category) {
  var cat = String(category || "").toLowerCase();
  var meta = CMS_CATEGORY_INFO[cat];
  var tone =
    cat === "legacy" ? "warning" : cat === "gap" ? "error" : cat === "progress" ? "ok" : "info";
  return (
    '<span class="pill pill--' +
    tone +
    '" title="' +
    escapeHtml(meta ? meta.blurb : "") +
    '">' +
    escapeHtml(meta ? meta.title : cat || "—") +
    "</span>"
  );
}

export function cmsCategoryMeta(category) {
  var cat = String(category || "").toLowerCase();
  return (
    CMS_CATEGORY_INFO[cat] || {
      title: cat || "—",
      blurb: "CMS migration finding category.",
    }
  );
}

export function completenessTagPill(tag) {
  var t = String(tag || "").toLowerCase();
  var meta = COMPLETENESS_TAG_INFO[t];
  var tone =
    t === "missing" ? "error" : t === "weak-coverage" ? "warning" : t === "perf-risk" ? "info" : "info";
  return (
    '<span class="pill pill--' +
    tone +
    '" title="' +
    escapeHtml(meta ? meta.blurb : "") +
    '">' +
    escapeHtml(meta ? meta.title : t || "—") +
    "</span>"
  );
}

export function priorityPill(priority) {
  var p = String(priority || "").toLowerCase();
  var tone = p === "high" ? "error" : p === "medium" ? "warning" : "info";
  return (
    '<span class="pill pill--' +
    tone +
    '">' +
    escapeHtml(p || "—") +
    "</span>"
  );
}

export function statusPill(status) {
  var s = normalizeTestStatus(status);
  var tone =
    s === "passed" ? "ok" : s === "failed" ? "error" : s === "todo" ? "info" : "warning";
  return (
    '<span class="pill pill--' +
    tone +
    '">' +
    escapeHtml(status || "—") +
    "</span>"
  );
}

export function normalizeTestStatus(status) {
  var s = String(status || "").toLowerCase();
  if (s === "skipped") return "pending";
  return s;
}

export function statusMatchesFilter(status, filter) {
  if (!filter || filter === "all") return true;
  var s = normalizeTestStatus(status);
  if (filter === "pending") return s === "pending" || s === "skipped";
  return s === filter;
}

export function metricTone(key, value) {
  if (key === "Score" || key === "Readiness" || key === "Completeness") {
    var score = parseInt(String(value), 10);
    if (isNaN(score)) return "neutral";
    if (score >= 80) return "ok";
    if (score >= 55) return "warn";
    return "bad";
  }
  if (key === "Grade") {
    var g = String(value).charAt(0).toUpperCase();
    if (g === "A" || g === "B") return "ok";
    if (g === "C") return "warn";
    return "bad";
  }
  if (key === "Passed") return "ok";
  if (key === "Failed" || key === "Static errors") {
    return Number(String(value).replace(/,/g, "")) > 0 ? "bad" : "ok";
  }
  if (
    key === "Static warnings" ||
    key === "Pending" ||
    key === "Todo" ||
    key === "Legacy refs" ||
    key === "Untested" ||
    key === "High-risk gaps"
  ) {
    return Number(String(value).replace(/,/g, "")) > 0 ? "warn" : "neutral";
  }
  if (key === "Total tests") return "neutral";
  if (key === "Static info") return "neutral";
  return "neutral";
}

export function infoButton(helpKey) {
  var tip = METRIC_HELP[helpKey] || "Metric from the Jest audit report.";
  return (
    '<button type="button" class="info-tip" aria-label="About ' +
    escapeHtml(helpKey) +
    '" data-tip="' +
    escapeHtml(tip) +
    '"><span aria-hidden="true">i</span></button>'
  );
}

export function metricCard(label, value, helpKey, clickable) {
  var tone = metricTone(helpKey || label, value);
  var openAttr = clickable
    ? ' tabindex="0" role="button" data-open-metric="' + escapeHtml(helpKey || label) + '"'
    : "";
  return (
    '<article class="metric metric--' +
    tone +
    (clickable ? " metric--clickable" : "") +
    '"' +
    openAttr +
    ">" +
    '<div class="metric__top">' +
    '<p class="metric__label">' +
    escapeHtml(label) +
    "</p>" +
    infoButton(helpKey || label) +
    "</div>" +
    '<p class="metric__value">' +
    escapeHtml(value) +
    "</p>" +
    (clickable ? '<p class="metric__hint">View details</p>' : "") +
    "</article>"
  );
}

export function covClass(pct) {
  if (pct >= 80) return "cov--hi";
  if (pct >= 50) return "cov--mid";
  return "cov--lo";
}

export function formatGenerated(raw) {
  if (!raw) return "";
  var d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  try {
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (e) {
    return d.toLocaleString();
  }
}
