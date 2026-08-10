// src/cmsRegistry.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface CmsPatterns {
  importModules: string[];
  stringLiterals: string[];
  mockModules: string[];
  fixturePaths: string[];
}

export interface CmsEntry {
  id: string;
  displayName: string;
  patterns: CmsPatterns;
}

export interface CmsRegistry {
  cms: CmsEntry[];
}

export interface CmsOption {
  id: string;
  displayName: string;
}

function emptyPatterns(): CmsPatterns {
  return {
    importModules: [],
    stringLiterals: [],
    mockModules: [],
    fixturePaths: [],
  };
}

function normalizeEntry(raw: Partial<CmsEntry> & { id?: string }): CmsEntry | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const patterns = raw.patterns ?? emptyPatterns();
  return {
    id: raw.id.trim().toLowerCase(),
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : raw.id.trim(),
    patterns: {
      importModules: Array.isArray(patterns.importModules)
        ? patterns.importModules.filter((s) => typeof s === 'string')
        : [],
      stringLiterals: Array.isArray(patterns.stringLiterals)
        ? patterns.stringLiterals.filter((s) => typeof s === 'string')
        : [],
      mockModules: Array.isArray(patterns.mockModules)
        ? patterns.mockModules.filter((s) => typeof s === 'string')
        : [],
      fixturePaths: Array.isArray(patterns.fixturePaths)
        ? patterns.fixturePaths.filter((s) => typeof s === 'string')
        : [],
    },
  };
}

function parseRegistryJson(text: string, label: string): CmsRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in CMS registry (${label})`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as CmsRegistry).cms)) {
    throw new Error(`CMS registry must have a "cms" array (${label})`);
  }
  const cms: CmsEntry[] = [];
  for (const item of (parsed as CmsRegistry).cms) {
    const entry = normalizeEntry(item);
    if (entry) cms.push(entry);
  }
  if (cms.length === 0) {
    throw new Error(`CMS registry has no valid entries (${label})`);
  }
  return { cms };
}

function defaultRegistryPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Prefer package-root config/ (dev + published), then dist/config/ sibling.
  const candidates = [
    path.resolve(here, '../config/cms-registry.json'),
    path.resolve(here, 'config/cms-registry.json'),
    path.resolve(here, '../../config/cms-registry.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]!;
}

function mergeRegistries(base: CmsRegistry, override: CmsRegistry): CmsRegistry {
  const byId = new Map<string, CmsEntry>();
  for (const e of base.cms) byId.set(e.id, e);
  for (const e of override.cms) byId.set(e.id, e);
  return { cms: Array.from(byId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)) };
}

/**
 * Load the built-in CMS registry, optionally merging a user-supplied config.
 * User entries with the same `id` replace built-in ones.
 */
export function loadCmsRegistry(customPath?: string): CmsRegistry {
  const builtInPath = defaultRegistryPath();
  if (!fs.existsSync(builtInPath)) {
    throw new Error(`Built-in CMS registry not found at ${builtInPath}`);
  }
  let registry = parseRegistryJson(fs.readFileSync(builtInPath, 'utf-8'), builtInPath);

  if (customPath) {
    const resolved = path.resolve(customPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`CMS config not found: ${resolved}`);
    }
    const custom = parseRegistryJson(fs.readFileSync(resolved, 'utf-8'), resolved);
    registry = mergeRegistries(registry, custom);
  }

  return registry;
}

export function listCmsOptions(registry: CmsRegistry): CmsOption[] {
  return registry.cms.map((c) => ({ id: c.id, displayName: c.displayName }));
}

export function getCmsEntry(registry: CmsRegistry, id: string): CmsEntry | undefined {
  const needle = id.trim().toLowerCase();
  return registry.cms.find((c) => c.id === needle);
}

export function resolveCmsPair(
  registry: CmsRegistry,
  fromId: string,
  toId: string
): { from: CmsEntry; to: CmsEntry } {
  const from = getCmsEntry(registry, fromId);
  const to = getCmsEntry(registry, toId);
  if (!from) {
    throw new Error(
      `Unknown source CMS "${fromId}". Known: ${registry.cms.map((c) => c.id).join(', ')}`
    );
  }
  if (!to) {
    throw new Error(
      `Unknown target CMS "${toId}". Known: ${registry.cms.map((c) => c.id).join(', ')}`
    );
  }
  if (from.id === to.id) {
    throw new Error('Source and target CMS must be different');
  }
  return { from, to };
}
