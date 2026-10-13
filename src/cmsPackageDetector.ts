import fs from 'fs';
import path from 'path';
import type { CmsEntry, CmsRegistry } from './cmsRegistry.js';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

function packageNamesForCms(entry: CmsEntry): string[] {
  const names = new Set<string>();
  for (const moduleId of entry.patterns.importModules) {
    if (!moduleId) continue;
    if (moduleId.startsWith('@')) {
      const parts = moduleId.split('/');
      if (parts.length >= 2) {
        names.add(`${parts[0]}/${parts[1]}`);
      } else {
        names.add(moduleId);
      }
      continue;
    }
    names.add(moduleId.split('/')[0]!);
  }
  return Array.from(names);
}

function dependencyKeys(pkg: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const section = pkg[field];
    if (!section || typeof section !== 'object') continue;
    for (const key of Object.keys(section as Record<string, string>)) {
      keys.add(key);
    }
  }
  return keys;
}

function matchesDependency(depKey: string, pattern: string): boolean {
  const key = depKey.toLowerCase();
  const needle = pattern.toLowerCase();
  if (needle.endsWith('/')) {
    return key.startsWith(needle);
  }
  return key === needle || key.startsWith(`${needle}/`);
}

export function detectCmsFromPackageJson(
  projectPath: string,
  registry: CmsRegistry
): CmsEntry[] {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return [];
  }

  const deps = dependencyKeys(pkg);
  const detected: CmsEntry[] = [];

  for (const cms of registry.cms) {
    const patterns = packageNamesForCms(cms);
    const hit = patterns.some((pattern) =>
      Array.from(deps).some((dep) => matchesDependency(dep, pattern))
    );
    if (hit) detected.push(cms);
  }

  return detected.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
