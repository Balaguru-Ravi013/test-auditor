// src/coverageParser.ts
import fs from 'fs';
import path from 'path';

export interface FileCoverage {
  file: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

type CoverageSummaryFile = {
  statements?: { pct?: number };
  branches?: { pct?: number };
  functions?: { pct?: number };
  lines?: { pct?: number };
};

type IstanbulFileCoverage = {
  path?: string;
  s?: Record<string, number>;
  b?: Record<string, number[]>;
  f?: Record<string, number>;
  l?: Record<string, number>;
  statementMap?: Record<string, unknown>;
  branchMap?: Record<string, unknown>;
  fnMap?: Record<string, unknown>;
};

function roundPct(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

function hitPct(hits: Record<string, number> | undefined): number {
  const values = Object.values(hits ?? {});
  const covered = values.filter((v) => v > 0).length;
  return roundPct(covered, values.length);
}

function branchPct(branches: Record<string, number[]> | undefined): number {
  const values = Object.values(branches ?? {}).flat();
  const covered = values.filter((v) => v > 0).length;
  return roundPct(covered, values.length);
}

/** coverage-summary.json (json-summary reporter) */
function fromSummary(raw: Record<string, CoverageSummaryFile>): FileCoverage[] {
  const results: FileCoverage[] = [];
  for (const [file, data] of Object.entries(raw)) {
    if (file === 'total' || !data) continue;
    results.push({
      file,
      statements: data.statements?.pct ?? 0,
      branches: data.branches?.pct ?? 0,
      functions: data.functions?.pct ?? 0,
      lines: data.lines?.pct ?? 0,
    });
  }
  return results;
}

/** coverage-final.json or Jest JSON coverageMap (Istanbul) */
function fromIstanbulMap(
  raw: Record<string, IstanbulFileCoverage>
): FileCoverage[] {
  const results: FileCoverage[] = [];
  for (const [key, data] of Object.entries(raw)) {
    if (!data || typeof data !== 'object') continue;
    // Lines may be absent; derive from statement hits when needed.
    const lines = data.l ?? data.s;
    results.push({
      file: data.path ?? key,
      statements: hitPct(data.s),
      branches: branchPct(data.b),
      functions: hitPct(data.f),
      lines: hitPct(lines),
    });
  }
  return results;
}

function readJsonIfExists(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Resolve coverage from (in order):
 * 1. coverage/coverage-summary.json
 * 2. coverage/coverage-final.json
 * 3. in-memory Jest coverageMap (from --json --coverage)
 *
 * next/jest + Jest `projects` often drop `json-summary` from disk reporters
 * even when listed in config — hence the fallbacks.
 */
export function parseCoverage(
  projectPath: string,
  coverageMap?: Record<string, unknown> | null
): FileCoverage[] {
  const coverageDir = path.join(projectPath, 'coverage');

  const summary = readJsonIfExists(
    path.join(coverageDir, 'coverage-summary.json')
  );
  if (summary && typeof summary === 'object') {
    const results = fromSummary(summary as Record<string, CoverageSummaryFile>);
    if (results.length > 0) return results;
  }

  const finalReport = readJsonIfExists(
    path.join(coverageDir, 'coverage-final.json')
  );
  if (finalReport && typeof finalReport === 'object') {
    const results = fromIstanbulMap(
      finalReport as Record<string, IstanbulFileCoverage>
    );
    if (results.length > 0) return results;
  }

  if (coverageMap && typeof coverageMap === 'object') {
    return fromIstanbulMap(coverageMap as Record<string, IstanbulFileCoverage>);
  }

  return [];
}
