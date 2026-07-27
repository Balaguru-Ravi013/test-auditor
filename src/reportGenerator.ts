// src/reportGenerator.ts
import fs from 'fs';
import type { TestIssue } from './staticAnalyzer.js';
import type { RunSummary } from './testRunner.js';
import type { FileCoverage } from './coverageParser.js';
import type { QualityReport } from './qualityScore.js';

export interface AuditReport {
  staticIssues: TestIssue[];
  runSummary: RunSummary;
  coverage: FileCoverage[];
  quality: QualityReport;
}

function escCell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function generateMarkdownReport(report: AuditReport, outputPath: string) {
  const { staticIssues, runSummary, coverage, quality } = report;

  const errorCount = staticIssues.filter((i) => i.severity === 'error').length;
  const warningCount = staticIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = staticIssues.filter((i) => i.severity === 'info').length;

  let md = `# Jest Test Audit Report\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;

  md += `## Quality Score\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Score | ${quality.score}/100 |\n`;
  md += `| Grade | ${quality.grade} (${quality.label}) |\n`;
  md += `| Summary | ${escCell(quality.summary)} |\n\n`;

  if (quality.byStrategy.length > 0) {
    md += `### Strategies\n\n`;
    md += `| Strategy | Errors | Warnings | Info | Total |\n|---|---|---|---|---|\n`;
    for (const s of quality.byStrategy) {
      md += `| ${escCell(s.title)} | ${s.errors} | ${s.warnings} | ${s.infos} | ${s.total} |\n`;
    }
    md += `\n`;
  }

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Total tests | ${runSummary.numTotalTests} |\n`;
  md += `| Passed | ${runSummary.numPassedTests} |\n`;
  md += `| Failed | ${runSummary.numFailedTests} |\n`;
  md += `| Pending | ${runSummary.numPendingTests} |\n`;
  md += `| Todo | ${runSummary.numTodoTests} |\n`;
  md += `| Static errors | ${errorCount} |\n`;
  md += `| Static warnings | ${warningCount} |\n`;
  md += `| Static info | ${infoCount} |\n\n`;

  md += `## Static Analysis Issues\n\n`;
  if (staticIssues.length === 0) {
    md += `No issues found.\n\n`;
  } else {
    md += `| File | Line | Strategy | Rule | Severity | Message |\n|---|---|---|---|---|---|\n`;
    for (const issue of staticIssues) {
      md += `| ${escCell(issue.file)} | ${issue.line} | ${escCell(issue.strategy)} | ${escCell(issue.rule)} | ${issue.severity} | ${escCell(issue.message)} |\n`;
    }
    md += `\n`;
  }

  md += `## Failed Tests\n\n`;
  const failed = runSummary.testResults.filter((t) => t.numFailingTests > 0);
  const failedAssertionCount = failed.reduce((n, t) => n + t.numFailingTests, 0);
  md += `Failed tests: **${runSummary.numFailedTests}** · Files with failures: **${failed.length}** · Listed assertions: **${failedAssertionCount}**\n\n`;
  if (failed.length === 0) {
    md += `None.\n\n`;
  } else {
    for (const f of failed) {
      md += `### ${f.testFilePath}\n\n`;
      md += `_Failing in this file: ${f.numFailingTests}_\n\n`;
      f.failureMessages.forEach((msg) => {
        md += `\`\`\`\n${msg}\n\`\`\`\n\n`;
      });
    }
  }

  md += `## Test Cases\n\n`;
  const cases = runSummary.testCases ?? [];
  if (cases.length === 0) {
    md += `No individual test cases were captured from Jest JSON.\n\n`;
  } else {
    md += `| File | Test | Status |\n|---|---|---|\n`;
    for (const c of cases) {
      md += `| ${escCell(c.file)} | ${escCell(c.name)} | ${escCell(c.status)} |\n`;
    }
    md += `\n`;
  }

  md += `## Coverage\n\n`;
  if (coverage.length === 0) {
    md += `No coverage data found. The auditor runs Jest with \`--coverage\` and forces \`json-summary\`/\`json\` reporters; check that Jest can collect coverage in this project.\n\n`;
  } else {
    md += `| File | Statements % | Branches % | Functions % | Lines % |\n|---|---|---|---|---|\n`;
    for (const c of coverage) {
      md += `| ${escCell(c.file)} | ${c.statements} | ${c.branches} | ${c.functions} | ${c.lines} |\n`;
    }
  }

  fs.writeFileSync(outputPath, md, 'utf-8');
}
