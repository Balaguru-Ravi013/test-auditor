// src/completenessAnalyzer.ts
import fs from 'fs';
import path from 'path';
import type { FileCoverage } from './coverageParser.js';
import type { SourceFile, SourceKind } from './sourceDiscovery.js';

export type CompletenessPriority = 'high' | 'medium' | 'low';
export type CompletenessTag = 'missing' | 'weak-coverage' | 'perf-risk';

export interface CompletenessRecommendation {
  source: string;
  kind: SourceKind;
  priority: CompletenessPriority;
  tag: CompletenessTag;
  why: string;
  suggest: string;
  coverageLines: number | null;
  matchedTests: string[];
  exports: string[];
}

export interface CompletenessAnalysis {
  sourcesScanned: number;
  withTests: number;
  untested: number;
  weakCoverage: number;
  perfRisks: number;
  recommendations: CompletenessRecommendation[];
}

const HEAVY_IMPORT_RE =
  /from\s+['"](?:lodash(?:\/|$)|moment(?:\/|$)|@mui\/|antd|chart\.js|recharts|three|firebase|aws-sdk)/;

function basenameNoExt(filePath: string): string {
  const base = path.basename(filePath);
  return base.replace(/\.(jsx?|tsx?)$/, '');
}

function dirOf(filePath: string): string {
  return path.dirname(filePath).replace(/\\/g, '/');
}

function normalize(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

/** Heuristic: does this test file look like it targets this source? */
function isLikelyTestFor(sourceAbs: string, testAbs: string): boolean {
  const srcBase = basenameNoExt(sourceAbs).toLowerCase();
  const testBase = basenameNoExt(testAbs).toLowerCase();
  const srcDir = dirOf(sourceAbs).toLowerCase();
  const testDir = dirOf(testAbs).toLowerCase();

  // Foo.tsx ↔ Foo.test.tsx / Foo.spec.tsx
  if (
    testBase === `${srcBase}.test` ||
    testBase === `${srcBase}.spec` ||
    testBase === srcBase
  ) {
    return true;
  }

  // __tests__/Foo.tsx next to source, or same folder
  if (testDir === srcDir || testDir === `${srcDir}/__tests__`) {
    if (testBase.includes(srcBase) || srcBase.includes(testBase.replace(/\.(test|spec)$/, ''))) {
      return true;
    }
  }

  // Coarse: test file name contains source basename (min length to avoid noise)
  if (srcBase.length >= 4 && testBase.includes(srcBase)) {
    return true;
  }

  return false;
}

/** Check if any test imports / requires the source module (weak signal). */
function testMentionsSource(testCode: string, sourceAbs: string, projectPath: string): boolean {
  const rel = path.relative(projectPath, sourceAbs).replace(/\\/g, '/');
  const noExt = rel.replace(/\.(jsx?|tsx?)$/, '');
  const base = basenameNoExt(sourceAbs);
  // Look for import paths ending with the module or basename
  const patterns = [
    new RegExp(`['"\`][^'"\`]*(?:${escapeRe(noExt)}|${escapeRe(base)})['"\`]`),
  ];
  return patterns.some((re) => re.test(testCode));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractExports(code: string): string[] {
  const names = new Set<string>();
  const reDefault = /export\s+default\s+(?:function\s+|class\s+)?([A-Za-z_$][\w$]*)/;
  const mDef = code.match(reDefault);
  if (mDef?.[1]) names.add(mDef[1]);

  const named =
    code.matchAll(
      /export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z_$][\w$]*)/g
    );
  for (const m of named) {
    if (m[1]) names.add(m[1]);
  }

  const brace = code.matchAll(/export\s*\{([^}]+)\}/g);
  for (const m of brace) {
    const inner = m[1] ?? '';
    for (const part of inner.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z_$]/.test(name)) names.add(name);
    }
  }

  return [...names].slice(0, 12);
}

