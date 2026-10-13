import { confirm, select, checkbox } from '@inquirer/prompts';
import type { CmsEntry, CmsRegistry } from './cmsRegistry.js';
import { resolveCmsPair } from './cmsRegistry.js';
import { detectCmsFromPackageJson } from './cmsPackageDetector.js';

export type CmsAuditMode = 'single' | 'migration' | 'multi';

export interface CmsAuditPlan {
  mode: CmsAuditMode;
  /** CMS packages to run readiness checks against */
  checkCms: CmsEntry[];
  /** Present when mode === 'migration' */
  migration?: { from: CmsEntry; to: CmsEntry };
}

export interface CmsSelectionOptions {
  projectPath: string;
  registry: CmsRegistry;
  cmsFrom?: string;
  cmsTo?: string;
  interactive: boolean;
  configCmsReadiness?: boolean;
}

function cmsChoices(cmsList: CmsEntry[]) {
  return cmsList.map((c) => ({
    name: `${c.displayName} (${c.id})`,
    value: c.id,
  }));
}

export async function resolveCmsAuditPlan(
  options: CmsSelectionOptions
): Promise<CmsAuditPlan | null> {
  const { projectPath, registry, cmsFrom, cmsTo, interactive, configCmsReadiness } = options;

  if (cmsFrom && cmsTo) {
    const pair = resolveCmsPair(registry, cmsFrom, cmsTo);
    return {
      mode: 'migration',
      checkCms: [pair.from, pair.to],
      migration: pair,
    };
  }

  if (cmsFrom || cmsTo) {
    throw new Error('Both --cms-from and --cms-to are required together for migration checks.');
  }

  let includeCms = configCmsReadiness ?? false;
  if (interactive) {
    includeCms = await confirm({
      message: 'Include CMS readiness check in this audit?',
      default: false,
    });
  }

  if (!includeCms) {
    return null;
  }

  const detected = detectCmsFromPackageJson(projectPath, registry);

  if (detected.length === 0) {
    if (interactive) {
      console.log('  No CMS packages were detected in package.json. Skipping CMS readiness check.');
    }
    return null;
  }

  if (detected.length === 1) {
    return { mode: 'single', checkCms: detected };
  }

  if (!interactive) {
    return { mode: 'multi', checkCms: detected };
  }

  const scenario = await select({
    message: `Multiple CMS packages detected (${detected.map((c) => c.displayName).join(', ')}). How are they used?`,
    choices: [
      {
        name: 'One CMS is currently used and another is being adopted',
        value: 'migration',
      },
      {
        name: 'Multiple CMSs are used together in this project',
        value: 'multi',
      },
      {
        name: 'Choose which CMS packages to include in the readiness check',
        value: 'pick',
      },
    ],
  });

  if (scenario === 'migration') {
    const fromId = await select({
      message: 'CMS currently used',
      choices: cmsChoices(detected),
    });
    const toChoices = cmsChoices(detected).filter((c) => c.value !== fromId);
    const toId = await select({
      message: 'CMS being adopted',
      choices: toChoices,
    });
    const pair = resolveCmsPair(registry, fromId, toId);
    return {
      mode: 'migration',
      checkCms: [pair.from, pair.to],
      migration: pair,
    };
  }

  const pickIds = await checkbox({
    message: 'CMS packages to check',
    choices: cmsChoices(detected),
    validate: (value) => (value.length > 0 ? true : 'Select at least one CMS'),
  });

  const picked = pickIds
    .map((id) => detected.find((c) => c.id === id))
    .filter((c): c is CmsEntry => Boolean(c));

  return {
    mode: scenario === 'multi' ? 'multi' : 'multi',
    checkCms: picked,
  };
}
