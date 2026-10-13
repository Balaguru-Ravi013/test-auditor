import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootstrapProjectConfiguration } from '../dist/configBootstrap.js';
import { resolveUploadConfig } from '../dist/uploadConfig.js';

describe('configBootstrap', () => {
  const originalEnv = { ...process.env };
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'test-auditor-bootstrap-'));
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

  it('loads config and applies file apiKey over .env', () => {
    fs.writeFileSync(
      path.join(tempRoot, '.test-auditor.json'),
      JSON.stringify({
        apiUrl: 'https://repo.example.com/api/reports',
        apiKey: 'utc_repo_key',
      })
    );
    fs.writeFileSync(path.join(tempRoot, '.env'), 'TEST_AUDITOR_API_KEY=utc_nested_env\n');

    const nested = path.join(tempRoot, 'apps', 'web');
    fs.mkdirSync(nested, { recursive: true });

    const bootstrapped = bootstrapProjectConfiguration(nested);
    const uploadConfig = resolveUploadConfig({
      configFilePath: bootstrapped.configFilePath,
    });
    assert.equal(uploadConfig.apiUrl, 'https://repo.example.com/api/reports');
    assert.equal(uploadConfig.apiKey, 'utc_repo_key');
    assert.equal(uploadConfig.uploadEnabled, true);
  });

  it('prefers CLI API key over configuration file', () => {
    const config = resolveUploadConfig({
      apiKey: 'utc_cli_key',
      configFilePath: new URL('./fixtures/upload-config.json', import.meta.url).pathname,
    });
    assert.equal(config.apiKey, 'utc_cli_key');
  });

  it('prefers shell environment over .env for API key', () => {
    fs.writeFileSync(path.join(tempRoot, '.env'), 'TEST_AUDITOR_API_KEY=utc_env_key\n');
    process.env.TEST_AUDITOR_API_KEY = 'utc_shell_key';

    bootstrapProjectConfiguration(tempRoot);
    const uploadConfig = resolveUploadConfig({});
    assert.equal(uploadConfig.apiKey, 'utc_shell_key');
  });
});