function scanPerfHints(code: string): string[] {
  const hints: string[] = [];
  if (/['"]use client['"]/.test(code) && HEAVY_IMPORT_RE.test(code)) {
    hints.push('client component imports a heavy dependency — assert lazy/dynamic load in tests');
  }
  if (
    /<(?:img|Image)\b/i.test(code) &&
    !/loading\s*=\s*['"]lazy['"]/.test(code) &&
    !/\bpriority\b/.test(code)
  ) {
    hints.push('images may lack lazy loading — cover loading behavior in unit tests');
  }
  if (
    /\bfetch\s*\(/.test(code) &&
    !/loading\.(js|jsx|ts|tsx)/.test(code) &&
    !/\bSuspense\b/.test(code) &&
    !/\bisLoading\b|\bloading\b/.test(code)
  ) {
    hints.push('data fetch without clear loading UI — test loading and error states');
  }
  if (/import\s+.*\s+from\s+['"]lodash['"]/.test(code)) {
    hints.push('full lodash import — prefer tree-shakeable paths; mock/stub in tests');
  }
  return hints;
}

function basePriority(kind: SourceKind): CompletenessPriority {
  if (kind === 'page' || kind === 'api') return 'high';
  if (kind === 'component' || kind === 'hook' || kind === 'service') return 'medium';
  return 'low';
}

function bumpPriority(p: CompletenessPriority): CompletenessPriority {
  if (p === 'low') return 'medium';
  if (p === 'medium') return 'high';
  return 'high';
}

function coverageFor(
  sourceAbs: string,
  coverage: FileCoverage[]
): number | null {
  const needle = normalize(sourceAbs);
  for (const c of coverage) {
    if (normalize(c.file) === needle) return c.lines;
    // coverage paths may be relative or absolute
    if (needle.endsWith(normalize(c.file)) || normalize(c.file).endsWith(needle)) {
      return c.lines;
    }
  }
  return null;
}

/**
 * Map source modules to tests + coverage and emit actionable recommendations.
 */
export function analyzeCompleteness(
  projectPath: string,
  sources: SourceFile[],
  testFiles: string[],
  coverage: FileCoverage[]
): CompletenessAnalysis {
  const testCodes = new Map<string, string>();
  for (const t of testFiles) {
    try {
      testCodes.set(t, fs.readFileSync(t, 'utf-8'));
    } catch {
      /* ignore */
    }
  }

  const recommendations: CompletenessRecommendation[] = [];
  let withTests = 0;
  let untested = 0;
  let weakCoverage = 0;
  let perfRisks = 0;

  for (const src of sources) {
    let code = '';
    try {
      code = fs.readFileSync(src.file, 'utf-8');
    } catch {
      continue;
    }

    // Skip nearly-empty barrels / re-export-only files
    const trimmed = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim();
    if (trimmed.length < 40 && /export\s*\*|export\s*\{/.test(trimmed)) {
      continue;
    }

    const matchedTests: string[] = [];
    for (const t of testFiles) {
      if (isLikelyTestFor(src.file, t)) {
        matchedTests.push(t);
        continue;
      }
      const tc = testCodes.get(t);
      if (tc && testMentionsSource(tc, src.file, projectPath)) {
        matchedTests.push(t);
      }
    }

    const exports = extractExports(code);
    const linesPct = coverageFor(src.file, coverage);
    const perfHints = scanPerfHints(code);
    const hasTest = matchedTests.length > 0;
    const weak =
      hasTest && linesPct !== null && linesPct < 40
        ? true
        : !hasTest && linesPct !== null && linesPct === 0
          ? true
          : hasTest && linesPct === null && coverage.length > 0
            ? false
            : false;

    if (hasTest) withTests++;
    else untested++;

    const needsRec =
      !hasTest ||
      (linesPct !== null && linesPct < 40) ||
      (perfHints.length > 0 && (!hasTest || (linesPct !== null && linesPct < 60)));

    if (!needsRec) continue;

    let tag: CompletenessTag = 'missing';
    let priority = basePriority(src.kind);
    let why: string;
    let suggest: string;

    if (!hasTest) {
      tag = 'missing';
      why =
        linesPct === 0
          ? `No matching unit test and 0% line coverage`
          : `No co-located or matching unit test found`;
      const exportHint =
        exports.length > 0 ? ` Cover exports: ${exports.slice(0, 5).join(', ')}.` : '';
      suggest = `Add ${src.kind === 'api' ? 'API/handler' : src.kind} unit tests for ${basenameNoExt(src.file)}.${exportHint} Include happy path, empty/error states.`;
      if (perfHints.length) {
        priority = bumpPriority(priority);
        tag = 'perf-risk';
        perfRisks++;
        suggest += ` Also: ${perfHints[0]}`;
        why += `; perf/loading risk`;
      }
    } else if (linesPct !== null && linesPct < 40) {
      tag = 'weak-coverage';
      weakCoverage++;
      why = `Has ${matchedTests.length} test file(s) but only ${linesPct}% line coverage`;
      suggest = `Expand tests for uncovered branches in ${basenameNoExt(src.file)} (edge cases, error paths).`;
      if (perfHints.length) {
        priority = bumpPriority(priority);
        suggest += ` Also: ${perfHints[0]}`;
        perfRisks++;
      }
    } else {
      // perf hint with some coverage/tests
      tag = 'perf-risk';
      priority = bumpPriority(priority);
      perfRisks++;
      why = `Possible loading/performance gap in ${src.kind}`;
      suggest = perfHints[0] ?? 'Add tests for loading and performance-sensitive paths.';
    }

    if (src.kind === 'page' || src.kind === 'api') {
      priority = priority === 'low' ? 'medium' : priority === 'medium' ? 'high' : 'high';
    }

    recommendations.push({
      source: src.file,
      kind: src.kind,
      priority,
      tag,
      why,
      suggest,
      coverageLines: linesPct,
      matchedTests,
      exports,
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  recommendations.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.source.localeCompare(b.source)
  );

  return {
    sourcesScanned: sources.length,
    withTests,
    untested,
    weakCoverage,
    perfRisks,
    recommendations,
  };
}
