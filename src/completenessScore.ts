// src/completenessScore.ts
import type { CompletenessAnalysis, CompletenessRecommendation } from './completenessAnalyzer.js';

export interface CompletenessReport {
  score: number;
  grade: string;
  label: string;
  summary: string;
  stats: {
    sourcesScanned: number;
    withTests: number;
    untested: number;
    weakCoverage: number;
    perfRisks: number;
    recommendations: number;
    highPriority: number;
  };
}

function gradeFor(score: number): { grade: string; label: string } {
  if (score >= 90) return { grade: 'A', label: 'Well covered' };
  if (score >= 80) return { grade: 'B', label: 'Mostly complete' };
  if (score >= 70) return { grade: 'C', label: 'Gaps remain' };
  if (score >= 55) return { grade: 'D', label: 'Many gaps' };
  return { grade: 'F', label: 'Critical gaps' };
}

function weightFor(rec: CompletenessRecommendation): number {
  const kindW =
    rec.kind === 'page' || rec.kind === 'api'
      ? 1.4
      : rec.kind === 'component' || rec.kind === 'hook' || rec.kind === 'service'
        ? 1.0
        : 0.5;
  const priW = rec.priority === 'high' ? 1.2 : rec.priority === 'medium' ? 1.0 : 0.6;
  const tagW =
    rec.tag === 'missing' ? 1.0 : rec.tag === 'weak-coverage' ? 0.7 : 0.5;
  return kindW * priW * tagW;
}

/**
 * Separate from Quality Score — reflects source↔test gap completeness only.
 */
export function computeCompletenessScore(
  analysis: CompletenessAnalysis
): CompletenessReport {
  const { sourcesScanned, withTests, untested, weakCoverage, perfRisks, recommendations } =
    analysis;

  let score = 100;

  if (sourcesScanned === 0) {
    return {
      score: 100,
      grade: 'A',
      label: 'N/A',
      summary: 'No application source files matched discovery patterns.',
      stats: {
        sourcesScanned: 0,
        withTests: 0,
        untested: 0,
        weakCoverage: 0,
        perfRisks: 0,
        recommendations: 0,
        highPriority: 0,
      },
    };
  }

  const untestedRatio = untested / sourcesScanned;
  score -= Math.min(50, Math.round(untestedRatio * 55));

  let penalty = 0;
  for (const rec of recommendations) {
    penalty += weightFor(rec) * (rec.tag === 'missing' ? 1.5 : 1);
  }
  score -= Math.min(35, Math.round(penalty * 0.35));

  // Bonus when most sources have tests
  const coveredRatio = withTests / sourcesScanned;
  if (coveredRatio >= 0.85) score += 5;
  else if (coveredRatio >= 0.7) score += 2;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const { grade, label } = gradeFor(score);

  const highPriority = recommendations.filter((r) => r.priority === 'high').length;
  const top = recommendations
    .filter((r) => r.priority === 'high' || r.tag === 'missing')
    .slice(0, 3)
    .map((r) => {
      const parts = r.source.replace(/\\/g, '/').split('/');
      return parts.slice(-2).join('/');
    });

  let summary: string;
  if (untested === 0 && recommendations.length === 0) {
    summary = `All ${sourcesScanned} discovered source modules appear to have matching unit tests.`;
  } else if (top.length > 0) {
    summary = `${untested} untested module(s), ${weakCoverage} weak-coverage, ${perfRisks} perf-risk. Focus: ${top.join(', ')}.`;
  } else {
    summary = `${untested} of ${sourcesScanned} source modules lack matching unit tests.`;
  }

  return {
    score,
    grade,
    label,
    summary,
    stats: {
      sourcesScanned,
      withTests,
      untested,
      weakCoverage,
      perfRisks,
      recommendations: recommendations.length,
      highPriority,
    },
  };
}
