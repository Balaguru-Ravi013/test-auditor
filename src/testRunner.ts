// src/testRunner.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';

export interface TestCaseRow {
  file: string;
  name: string;
  /** Jest status: passed | failed | pending | todo | skipped */
  status: string;
}

export interface TestResult {
  testFilePath: string;
  numPassingTests: number;
  numFailingTests: number;
  duration: number;
  failureMessages: string[];
}

export interface RunSummary {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: TestResult[];
  /** Flat list of individual tests for report drill-down. */
  testCases: TestCaseRow[];
  /** Istanbul coverage map from Jest --json --coverage (when present). */
  coverageMap?: Record<string, unknown> | null;
}

/** Per-assertion entries: modern Jest uses assertionResults; older uses nested testResults. */
function getAssertions(suite: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(suite.assertionResults)) {
    return suite.assertionResults as Array<Record<string, unknown>>;
  }
  if (Array.isArray(suite.testResults)) {
    return suite.testResults as Array<Record<string, unknown>>;
  }
  return [];
}

function assertionName(assertion: Record<string, unknown>): string {
  if (typeof assertion.fullName === 'string' && assertion.fullName.trim()) {
    return assertion.fullName.trim();
  }
  const ancestors = Array.isArray(assertion.ancestorTitles)
    ? (assertion.ancestorTitles as unknown[]).map(String)
    : [];
  const title = String(assertion.title ?? assertion.name ?? 'unnamed');
  return [...ancestors, title].filter(Boolean).join(' › ');
}

function mapSuiteResult(suite: Record<string, unknown>): {
  result: TestResult;
  cases: TestCaseRow[];
} {
  const assertions = getAssertions(suite);
  const failed = assertions.filter((t) => t.status === 'failed');
  const passed = assertions.filter((t) => t.status === 'passed');
  const filePath = String(suite.testFilePath ?? suite.name ?? '');

  const numPassingTests =
    typeof suite.numPassingTests === 'number'
      ? suite.numPassingTests
      : passed.length;

  const numFailingTests =
    typeof suite.numFailingTests === 'number'
      ? suite.numFailingTests
      : failed.length;

  const cases: TestCaseRow[] = assertions.map((t) => ({
    file: filePath,
    name: assertionName(t),
    status: String(t.status ?? 'unknown').toLowerCase(),
  }));

  return {
    result: {
      testFilePath: filePath,
      numPassingTests,
      numFailingTests,
      duration: Number(suite.endTime ?? 0) - Number(suite.startTime ?? 0),
      failureMessages: failed.flatMap((t) =>
        Array.isArray(t.failureMessages) ? (t.failureMessages as string[]) : []
      ),
    },
    cases,
  };
}

function isJestReport(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>).testResults)
  );
}

/** Extract the Jest report object from noisy stdout (logs before/after JSON). */
function parseJestJsonFromStdout(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isJestReport(parsed)) return parsed;
  } catch {
    // continue with braced extraction
  }

  // Scan for `{...}` blobs and keep the one that looks like a Jest report.
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < trimmed.length; j++) {
      const ch = trimmed[j]!;
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(i, j + 1);
          try {
            const parsed = JSON.parse(slice) as unknown;
            if (isJestReport(parsed)) return parsed;
          } catch {
            // not valid / not a report — keep scanning
          }
          break;
        }
      }
    }
  }

  throw new Error('Jest did not produce a JSON report on stdout');
}

function readJestReportFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    return isJestReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface RunJestOptions {
  /** Approximate suite count (e.g. discovered test files) for % progress. */
  expectedSuites?: number;
  /** Called as Jest finishes each suite (PASS/FAIL lines on stderr). */
  onProgress?: (completed: number, total: number) => void;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Jest default reporter lines look like: "PASS path/to/file.test.ts" */
const SUITE_DONE_RE = /\b(PASS|FAIL)\s+\S+/;

function attachSuiteProgress(
  stream: NodeJS.ReadableStream | null | undefined,
  expectedSuites: number,
  onProgress?: (completed: number, total: number) => void
): void {
  let completed = 0;
  let buffer = '';

  if (!stream || !onProgress || expectedSuites <= 0) {
    return;
  }

  const total = expectedSuites;
  onProgress(0, total);

  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (SUITE_DONE_RE.test(stripAnsi(line))) {
        completed += 1;
        onProgress(Math.min(completed, total), total);
      }
    }
  });
}

export async function runJestTests(
  projectPath: string,
  options: RunJestOptions = {}
): Promise<RunSummary> {
  const outputFile = path.join(
    os.tmpdir(),
    `test-auditor-jest-${process.pid}-${Date.now()}.json`
  );

  try {
    // Prefer --outputFile so project console logs cannot corrupt the JSON report.
    // Force json-summary/json reporters: next/jest + `projects` often override coverageReporters.
    // Keep default reporter on stderr (not fully silent) so we can show suite progress.
    const subprocess = execa(
      'npx',
      [
        'jest',
        '--json',
        `--outputFile=${outputFile}`,
        '--coverage',
        '--coverageReporters=json-summary',
        '--coverageReporters=json',
      ],
      { cwd: projectPath, reject: false }
    );

    attachSuiteProgress(
      subprocess.stderr,
      options.expectedSuites ?? 0,
      options.onProgress
    );

    const result = await subprocess;
    const stdout = result.stdout ?? '';

    const parsed =
      readJestReportFile(outputFile) ?? parseJestJsonFromStdout(stdout);

    const suites = parsed.testResults as Array<Record<string, unknown>>;

    // Snap progress to 100% once Jest finishes (suite count may differ from discovery).
    if (options.onProgress && (options.expectedSuites ?? 0) > 0) {
      options.onProgress(options.expectedSuites!, options.expectedSuites!);
    }

    const coverageMap =
      parsed.coverageMap && typeof parsed.coverageMap === 'object'
        ? (parsed.coverageMap as Record<string, unknown>)
        : null;

    const mapped = suites.map(mapSuiteResult);
    const testResults = mapped.map((m) => m.result);
    const testCases = mapped.flatMap((m) => m.cases);

    return {
      success: Boolean(parsed.success),
      numTotalTests: Number(parsed.numTotalTests ?? 0),
      numPassedTests: Number(parsed.numPassedTests ?? 0),
      numFailedTests: Number(parsed.numFailedTests ?? 0),
      numPendingTests: Number(parsed.numPendingTests ?? 0),
      numTodoTests: Number(parsed.numTodoTests ?? 0),
      testResults,
      testCases,
      coverageMap,
    };
  } catch (err) {
    throw new Error(`Failed to run Jest in ${projectPath}: ${(err as Error).message}`);
  } finally {
    try {
      fs.unlinkSync(outputFile);
    } catch {
      // ignore cleanup errors
    }
  }
}
