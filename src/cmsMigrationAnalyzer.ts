// src/cmsMigrationAnalyzer.ts
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { CmsEntry } from './cmsRegistry.js';

const traverse =
  typeof _traverse === 'function'
    ? _traverse
    : ((_traverse as unknown as { default: typeof _traverse }).default);

export type CmsIssueCategory = 'legacy' | 'gap' | 'progress';

export interface CmsMigrationIssue {
  file: string;
  line: number;
  rule: string;
  category: CmsIssueCategory;
  message: string;
  severity: 'error' | 'warning' | 'info';
  cmsId: string;
}

function moduleMatches(moduleId: string, patterns: string[]): boolean {
  const id = moduleId.toLowerCase();
  for (const p of patterns) {
    const needle = p.toLowerCase();
    if (!needle) continue;
    if (needle.endsWith('/')) {
      if (id === needle.slice(0, -1) || id.startsWith(needle)) return true;
    } else if (id === needle || id.startsWith(needle + '/')) {
      return true;
    }
  }
  return false;
}

function stringMatches(value: string, patterns: string[]): string | null {
  for (const p of patterns) {
    if (p && value.includes(p)) return p;
  }
  return null;
}

/** Minimal glob: ** / * and * segments — enough for fixturePaths patterns. */
function pathMatchesGlob(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/');
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp('^' + escaped + '$', 'i').test(normalized);
}

function fixturePathHit(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((p) => pathMatchesGlob(normalized, p));
}

interface FileScan {
  issues: CmsMigrationIssue[];
  hasLegacy: boolean;
  hasTarget: boolean;
}

