#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { discoverTestFiles } from './discovery.js';
import { analyzeFile } from './staticAnalyzer.js';
import { runJestTests } from './testRunner.js';
import { parseCoverage } from './coverageParser.js';
import { generateMarkdownReport } from './reportGenerator.js';
import { openReportViewer } from './viewerServer.js';
import { computeQualityScore } from './qualityScore.js';

/**
 * Keys (labels) stay neutral bold.
 * Values use semantic color only:
 *   green  = success / passed / done
 *   yellow = intermediate / warnings / in-progress
 *   red    = errors / failures
 */
const key = (text: string) => chalk.bold(text);
const dim = chalk.dim;
const red = (text: string | number) => chalk.red.bold(String(text));
const yellow = (text: string | number) => chalk.yellow.bold(String(text));
const green = (text: string | number) => chalk.green.bold(String(text));

function printHeader() {
  console.log();
  console.log(key('  Jest Test Auditor'));
  console.log(dim('  ────────────────────────────────────'));
  console.log();
}

function printStep(title: string, detail: string) {
  console.log(`  ${key(title)}`);
  console.log(`  ${detail}`);
  console.log();
}

function progressBar(pct: number, width = 24): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const fill = clamped >= 100 ? chalk.green : chalk.yellow;
  return `${fill('█'.repeat(filled))}${dim('░'.repeat(empty))}`;
}

function renderJestProgress(pct: number, completed: number, total: number) {
  const pctText = pct >= 100 ? green(`${pct}%`) : yellow(`${pct}%`);
  const line = `  ${progressBar(pct)}  ${pctText}  ${dim(`·  ${completed}/${total} suites`)}`;
  process.stdout.write(`\r${line}${''.padEnd(8)}`);
}

const program = new Command();

program
  .name('jest-test-auditor')
  .description('Audit Jest test suites in any Next.js (or JS/TS) project')
  .requiredOption('-p, --path <path>', 'Path to the target project')
  .option('-o, --output <path>', 'Output report path', './audit-report.md')
  .option('--skip-run', 'Skip actually running Jest (static analysis only)')
  .option('--no-open', 'Do not open the interactive report viewer after audit')
  .action(async (options) => {
    const projectPath = path.resolve(options.path);
    printHeader();
    // Path is context (not success/danger) — bold only
    printStep('Project', chalk.bold(projectPath));

    // 1. Discover test files
    const files = await discoverTestFiles(projectPath);
    printStep(
      'Discovery',
      `${yellow(files.length)} ${dim('test files')}`
    );

    // 2. Static analysis
    const staticIssues = files.flatMap((f) => analyzeFile(f));
    const errors = staticIssues.filter((i) => i.severity === 'error').length;
    const warnings = staticIssues.filter((i) => i.severity === 'warning').length;
    let issueDetail: string;
    if (staticIssues.length === 0) {
      issueDetail = `${green(0)} ${dim('issues')}`;
    } else if (errors > 0) {
      issueDetail = `${red(errors)} ${dim('errors')} · ${yellow(warnings)} ${dim('warnings')}`;
    } else {
      issueDetail = `${yellow(warnings)} ${dim('warnings')}`;
    }
    printStep('Static analysis', issueDetail);

    // 3. Run tests (unless skipped)
    let runSummary;
    if (!options.skipRun) {
      console.log(`  ${key('Running Jest')}`);
      renderJestProgress(0, 0, files.length);

      runSummary = await runJestTests(projectPath, {
        expectedSuites: files.length,
        onProgress: (completed, total) => {
          const pct = Math.min(100, Math.round((completed / total) * 100));
          renderJestProgress(pct, completed, total);
        },
      });

      process.stdout.write('\n\n');

      const failCount = runSummary.numFailedTests;
      const resultParts = [
        failCount > 0
          ? `${red(failCount)} ${dim('failed')}`
          : null,
        `${green(runSummary.numPassedTests)} ${dim('passed')}`,
        `${chalk.bold(String(runSummary.numTotalTests))} ${dim('total')}`,
      ].filter(Boolean);
      printStep('Jest result', resultParts.join(' · '));
    } else {
      printStep('Running Jest', dim('skipped'));
      runSummary = {
        success: true,
        numTotalTests: 0,
        numPassedTests: 0,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        testResults: [],
        testCases: [],
        coverageMap: null,
      };
    }

    // 4. Parse coverage (summary file, final.json, or in-memory coverageMap)
    const coverage = parseCoverage(projectPath, runSummary.coverageMap);

    // 5. Quality score + report
    const quality = computeQualityScore(staticIssues, runSummary, coverage);
    const gradeColor =
      quality.grade === 'A' || quality.grade === 'B'
        ? green
        : quality.grade === 'C'
          ? yellow
          : red;
    printStep(
      'Quality',
      `${gradeColor(`${quality.grade} · ${quality.score}/100`)} ${dim(`(${quality.label})`)}`
    );

    const outputPath = path.resolve(options.output);
    generateMarkdownReport(
      { staticIssues, runSummary, coverage, quality },
      outputPath
    );

    printStep('Report', green(outputPath));

    if (options.open !== false) {
      printStep(
        'Viewer',
        `${yellow('Opening')} ${dim('interactive report (Ctrl+C to stop)')}`
      );
      try {
        await openReportViewer(outputPath);
        console.log(`  ${green('Done')}`);
        console.log();
      } catch (err) {
        console.log(
          `  ${red('Could not open viewer:')} ${dim((err as Error).message)}`
        );
        console.log(
          `  ${dim('Open manually:')} node_modules/test-auditor/viewer/index.html`
        );
        console.log(`  ${green('Done')}`);
        console.log();
      }
    } else {
      console.log(
        `  ${dim('Viewer:')} open node_modules/test-auditor/viewer/index.html ${dim('(or re-run without --no-open)')}`
      );
      console.log(`  ${green('Done')}`);
      console.log();
    }
  });

program.parse();
