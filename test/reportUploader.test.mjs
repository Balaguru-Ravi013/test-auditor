import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  uploadReportFromFile,
  mapHttpStatusToMessage,
  mapNetworkErrorToMessage,
} from '../dist/reportUploader.js';

function withMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        handler(
          {
            method: req.method,
            headers: req.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          },
          res
        );
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind mock server');
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/api/reports`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
  });
}

function writeTempJsonReport(content) {
  const filePath = path.join(os.tmpdir(), `test-auditor-report-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');
  return filePath;
}

describe('reportUploader', () => {
  it('wraps audit JSON in reportJson and sends x-api-key header', async () => {
    const report = { staticIssues: [], quality: { score: 87 } };
    const reportPath = writeTempJsonReport(report);
    const apiKey = 'utc_test_key_123';

    const mock = await withMockServer((req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers['content-type'], 'application/json');
      assert.equal(req.headers['x-api-key'], apiKey);

      const body = JSON.parse(req.body);
      assert.equal(typeof body.reportId, 'string');
      assert.match(body.reportId, /^[0-9a-f-]{36}$/i);
      assert.equal(typeof body.generatedAt, 'string');
      assert.doesNotThrow(() => new Date(body.generatedAt).toISOString());
      assert.deepEqual(body.reportJson, report);
      assert.equal(body.staticIssues, undefined);
      assert.doesNotMatch(req.body, /utc_test_key_123/);

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          reportId: body.reportId,
          projectId: 'proj_456',
          projectName: 'Demo Project',
          message: 'Report uploaded successfully',
        })
      );
    });

    const result = await uploadReportFromFile(
      { apiUrl: mock.url, apiKey, timeout: 10_000 },
      reportPath
    );

    await mock.close();
    fs.unlinkSync(reportPath);

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(typeof result.reportId, 'string');
      assert.equal(result.projectName, 'Demo Project');
    }
  });

  it('includes pipeline metadata when provided', async () => {
    const report = { quality: { score: 90 } };
    const reportPath = writeTempJsonReport(report);
    const pipeline = {
      provider: 'github-actions',
      runId: '12345678',
      commitSha: 'abc123def456',
      branch: 'main',
      triggeredBy: 'push',
    };

    const mock = await withMockServer((req, res) => {
      const body = JSON.parse(req.body);
      assert.deepEqual(body.pipeline, pipeline);
      assert.deepEqual(body.reportJson, report);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: 'ok' }));
    });

    const result = await uploadReportFromFile(
      {
        apiUrl: mock.url,
        apiKey: 'utc_pipeline',
        timeout: 10_000,
        pipeline,
      },
      reportPath
    );

    await mock.close();
    fs.unlinkSync(reportPath);
    assert.equal(result.success, true);
  });

  it('maps authentication failures without exposing the API key', async () => {
    const reportPath = writeTempJsonReport({ ok: true });
    const mock = await withMockServer((_req, res) => {
      res.statusCode = 401;
      res.end(JSON.stringify({ message: 'Invalid API key' }));
    });

    const result = await uploadReportFromFile(
      { apiUrl: mock.url, apiKey: 'utc_invalid', timeout: 10_000 },
      reportPath
    );

    await mock.close();
    fs.unlinkSync(reportPath);

    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.message, /Authentication failed|Invalid API key/);
      assert.doesNotMatch(result.message, /utc_invalid/);
      assert.equal(result.retryable, false);
    }
  });

  it('handles large report payloads', async () => {
    const largeField = 'x'.repeat(2 * 1024 * 1024);
    const reportPath = writeTempJsonReport({ data: largeField });

    const mock = await withMockServer((req, res) => {
      const body = JSON.parse(req.body);
      assert.equal(body.reportJson.data.length, largeField.length);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: 'ok' }));
    });

    const result = await uploadReportFromFile(
      { apiUrl: mock.url, apiKey: 'utc_large_payload', timeout: 30_000 },
      reportPath
    );

    await mock.close();
    fs.unlinkSync(reportPath);
    assert.equal(result.success, true);
  });

  it('maps server and payload errors', () => {
    assert.match(mapHttpStatusToMessage(413, ''), /too large/i);
    assert.match(mapHttpStatusToMessage(403, ''), /permission/i);
    assert.match(mapHttpStatusToMessage(500, ''), /server error/i);
    assert.match(mapHttpStatusToMessage(429, ''), /Rate limited/i);
  });

  it('maps network errors', () => {
    const refused = Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
    assert.match(mapNetworkErrorToMessage(refused), /Unable to connect/i);

    const dns = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    assert.match(mapNetworkErrorToMessage(dns), /resolve/i);

    const timeout = Object.assign(new Error('timeout'), { name: 'AbortError' });
    assert.match(mapNetworkErrorToMessage(timeout), /timed out/i);
  });

  it('retries retryable server failures', async () => {
    const reportPath = writeTempJsonReport({ retry: true });
    let attempts = 0;

    const mock = await withMockServer((_req, res) => {
      attempts += 1;
      if (attempts < 2) {
        res.statusCode = 503;
        res.end('unavailable');
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: 'ok after retry' }));
    });

    const result = await uploadReportFromFile(
      { apiUrl: mock.url, apiKey: 'utc_retry', timeout: 10_000 },
      reportPath
    );

    await mock.close();
    fs.unlinkSync(reportPath);

    assert.equal(attempts, 2);
    assert.equal(result.success, true);
  });
});
