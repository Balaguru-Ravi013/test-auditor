import type { CmsMigrationReport } from './reportGenerator.js';
import { analyzeCmsMigration, analyzeCmsInTests } from './cmsMigrationAnalyzer.js';
import { computeCmsReadiness, computeSingleCmsReadiness } from './cmsReadinessScore.js';
import type { CmsAuditPlan } from './cmsSelection.js';

export function buildCmsMigrationReport(
  plan: CmsAuditPlan,
  files: string[]
): CmsMigrationReport {
  if (plan.mode === 'migration' && plan.migration) {
    const { from, to } = plan.migration;
    const issues = analyzeCmsMigration(files, from, to);
    const readiness = computeCmsReadiness(files.length, issues, from, to);
    return { readiness, issues };
  }

  const allIssues = [];
  let readiness = null;

  for (const cms of plan.checkCms) {
    const issues = analyzeCmsInTests(files, cms);
    allIssues.push(...issues);
    const cmsReadiness = computeSingleCmsReadiness(files.length, issues, cms);
    if (!readiness || cmsReadiness.score < readiness.score) {
      readiness = cmsReadiness;
    }
  }

  if (plan.checkCms.length > 1 && readiness) {
    readiness = {
      ...readiness,
      summary: `Checked ${plan.checkCms.length} CMS package(s): ${plan.checkCms.map((c) => c.displayName).join(', ')}. ${readiness.summary}`,
    };
  }

  return {
    readiness: readiness!,
    issues: allIssues,
  };
}
