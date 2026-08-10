// src/cmsReadinessScore.ts
import type { CmsEntry } from './cmsRegistry.js';
import type { CmsMigrationIssue } from './cmsMigrationAnalyzer.js';

export interface CmsReadinessReport {
  score: number;
  grade: string;
  label: string;
  summary: string;
  fromCms: { id: string; displayName: string };
  toCms: { id: string; displayName: string };
  stats: {
    filesScanned: number;
    filesWithLegacyRefs: number;
    legacyIssues: number;
    gapIssues: number;
    progressSignals: number;
  };
  byCategory: { category: string; count: number }[];
}

function gradeFor(score: number): { grade: string; label: string } {
  if (score >= 90) return { grade: 'A', label: 'Migration-ready' };
  if (score >= 80) return { grade: 'B', label: 'Mostly migrated' };
  if (score >= 70) return { grade: 'C', label: 'Needs work' };
  if (score >= 55) return { grade: 'D', label: 'Early migration' };
  return { grade: 'F', label: 'Heavy legacy debt' };
}

/**
 * Separate from Quality Score — only reflects CMS migration findings.
 */
export function computeCmsReadiness(
  filesScanned: number,
  issues: CmsMigrationIssue[],
  from: CmsEntry,
  to: CmsEntry
): CmsReadinessReport {
  const legacyIssues = issues.filter((i) => i.category === 'legacy');
  const gapIssues = issues.filter((i) => i.category === 'gap');
  const progressSignals = issues.filter((i) => i.category === 'progress');

  const filesWithLegacy = new Set(
    legacyIssues.map((i) => i.file)
  ).size;

  const warningLegacy = legacyIssues.filter((i) => i.severity === 'warning').length;
  const infoLegacy = legacyIssues.filter((i) => i.severity === 'info').length;

  let score = 100;

  // Cap file-based deduction so huge suites don't always hit zero
  const filePenalty = Math.min(45, filesWithLegacy * 8);
  score -= filePenalty;

  score -= Math.min(35, warningLegacy * 4);
  score -= Math.min(15, infoLegacy * 1);
  score -= Math.min(20, gapIssues.length * 3);

  // Partial migration bonus
  score += Math.min(12, progressSignals.length * 2);

  // If nothing scanned or no legacy at all → strong readiness
  if (filesScanned > 0 && filesWithLegacy === 0 && gapIssues.length === 0) {
    score = Math.max(score, 95);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const { grade, label } = gradeFor(score);

  const byCategoryMap = new Map<string, number>();
  for (const i of issues) {
    byCategoryMap.set(i.category, (byCategoryMap.get(i.category) ?? 0) + 1);
  }
  const byCategory = Array.from(byCategoryMap.entries()).map(([category, count]) => ({
    category,
    count,
  }));

  let summary: string;
  if (filesWithLegacy === 0 && gapIssues.length === 0) {
    summary = `No ${from.displayName} patterns found in unit tests. Suite looks ready for ${to.displayName}.`;
  } else if (progressSignals.length > 0 && filesWithLegacy > 0) {
    summary = `${filesWithLegacy} file(s) still reference ${from.displayName}; ${progressSignals.length} show partial ${to.displayName} adoption.`;
  } else {
    summary = `${filesWithLegacy} file(s) still reference ${from.displayName} (${legacyIssues.length} legacy finding(s)). Update mocks, imports, and fixtures for ${to.displayName}.`;
  }

  return {
    score,
    grade,
    label,
    summary,
    fromCms: { id: from.id, displayName: from.displayName },
    toCms: { id: to.id, displayName: to.displayName },
    stats: {
      filesScanned,
      filesWithLegacyRefs: filesWithLegacy,
      legacyIssues: legacyIssues.length,
      gapIssues: gapIssues.length,
      progressSignals: progressSignals.length,
    },
    byCategory,
  };
}
