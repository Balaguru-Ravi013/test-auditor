import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findProjectRoot } from '../dist/projectRoot.js';

describe('projectRoot', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'test-auditor-root-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('finds config in the current directory', () => {
    const configPath = path.join(tempRoot, '.test-auditor.json');
    fs.writeFileSync(configPath, '{"apiUrl":"https://example.com/api/reports"}\n');

    const result = findProjectRoot(tempRoot);
    assert.ok(result);
    assert.equal(result.root, tempRoot);
    assert.equal(result.configFilePath, configPath);
  });

  it('finds config in a parent directory (monorepo)', () => {
    const configPath = path.join(tempRoot, '.test-auditor.json');
    fs.writeFileSync(configPath, '{"apiUrl":"https://example.com/api/reports"}\n');

    const nested = path.join(tempRoot, 'apps', 'web');
    fs.mkdirSync(nested, { recursive: true });

    const result = findProjectRoot(nested);
    assert.ok(result);
    assert.equal(result.root, tempRoot);
    assert.equal(result.configFilePath, configPath);
  });

  it('returns null when no config exists', () => {
    const nested = path.join(tempRoot, 'apps', 'web');
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(findProjectRoot(nested), null);
  });
});
