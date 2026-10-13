/** @deprecated Import from testAuditorConfig.js — kept for backward compatibility */
export {
  DEFAULT_API_URL,
  DEFAULT_UPLOAD_TIMEOUT_MS,
  validateApiUrl,
  parseTimeoutMs,
  readConfigFile,
  resolveUploadConfig,
  getMissingApiKeyMessage,
} from './testAuditorConfig.js';

export type {
  TestAuditorConfig as UploadConfigFile,
  ConfigSources as UploadConfigSources,
  ResolvedUploadConfig,
  ScheduleConfig,
} from './testAuditorConfig.js';
