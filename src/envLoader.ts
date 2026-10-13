import fs from 'fs';
import path from 'path';

const TEST_AUDITOR_ENV_KEYS = new Set([
  'TEST_AUDITOR_API_KEY',
  'TEST_AUDITOR_API_URL',
  'TEST_AUDITOR_API_TIMEOUT',
]);

/**
 * Parse a simple KEY=VALUE .env file. Does not support multiline values.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

/**
 * Apply parsed .env values without overriding variables already set in the process.
 */
export function applyEnvVars(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Load the nearest .env file walking upward from startDir.
 * Returns the loaded file path, if any.
 */
export function loadEnvFromAncestors(startDir: string = process.cwd()): string | undefined {
  let current = path.resolve(startDir);
  const seen = new Set<string>();

  while (!seen.has(current)) {
    seen.add(current);
    const envPath = path.join(current, '.env');
    if (fs.existsSync(envPath)) {
      const contents = fs.readFileSync(envPath, 'utf-8');
      applyEnvVars(parseEnvFile(contents));
      return envPath;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return undefined;
}

export function redactSecret(value: string | undefined): string {
  if (!value) return '(not set)';
  return '********';
}

export function isTestAuditorEnvKey(key: string): boolean {
  return TEST_AUDITOR_ENV_KEYS.has(key);
}
