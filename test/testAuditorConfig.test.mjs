import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateConfigFile,
  validateScheduleConfig,
  getMissingApiKeyMessage,
} from '../dist/testAuditorConfig.js';

describe('testAuditorConfig', () => {
  it('validates apiUrl and schedule fields', () => {
    assert.equal(
      validateConfigFile({ apiUrl: 'not-a-url' }),
      'apiUrl must be a valid http:// or https:// URL in .test-auditor.json.'
    );
    assert.equal(validateConfigFile({ apiUrl: 'https://api.example.com/api/reports' }), null);
    assert.equal(validateScheduleConfig({ enabled: true, time: '25:99' }), 'schedule.time must use 24-hour HH:MM format (e.g. "09:00").');
    assert.equal(
      validateScheduleConfig({ enabled: true, frequency: 'daily', time: '09:00', timezone: 'UTC' }),
      null
    );
  });

  it('mentions .test-auditor.json in missing API key message', () => {
    const message = getMissingApiKeyMessage();
    assert.match(message, /\.test-auditor\.json/);
    assert.doesNotMatch(message, /\.env/);
  });
});
