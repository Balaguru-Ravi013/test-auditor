import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { input, confirm } from '@inquirer/prompts';
import { CONFIG_FILENAME, findProjectRoot } from './projectRoot.js';
import {
  DEFAULT_API_URL,
  type TestAuditorConfig,
} from './testAuditorConfig.js';

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function packageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, '../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function ensureDevDependency(targetRoot: string, depName: string, depVersion: string): boolean {
  const packageJsonPath = path.join(targetRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const raw = fs.readFileSync(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(raw) as PackageJson;
  let changed = false;

  if (pkg.dependencies?.[depName]) {
    delete pkg.dependencies[depName];
    changed = true;
  }

  pkg.devDependencies ??= {};
  if (pkg.devDependencies[depName] !== `^${depVersion}`) {
    pkg.devDependencies[depName] = `^${depVersion}`;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
  }

  return changed;
}

export async function runInitCommand(startDir: string = process.cwd()): Promise<void> {
  const cwd = path.resolve(startDir);
  const existing = findProjectRoot(cwd);
  const targetRoot = existing?.root ?? cwd;
  const configPath = path.join(targetRoot, CONFIG_FILENAME);

  console.log();
  console.log(chalk.bold('  Test Auditor setup'));
  console.log(chalk.dim('  ────────────────────────────────────'));
  console.log();

  if (fs.existsSync(configPath)) {
    console.log(`  ${chalk.yellow('!')} ${CONFIG_FILENAME} already exists at:`);
    console.log(`    ${chalk.bold(configPath)}`);
    console.log();
    const overwrite = await confirm({
      message: 'Overwrite the existing configuration file?',
      default: false,
    });
    if (!overwrite) {
      console.log(chalk.dim('  Setup cancelled.'));
      console.log();
      return;
    }
  }

  const apiKey = await input({
    message: 'Project API key',
    validate: (value) => (value.trim().length > 0 ? true : 'API key is required'),
  });

  const config: TestAuditorConfig = {
    apiUrl: DEFAULT_API_URL,
    apiKey: apiKey.trim(),
    cmsReadiness: false,
    schedule: {
      enabled: false,
      frequency: 'daily',
      time: '09:00',
      timezone: 'UTC',
    },
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

  console.log();
  console.log(`  ${chalk.green('✓')} Created ${CONFIG_FILENAME}`);
  console.log(`    ${chalk.bold(configPath)}`);
  console.log();
  console.log(chalk.dim('  API URL and API key are read from .test-auditor.json on each audit run.'));
  console.log(chalk.dim('  Keep this file secure and add it to .gitignore if it contains secrets.'));
  console.log();

  const packageJsonPath = path.join(targetRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkgChanged = ensureDevDependency(targetRoot, 'test-auditor', packageVersion());
    if (pkgChanged) {
      console.log(`  ${chalk.green('✓')} Updated the package.json`);
    }

    const shouldAddScript = await confirm({
      message: 'Add an npm "audit" script to package.json?',
      default: true,
    });

    if (shouldAddScript) {
      const raw = fs.readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(raw) as PackageJson;
      pkg.scripts ??= {};
      if (pkg.scripts.audit && pkg.scripts.audit !== 'test-auditor --path . --no-open') {
        console.log(
          chalk.yellow(`  ! package.json already has scripts.audit: ${pkg.scripts.audit}`)
        );
      } else {
        pkg.scripts.audit = 'test-auditor --path . --no-open';
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
        console.log(`  ${chalk.green('✓')} Updated the package.json`);
        console.log(`    ${chalk.dim('Added script:')} ${chalk.bold('npm run audit')}`);
      }
    }
  }

  console.log();
  console.log(chalk.dim('  Next step: npm run audit'));
  console.log();
}
