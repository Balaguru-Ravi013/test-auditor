#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { discoverTestFiles } from './discovery.js';
import { analyzeFile } from './staticAnalyzer.js';
import { runJestTests } from './testRunner.js';
import { parseCoverage } from './coverageParser.js';
import { generateMarkdownReport, writeJsonReport } from './reportGenerator.js';
import type { CmsMigrationReport, CompletenessAuditReport } from './reportGenerator.js';
import { openReportViewer } from './viewerServer.js';
import { computeQualityScore } from './qualityScore.js';
import { loadCmsRegistry } from './cmsRegistry.js';
import { resolveCmsAuditPlan } from './cmsSelection.js';
import { buildCmsMigrationReport } from './cmsAudit.js';
import { discoverSourceFiles } from './sourceDiscovery.js';
import { analyzeCompleteness } from './completenessAnalyzer.js';
import { computeCompletenessScore } from './completenessScore.js';
import { bootstrapProjectConfiguration } from './configBootstrap.js';
import { resolveUploadConfig, getMissingApiKeyMessage, readConfigFile } from './testAuditorConfig.js';
import { uploadReportFromFile } from './reportUploader.js';
import { runInitCommand } from './initCommand.js';

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

function deriveJsonOutputPath(markdownPath: string): string {
  if (markdownPath.endsWith('.md')) {
    return `${markdownPath.slice(0, -3)}.json`;
  }
  return `${markdownPath}.json`;
}

const program = new Command();

program.name('jest-test-auditor').description('Audit Jest test suites in any Next.js (or JS/TS) project');

