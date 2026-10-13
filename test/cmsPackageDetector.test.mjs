import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectCmsFromPackageJson } from '../dist/cmsPackageDetector.js';
import { loadCmsRegistry } from '../dist/cmsRegistry.js';

describe('cmsPackageDetector', () => {
  it('detects a single CMS from package.json dependencies', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-detect-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        dependencies: {
          contentful: '^10.0.0',
        },
      })
    );

    const registry = loadCmsRegistry();
    const detected = detectCmsFromPackageJson(root, registry);
    assert.equal(detected.length, 1);
    assert.equal(detected[0].id, 'contentful');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects multiple CMS packages', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-detect-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        dependencies: {
          contentful: '^10.0.0',
          sanity: '^3.0.0',
        },
      })
    );

    const registry = loadCmsRegistry();
    const detected = detectCmsFromPackageJson(root, registry);
    assert.ok(detected.length >= 2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns empty when no CMS dependencies exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-detect-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } })
    );

    const registry = loadCmsRegistry();
    const detected = detectCmsFromPackageJson(root, registry);
    assert.equal(detected.length, 0);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