function scanFile(
  filePath: string,
  source: CmsEntry,
  target: CmsEntry
): FileScan {
  const issues: CmsMigrationIssue[] = [];
  let hasLegacy = false;
  let hasTarget = false;

  if (fixturePathHit(filePath, source.patterns.fixturePaths)) {
    hasLegacy = true;
    issues.push({
      file: filePath,
      line: 1,
      rule: 'cms-legacy-fixture',
      category: 'legacy',
      message: `Test path matches ${source.displayName} fixture pattern — update fixtures for ${target.displayName}`,
      severity: 'warning',
      cmsId: source.id,
    });
  }

  let code: string;
  try {
    code = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { issues, hasLegacy, hasTarget };
  }

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    issues.push({
      file: filePath,
      line: 1,
      rule: 'cms-parse-error',
      category: 'gap',
      message: `Could not parse file for CMS migration scan (${source.displayName} → ${target.displayName})`,
      severity: 'info',
      cmsId: source.id,
    });
    return { issues, hasLegacy, hasTarget };
  }

  const noteTarget = (moduleId: string) => {
    if (
      moduleMatches(moduleId, target.patterns.importModules) ||
      moduleMatches(moduleId, target.patterns.mockModules)
    ) {
      hasTarget = true;
    }
  };

  const noteMock = (moduleId: string, line: number) => {
    if (moduleMatches(moduleId, source.patterns.mockModules)) {
      hasLegacy = true;
      issues.push({
        file: filePath,
        line,
        rule: 'cms-legacy-mock',
        category: 'legacy',
        message: `Mock of legacy ${source.displayName} module "${moduleId}" — replace with ${target.displayName} mocks`,
        severity: 'warning',
        cmsId: source.id,
      });
    }
    noteTarget(moduleId);
  };

  const noteImport = (moduleId: string, line: number) => {
    if (moduleMatches(moduleId, source.patterns.importModules)) {
      hasLegacy = true;
      issues.push({
        file: filePath,
        line,
        rule: 'cms-legacy-import',
        category: 'legacy',
        message: `Import of legacy ${source.displayName} module "${moduleId}" — migrate to ${target.displayName}`,
        severity: 'warning',
        cmsId: source.id,
      });
    }
    noteTarget(moduleId);
  };

  traverse(ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value;
      if (typeof src === 'string') {
        noteImport(src, p.node.loc?.start.line ?? 1);
      }
    },
    CallExpression(p) {
      const callee = p.node.callee;
      const args = p.node.arguments;

      // require('...')
      if (t.isIdentifier(callee) && callee.name === 'require' && args[0]) {
        if (t.isStringLiteral(args[0])) {
          noteImport(args[0].value, p.node.loc?.start.line ?? 1);
        }
      }

      // jest.mock / vi.mock / jest.doMock / jest.unstable_mockModule
      let mockName: string | null = null;
      if (t.isMemberExpression(callee) && !callee.computed) {
        const obj = callee.object;
        const prop = callee.property;
        if (
          t.isIdentifier(obj) &&
          (obj.name === 'jest' || obj.name === 'vi') &&
          t.isIdentifier(prop) &&
          (prop.name === 'mock' ||
            prop.name === 'doMock' ||
            prop.name === 'unstable_mockModule' ||
            prop.name === 'unmock')
        ) {
          mockName = prop.name;
        }
      }
      if (mockName && args[0] && t.isStringLiteral(args[0])) {
        noteMock(args[0].value, p.node.loc?.start.line ?? 1);
      }
    },
    StringLiteral(p) {
      // Skip import/require/mock string nodes already handled via parent
      const parent = p.parent;
      if (t.isImportDeclaration(parent) || t.isExportNamedDeclaration(parent)) return;
      if (
        t.isCallExpression(parent) &&
        parent.arguments[0] === p.node
      ) {
        return;
      }
      const hit = stringMatches(p.node.value, source.patterns.stringLiterals);
      if (hit) {
        hasLegacy = true;
        issues.push({
          file: filePath,
          line: p.node.loc?.start.line ?? 1,
          rule: 'cms-legacy-string',
          category: 'legacy',
          message: `String literal matches ${source.displayName} pattern "${hit}" — review for ${target.displayName}`,
          severity: 'info',
          cmsId: source.id,
        });
      }
      if (stringMatches(p.node.value, target.patterns.stringLiterals)) {
        hasTarget = true;
      }
    },
    TemplateLiteral(p) {
      const cooked = p.node.quasis.map((q) => q.value.cooked ?? '').join('');
      if (!cooked) return;
      const hit = stringMatches(cooked, source.patterns.stringLiterals);
      if (hit) {
        hasLegacy = true;
        issues.push({
          file: filePath,
          line: p.node.loc?.start.line ?? 1,
          rule: 'cms-legacy-string',
          category: 'legacy',
          message: `Template literal matches ${source.displayName} pattern "${hit}" — review for ${target.displayName}`,
          severity: 'info',
          cmsId: source.id,
        });
      }
      if (stringMatches(cooked, target.patterns.stringLiterals)) {
        hasTarget = true;
      }
    },
  });

  if (hasLegacy && !hasTarget) {
    issues.push({
      file: filePath,
      line: 1,
      rule: 'cms-target-absent',
      category: 'gap',
      message: `File references ${source.displayName} but has no ${target.displayName} imports/mocks — migration incomplete`,
      severity: 'info',
      cmsId: target.id,
    });
  }

  if (hasLegacy && hasTarget) {
    issues.push({
      file: filePath,
      line: 1,
      rule: 'cms-migration-progress',
      category: 'progress',
      message: `File references both ${source.displayName} and ${target.displayName} — partial migration in progress`,
      severity: 'info',
      cmsId: target.id,
    });
  }

  return { issues, hasLegacy, hasTarget };
}

/**
 * Scan test files for source-CMS leftovers and target-CMS progress signals.
 */
export function analyzeCmsMigration(
  files: string[],
  source: CmsEntry,
  target: CmsEntry
): CmsMigrationIssue[] {
  const all: CmsMigrationIssue[] = [];
  for (const file of files) {
    const { issues } = scanFile(path.resolve(file), source, target);
    all.push(...issues);
  }
  return all;
}