program
  .command('init')
  .description('Create .test-auditor.json and configure this project for npm run audit')
  .action(async () => {
    try {
      await runInitCommand(process.cwd());
    } catch (err) {
      console.error(chalk.red(`Init failed: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

program
  .command('audit', { isDefault: true })
  .description('Run a Jest test audit')
  .requiredOption('-p, --path <path>', 'Path to the target project')
  .option('-o, --output <path>', 'Output report path', './audit-report.md')
  .option('--skip-run', 'Skip actually running Jest (static analysis only)')
  .option('--no-open', 'Do not open the interactive report viewer after audit')
  .option('--no-cms', 'Skip CMS readiness check')
  .option('--cms-readiness', 'Include CMS readiness check (overrides .test-auditor.json)')
  .option('--cms-from <id>', 'CMS currently used (non-interactive migration; requires --cms-to)')
  .option('--cms-to <id>', 'CMS being adopted (non-interactive migration; requires --cms-from)')
  .option('--cms-config <path>', 'Optional CMS registry JSON to merge/override built-in catalog')
  .option('--no-completeness', 'Skip source↔test gap / completeness analysis')
  .option('--json-output <path>', 'JSON report path for upload and local archive')
  .option('--upload', 'Upload the JSON report to the configured backend API')
  .option('--no-upload', 'Skip report upload even when API credentials are configured')
  .option('--api-key <key>', 'Project API key (sent via x-api-key header)')
  .option('--api-url <url>', 'Report upload API URL')
  .option('--api-timeout <ms>', 'Report upload timeout in milliseconds')
  .action(async (options) => {
    const projectPath = path.resolve(options.path);
    const bootstrapped = bootstrapProjectConfiguration(process.cwd());

    printHeader();
    if (bootstrapped.configFilePath) {
      printStep(
        'Configuration',
        `${green('found')} ${dim(bootstrapped.configFilePath)}`
      );
    } else {
      printStep(
        'Configuration',
        `${yellow('no .test-auditor.json found')} ${dim('(using env/defaults; run `test-auditor init`)')}`
      );
    }
    printStep('Project', chalk.bold(projectPath));

    // 1. Discover test files
    const files = await discoverTestFiles(projectPath);
    printStep(
      'Discovery',
      `${yellow(files.length)} ${dim('test files')}`
    );

    // 1b. CMS readiness (opt-in)
    let cmsMigration: CmsMigrationReport | undefined;
    const skipCms = options.cms === false;
    const fileConfig = bootstrapped.configFilePath
      ? readConfigFile(bootstrapped.configFilePath)
      : {};
    const cmsReadinessPreference =
      options.cmsReadiness === true
        ? true
        : skipCms
          ? false
          : fileConfig.cmsReadiness;

    if (!skipCms) {
      try {
        const registry = loadCmsRegistry(
          options.cmsConfig ? path.resolve(options.cmsConfig) : undefined
        );

        const plan = await resolveCmsAuditPlan({
          projectPath,
          registry,
          ...(options.cmsFrom ? { cmsFrom: options.cmsFrom } : {}),
          ...(options.cmsTo ? { cmsTo: options.cmsTo } : {}),
          interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
          ...(cmsReadinessPreference !== undefined
            ? { configCmsReadiness: cmsReadinessPreference }
            : {}),
        });

        if (plan) {
          if (plan.mode === 'migration' && plan.migration) {
            printStep(
              'CMS check',
              `${chalk.bold(plan.migration.from.displayName)} ${dim(`(${plan.migration.from.id})`)} → ${chalk.bold(plan.migration.to.displayName)} ${dim(`(${plan.migration.to.id})`)}`
            );
          } else if (plan.checkCms.length === 1) {
            printStep(
              'CMS check',
              `${chalk.bold(plan.checkCms[0]!.displayName)} ${dim(`(${plan.checkCms[0]!.id})`)} ${dim('· detected from package.json')}`
            );
          } else {
            printStep(
              'CMS check',
              plan.checkCms.map((c) => chalk.bold(c.displayName)).join(', ')
            );
          }

          cmsMigration = buildCmsMigrationReport(plan, files);
          const { readiness } = cmsMigration;
          const legacyN = readiness.stats.legacyIssues;
          const readinessColor =
            readiness.grade === 'A' || readiness.grade === 'B'
              ? green
              : readiness.grade === 'C'
                ? yellow
                : red;
          printStep(
            'CMS readiness',
            `${readinessColor(`${readiness.grade} · ${readiness.score}/100`)} ${dim(`· ${legacyN} finding(s)`)}`
          );
        }
      } catch (err) {
        console.log(`  ${red('CMS readiness setup failed:')} ${dim((err as Error).message)}`);
        console.log();
        process.exitCode = 1;
        return;
      }
    }

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

    // 4b. Test completeness (source↔test gaps) — default on, separate from Quality
    let testCompleteness: CompletenessAuditReport | undefined;
    const skipCompleteness = options.completeness === false;
    if (!skipCompleteness) {
      const sources = await discoverSourceFiles(projectPath);
      printStep(
        'Source discovery',
        `${yellow(sources.length)} ${dim('app modules for gap analysis')}`
      );
      const analysis = analyzeCompleteness(projectPath, sources, files, coverage);
      const completeness = computeCompletenessScore(analysis);
      testCompleteness = {
        completeness,
        recommendations: analysis.recommendations,
      };
      const cColor =
        completeness.grade === 'A' || completeness.grade === 'B'
          ? green
          : completeness.grade === 'C'
            ? yellow
            : red;
      printStep(
        'Completeness',
        `${cColor(`${completeness.grade} · ${completeness.score}/100`)} ${dim(`· ${completeness.stats.untested} untested · ${completeness.stats.recommendations} recs`)}`
      );
    }

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
    const jsonOutputPath = path.resolve(
      options.jsonOutput ?? deriveJsonOutputPath(outputPath)
    );
    const auditReport = {
      staticIssues,
      runSummary,
      coverage,
      quality,
      ...(cmsMigration ? { cmsMigration } : {}),
      ...(testCompleteness ? { testCompleteness } : {}),
    };

    generateMarkdownReport(auditReport, outputPath);
    writeJsonReport(auditReport, jsonOutputPath);

    printStep('Report', `${green('generated')} ${dim(`${outputPath} · ${jsonOutputPath}`)}`);

    const uploadPreference =
      options.upload === true ? true : options.noUpload === true ? false : fileConfig.upload;
    const uploadConfig = resolveUploadConfig({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
      ...(options.apiTimeout ? { apiTimeout: Number(options.apiTimeout) } : {}),
      ...(uploadPreference !== undefined ? { upload: uploadPreference } : {}),
      ...(bootstrapped.configFilePath ? { configFilePath: bootstrapped.configFilePath } : {}),
    });

    if (uploadConfig.uploadEnabled) {
      if (!uploadConfig.apiKey) {
        console.log(`  ${red('✗ Report upload failed')}`);
        console.log(`  ${dim(getMissingApiKeyMessage())}`);
        console.log(`  ${dim('The audit report is still available locally.')}`);
        console.log();
      } else {
        console.log(`  ${key('Uploading report')}...`);
        const uploadResult = await uploadReportFromFile(
          {
            apiUrl: uploadConfig.apiUrl,
            apiKey: uploadConfig.apiKey,
            timeout: uploadConfig.apiTimeout,
          },
          jsonOutputPath
        );

        if (uploadResult.success) {
          console.log(`  ${green('✓ Report uploaded successfully')}`);
          if (uploadResult.reportId) {
            console.log(`  ${dim('Report ID:')} ${chalk.bold(uploadResult.reportId)}`);
          }
          if (uploadResult.projectName) {
            console.log(`  ${dim('Project:')} ${chalk.bold(uploadResult.projectName)}`);
          } else if (uploadResult.projectId) {
            console.log(`  ${dim('Project ID:')} ${chalk.bold(uploadResult.projectId)}`);
          }
          console.log();
        } else {
          console.log(`  ${red('✗ Report upload failed')}`);
          console.log(`  ${dim('Reason:')} ${uploadResult.message}`);
          console.log(`  ${dim('The audit report is still available locally.')}`);
          console.log();
        }
      }
    }

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
