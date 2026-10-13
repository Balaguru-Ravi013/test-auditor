import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseEnvFile,
  applyEnvVars,
  loadEnvFromAncestors,
  redactSecret,
} from '../dist/envLoader.js';

describe('envLoader', () => {
  const originalEnv = { ...process.env };
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'test-auditor-env-'));
    delete process.env.TEST_AUDITOR_API_KEY;
    delete process.env.TEST_AUDITOR_API_URL;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('parses simple .env files', () => {
    const vars = parseEnvFile(`
      # comment
      TEST_AUDITOR_API_KEY=utc_from_env_file
      TEST_AUDITOR_API_URL="https://env.example.com/api/reports"
    `);
    assert.equal(vars.TEST_AUDITOR_API_KEY, 'utc_from_env_file');
    assert.equal(vars.TEST_AUDITOR_API_URL, 'https://env.example.com/api/reports');
  });

  it('does not override existing environment variables', () => {
    process.env.TEST_AUDITOR_API_KEY = 'utc_from_shell';
    applyEnvVars({ TEST_AUDITOR_API_KEY: 'utc_from_env_file' });
    assert.equal(process.env.TEST_AUDITOR_API_KEY, 'utc_from_shell');
  });

  it('loads .env from a parent directory', () => {
    const nested = path.join(tempRoot, 'apps', 'web');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, '.env'),
      'TEST_AUDITOR_API_KEY=utc_nested_env\n'
    );

    const envPath = loadEnvFromAncestors(nested);
    assert.equal(envPath, path.join(tempRoot, '.env'));
    assert.equal(process.env.TEST_AUDITOR_API_KEY, 'utc_nested_env');
  });

  it('redacts secrets for safe logging', () => {
    assert.equal(redactSecret('utc_secret_key'), '********');
    assert.equal(redactSecret(undefined), '(not set)');
  });
});
