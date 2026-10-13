import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  resolveUploadConfig,
  parseTimeoutMs,
  getMissingApiKeyMessage,
  DEFAULT_API_URL,
  DEFAULT_UPLOAD_TIMEOUT_MS,
} from '../dist/uploadConfig.js';

describe('uploadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TEST_AUDITOR_API_KEY;
    delete process.env.TEST_AUDITOR_API_URL;
    delete process.env.TEST_AUDITOR_API_TIMEOUT;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('uses API key from CLI over environment', () => {
    process.env.TEST_AUDITOR_API_KEY = 'utc_env_key';
    const config = resolveUploadConfig({ apiKey: 'utc_cli_key' });
    assert.equal(config.apiKey, 'utc_cli_key');
  });

  it('uses API key from environment when CLI is not provided', () => {
    process.env.TEST_AUDITOR_API_KEY = 'utc_env_key';
    const config = resolveUploadConfig({});
    assert.equal(config.apiKey, 'utc_env_key');
    assert.equal(config.uploadEnabled, true);
  });

  it('uses API URL from CLI over environment', () => {
    process.env.TEST_AUDITOR_API_URL = 'https://env.example.com/api/reports';
    const config = resolveUploadConfig({
      apiUrl: 'https://cli.example.com/api/reports',
    });
    assert.equal(config.apiUrl, 'https://cli.example.com/api/reports');
  });

  it('uses API URL from environment when CLI is not provided', () => {
    process.env.TEST_AUDITOR_API_URL = 'https://env.example.com/api/reports';
    const config = resolveUploadConfig({});
    assert.equal(config.apiUrl, 'https://env.example.com/api/reports');
  });

  it('falls back to default API URL', () => {
    const config = resolveUploadConfig({});
    assert.equal(config.apiUrl, DEFAULT_API_URL);
  });

  it('parses timeout from environment', () => {
    process.env.TEST_AUDITOR_API_TIMEOUT = '120000';
    const config = resolveUploadConfig({});
    assert.equal(config.apiTimeout, 120000);
  });

  it('uses CLI timeout over environment', () => {
    process.env.TEST_AUDITOR_API_TIMEOUT = '120000';
    const config = resolveUploadConfig({ apiTimeout: 90000 });
    assert.equal(config.apiTimeout, 90000);
  });

  it('defaults upload to disabled when API key is missing', () => {
    const config = resolveUploadConfig({});
    assert.equal(config.uploadEnabled, false);
    assert.equal(config.apiKey, undefined);
  });

  it('can force upload enabled without API key', () => {
    const config = resolveUploadConfig({ upload: true });
    assert.equal(config.uploadEnabled, true);
    assert.equal(config.apiKey, undefined);
  });

  it('reads apiUrl and apiKey from configuration file', () => {
    const config = resolveUploadConfig({
      configFilePath: new URL('./fixtures/upload-config.json', import.meta.url).pathname,
    });
    assert.equal(config.apiKey, 'utc_file_key');
    assert.equal(config.apiUrl, 'https://file.example.com/api/reports');
    assert.equal(config.apiTimeout, 240000);
    assert.equal(config.uploadEnabled, true);
    assert.equal(config.cmsReadiness, true);
  });

  it('prefers configuration file API key over environment', () => {
    process.env.TEST_AUDITOR_API_KEY = 'utc_env_key';
    const config = resolveUploadConfig({
      configFilePath: new URL('./fixtures/upload-config.json', import.meta.url).pathname,
    });
    assert.equal(config.apiKey, 'utc_file_key');
  });

  it('gives CLI precedence over configuration file', () => {
    const config = resolveUploadConfig({
      apiKey: 'utc_cli_key',
      apiUrl: 'https://cli.example.com/api/reports',
      configFilePath: new URL('./fixtures/upload-config.json', import.meta.url).pathname,
    });
    assert.equal(config.apiKey, 'utc_cli_key');
    assert.equal(config.apiUrl, 'https://cli.example.com/api/reports');
  });

  it('returns actionable missing API key message without secrets', () => {
    const message = getMissingApiKeyMessage();
    assert.match(message, /\.test-auditor\.json/);
    assert.match(message, /--api-key/);
    assert.doesNotMatch(message, /utc_/);
  });

  it('parses timeout values safely', () => {
    assert.equal(parseTimeoutMs('60000'), 60000);
    assert.equal(parseTimeoutMs(45000), 45000);
    assert.equal(parseTimeoutMs('invalid'), undefined);
    assert.equal(parseTimeoutMs(0), undefined);
  });

  it('uses default timeout', () => {
    const config = resolveUploadConfig({});
    assert.equal(config.apiTimeout, DEFAULT_UPLOAD_TIMEOUT_MS);
  });
});
