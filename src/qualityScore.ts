// src/qualityScore.ts
import type { TestIssue, StrategyId } from './rules/types.js';
import { STRATEGY_META } from './rules/types.js';
import type { FileCoverage } from './coverageParser.js';
import type { RunSummary } from './testRunner.js';

export interface StrategyBreakdown {
  strategy: StrategyId;
  title: string;
  blurb: string;
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

export interface QualityReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  summary: string;
  byStrategy: StrategyBreakdown[];
}

const WEIGHT: Record<TestIssue['severity'], number> = {
  error: 6,
  warning: 2,
  info: 0.5,
};

export function computeQualityScore(
  issues: TestIssue[],
  runSummary: RunSummary,
  coverage: FileCoverage[]
): QualityReport {
  let score = 100;

  for (const issue of issues) {
    score -= WEIGHT[issue.severity] ?? 1;
  }

  // Runtime signal
  if (runSummary.numTotalTests > 0) {
    const failRate = runSummary.numFailedTests / runSummary.numTotalTests;
    score -= failRate * 25;
  }

  // Coverage signal (average lines %)
  if (coverage.length > 0) {
    const avg =
      coverage.reduce((s, c) => s + c.lines, 0) / coverage.length;
    if (avg < 50) score -= 15;
    else if (avg < 70) score -= 8;
    else if (avg < 85) score -= 3;
    else score += 2;
  } else if (runSummary.numTotalTests > 0) {
    score -= 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade: QualityReport['grade'] =
    score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';

  const label =
    grade === 'A'
      ? 'Excellent'
      : grade === 'B'
        ? 'Good'
        : grade === 'C'
          ? 'Fair'
          : grade === 'D'
            ? 'Poor'
            : 'Critical';

  const buckets = new Map<StrategyId, StrategyBreakdown>();
  for (const issue of issues) {
    const meta = STRATEGY_META[issue.strategy] ?? {
      title: issue.strategy,
      blurb: '',
    };
    let b = buckets.get(issue.strategy);
    if (!b) {
      b = {
        strategy: issue.strategy,
        title: meta.title,
        blurb: meta.blurb,
        errors: 0,
        warnings: 0,
        infos: 0,
        total: 0,
      };
      buckets.set(issue.strategy, b);
    }
    b.total++;
    if (issue.severity === 'error') b.errors++;
    else if (issue.severity === 'warning') b.warnings++;
    else b.infos++;
  }

  const byStrategy = [...buckets.values()].sort((a, b) => b.total - a.total);

  const top = byStrategy.slice(0, 3).map((s) => s.title);
  const summary =
    issues.length === 0
      ? 'No static quality issues detected.'
      : `Top risk areas: ${top.join(', ') || 'various'}.`;

  return { score, grade, label, summary, byStrategy };
}
