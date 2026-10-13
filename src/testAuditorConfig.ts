import fs from 'fs';

export const DEFAULT_API_URL = 'http://localhost:3000/api/reports';
export const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export interface ScheduleConfig {
  enabled?: boolean;
  frequency?: 'daily' | 'weekly';
  time?: string;
  day?: string;
  timezone?: string;
}

export interface TestAuditorConfig {
  apiUrl?: string;
  apiKey?: string;
  apiTimeout?: number;
  upload?: boolean;
  cmsReadiness?: boolean;
  schedule?: ScheduleConfig;
}

export interface ResolvedUploadConfig {
  apiKey?: string;
  apiUrl: string;
  apiTimeout: number;
  uploadEnabled: boolean;
  cmsReadiness: boolean;
  configFilePath?: string;
  schedule?: ScheduleConfig;
}

export interface ConfigSources {
  apiKey?: string;
  apiUrl?: string;
  apiTimeout?: number;
  upload?: boolean;
  cmsReadiness?: boolean;
  configFilePath?: string;
}

export function validateApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseTimeoutMs(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validateScheduleConfig(schedule: ScheduleConfig | undefined): string | null {
  if (!schedule) return null;
  if (schedule.enabled === false) return null;

  if (schedule.frequency && !['daily', 'weekly'].includes(schedule.frequency)) {
    return 'schedule.frequency must be "daily" or "weekly".';
  }
  if (schedule.time && !TIME_PATTERN.test(schedule.time)) {
    return 'schedule.time must use 24-hour HH:MM format (e.g. "09:00").';
  }
  if (schedule.frequency === 'weekly' && schedule.day && !/^[a-z]+$/i.test(schedule.day)) {
    return 'schedule.day must be a weekday name when frequency is "weekly".';
  }
  return null;
}

export function validateConfigFile(config: TestAuditorConfig): string | null {
  if (config.apiUrl !== undefined && config.apiUrl !== '' && !validateApiUrl(config.apiUrl)) {
    return 'apiUrl must be a valid http:// or https:// URL in .test-auditor.json.';
  }
  if (config.apiKey !== undefined && config.apiKey !== '' && !config.apiKey.trim()) {
    return 'apiKey in .test-auditor.json must be a non-empty string.';
  }
  if (config.apiTimeout !== undefined && parseTimeoutMs(config.apiTimeout) === undefined) {
    return 'apiTimeout in .test-auditor.json must be a positive number of milliseconds.';
  }
  return validateScheduleConfig(config.schedule);
}

export function readConfigFile(configFilePath: string): TestAuditorConfig {
  const raw = fs.readFileSync(configFilePath, 'utf-8');
  let parsed: TestAuditorConfig;
  try {
    parsed = JSON.parse(raw) as TestAuditorConfig;
  } catch {
    throw new Error(`Invalid JSON in ${configFilePath}.`);
  }

  const validationError = validateConfigFile(parsed);
  if (validationError) {
    throw new Error(validationError);
  }

  return parsed;
}

/**
 * Resolve configuration with precedence:
 * CLI → environment variables → .test-auditor.json → defaults
 */
export function resolveUploadConfig(sources: ConfigSources): ResolvedUploadConfig {
  const fileConfig = sources.configFilePath ? readConfigFile(sources.configFilePath) : {};

  const apiKey =
    sources.apiKey?.trim() ||
    fileConfig.apiKey?.trim() ||
    process.env.TEST_AUDITOR_API_KEY?.trim() ||
    undefined;

  const apiUrl =
    sources.apiUrl?.trim() ||
    process.env.TEST_AUDITOR_API_URL?.trim() ||
    fileConfig.apiUrl?.trim() ||
    DEFAULT_API_URL;

  const apiTimeout =
    sources.apiTimeout ??
    parseTimeoutMs(process.env.TEST_AUDITOR_API_TIMEOUT) ??
    fileConfig.apiTimeout ??
    DEFAULT_UPLOAD_TIMEOUT_MS;

  const uploadEnabled = sources.upload ?? fileConfig.upload ?? Boolean(apiKey);
  const cmsReadiness = sources.cmsReadiness ?? fileConfig.cmsReadiness ?? false;

  return {
    ...(apiKey ? { apiKey } : {}),
    apiUrl,
    apiTimeout,
    uploadEnabled,
    cmsReadiness,
    ...(fileConfig.schedule ? { schedule: fileConfig.schedule } : {}),
    ...(sources.configFilePath ? { configFilePath: sources.configFilePath } : {}),
  };
}

export function getMissingApiKeyMessage(): string {
  return (
    'Test Auditor API key is not configured.\n' +
    'Add "apiKey" to .test-auditor.json or provide --api-key.'
  );
}
