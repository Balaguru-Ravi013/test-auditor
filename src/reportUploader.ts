import { createReadStream } from 'fs';
import { open, stat, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

export interface ReportUploadConfig {
  apiUrl: string;
  apiKey: string;
  timeout?: number;
  verbose?: boolean;
  pipeline?: PipelineMetadata;
}

export interface PipelineMetadata {
  provider?: string;
  runId?: string;
  commitSha?: string;
  branch?: string;
  triggeredBy?: string;
}

export interface ReportUploadPayload {
  reportId: string;
  generatedAt: string;
  reportJson: Record<string, unknown>;
  pipeline?: PipelineMetadata;
}

export interface ReportUploadSuccess {
  success: true;
  reportId?: string;
  projectId?: string;
  projectName?: string;
  message: string;
  status: number;
}

export interface ReportUploadFailure {
  success: false;
  message: string;
  status?: number;
  retryable: boolean;
  retryAfterMs?: number;
}

export type ReportUploadResult = ReportUploadSuccess | ReportUploadFailure;

interface UploadResponseBody {
  success?: boolean;
  reportId?: string;
  projectId?: string;
  projectName?: string;
  message?: string;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const COPY_BUFFER_SIZE = 64 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    const delay = dateMs - Date.now();
    return delay > 0 ? delay : undefined;
  }
  return undefined;
}

/** Detect common CI/CD metadata from environment variables. */
export function resolvePipelineMetadata(): PipelineMetadata | undefined {
  const fields: PipelineMetadata = {};

  if (process.env.GITHUB_ACTIONS === 'true') {
    fields.provider = 'github-actions';
    if (process.env.GITHUB_RUN_ID) fields.runId = process.env.GITHUB_RUN_ID;
    if (process.env.GITHUB_SHA) fields.commitSha = process.env.GITHUB_SHA;
    if (process.env.GITHUB_REF_NAME) fields.branch = process.env.GITHUB_REF_NAME;
    if (process.env.GITHUB_EVENT_NAME) fields.triggeredBy = process.env.GITHUB_EVENT_NAME;
  } else if (process.env.GITLAB_CI === 'true') {
    fields.provider = 'gitlab-ci';
    if (process.env.CI_PIPELINE_ID) fields.runId = process.env.CI_PIPELINE_ID;
    if (process.env.CI_COMMIT_SHA) fields.commitSha = process.env.CI_COMMIT_SHA;
    if (process.env.CI_COMMIT_REF_NAME) fields.branch = process.env.CI_COMMIT_REF_NAME;
    if (process.env.CI_PIPELINE_SOURCE) fields.triggeredBy = process.env.CI_PIPELINE_SOURCE;
  } else if (process.env.JENKINS_URL) {
    fields.provider = 'jenkins';
    if (process.env.BUILD_NUMBER) fields.runId = process.env.BUILD_NUMBER;
    if (process.env.GIT_COMMIT) fields.commitSha = process.env.GIT_COMMIT;
    if (process.env.GIT_BRANCH) fields.branch = process.env.GIT_BRANCH;
  } else if (process.env.TF_BUILD === 'True') {
    fields.provider = 'azure-devops';
    if (process.env.BUILD_BUILDID) fields.runId = process.env.BUILD_BUILDID;
    if (process.env.BUILD_SOURCEVERSION) fields.commitSha = process.env.BUILD_SOURCEVERSION;
    if (process.env.BUILD_SOURCEBRANCHNAME) fields.branch = process.env.BUILD_SOURCEBRANCHNAME;
    if (process.env.BUILD_REASON) fields.triggeredBy = process.env.BUILD_REASON;
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * Build the backend upload envelope by streaming the local audit JSON into
 * reportJson without loading the full report into memory.
 */
export async function createUploadPayloadFile(
  reportFilePath: string,
  pipeline?: PipelineMetadata
): Promise<{ filePath: string; reportId: string }> {
  const reportId = randomUUID();
  const generatedAt = new Date().toISOString();
  const prefix = `{"reportId":"${reportId}","generatedAt":"${generatedAt}","reportJson":`;
  const suffix =
    pipeline && Object.keys(pipeline).length > 0
      ? `,"pipeline":${JSON.stringify(pipeline)}}`
      : '}';

  const reportStats = await stat(reportFilePath);
  if (reportStats.size === 0) {
    throw new Error('The local JSON report is empty.');
  }

  const tempPath = join(
    tmpdir(),
    `test-auditor-upload-${process.pid}-${Date.now()}.json`
  );

  const reportHandle = await open(reportFilePath, 'r');
  const uploadHandle = await open(tempPath, 'w');
  const buffer = Buffer.alloc(COPY_BUFFER_SIZE);

  try {
    const { bytesRead: firstByteCount } = await reportHandle.read(buffer, 0, 1, 0);
    if (firstByteCount !== 1 || buffer[0] !== 0x7b) {
      throw new Error('The local JSON report is malformed.');
    }

    await uploadHandle.write(prefix);

    let position = 0;
    let bytesRead = 0;
    do {
      ({ bytesRead } = await reportHandle.read(buffer, 0, COPY_BUFFER_SIZE, position));
      if (bytesRead > 0) {
        await uploadHandle.write(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
    } while (bytesRead > 0);

    await uploadHandle.write(suffix);
  } finally {
    await reportHandle.close();
    await uploadHandle.close();
  }

  return { filePath: tempPath, reportId };
}

export function mapHttpStatusToMessage(status: number, bodyText: string): string {
  const trimmed = bodyText.trim();
  const fromBody = (() => {
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed) as {
        message?: string | string[];
        error?: string;
      };
      if (Array.isArray(parsed.message)) {
        return parsed.message.join(', ');
      }
      return parsed.message || parsed.error;
    } catch {
      return trimmed.length <= 300 ? trimmed : undefined;
    }
  })();

  switch (status) {
    case 400:
      return fromBody || 'The report was rejected as invalid (HTTP 400).';
    case 401:
      return fromBody || 'Authentication failed. Check that your project API key is correct.';
    case 403:
      return fromBody || 'The API key does not have permission to upload reports for this project.';
    case 413:
      return (
        fromBody ||
        'The report payload is too large for the server (HTTP 413). Contact your administrator to increase the upload limit.'
      );
    case 429:
      return fromBody || 'Rate limited by the report server (HTTP 429). Try again later.';
    default:
      if (status >= 500) {
        return fromBody || `Report server error (HTTP ${status}). Try again later.`;
      }
      return fromBody || `Report upload failed (HTTP ${status}).`;
  }
}

export function mapNetworkErrorToMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to upload the report due to an unexpected network error.';
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ECONNREFUSED') {
    return 'Unable to connect to the report server. Check TEST_AUDITOR_API_URL and that the server is running.';
  }
  if (code === 'ENOTFOUND') {
    return 'Unable to resolve the report server hostname. Check TEST_AUDITOR_API_URL.';
  }
  if (error.name === 'AbortError' || code === 'ETIMEDOUT') {
    return 'Report upload timed out. For large reports, increase TEST_AUDITOR_API_TIMEOUT.';
  }

  return 'Unable to upload the report due to a network error.';
}

async function uploadOnce(
  config: ReportUploadConfig,
  uploadFilePath: string,
  clientReportId: string
): Promise<ReportUploadResult> {
  const timeoutMs = config.timeout ?? 5 * 60 * 1000;
  const fileStats = await stat(uploadFilePath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'Content-Length': String(fileStats.size),
      },
      body: createReadStream(uploadFilePath),
      signal: controller.signal,
      duplex: 'half',
    } as RequestInit);

    const bodyText = await response.text();

    if (!response.ok) {
      const retryAfterMs =
        response.status === 429
          ? parseRetryAfterMs(response.headers.get('retry-after'))
          : undefined;
      return {
        success: false,
        message: mapHttpStatusToMessage(response.status, bodyText),
        status: response.status,
        retryable: RETRYABLE_STATUSES.has(response.status),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };
    }

    let parsed: UploadResponseBody = {};
    if (bodyText.trim()) {
      try {
        parsed = JSON.parse(bodyText) as UploadResponseBody;
      } catch {
        parsed = {};
      }
    }

    return {
      success: true,
      status: response.status,
      message: parsed.message || 'Report uploaded successfully',
      reportId: parsed.reportId ?? clientReportId,
      ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
      ...(parsed.projectName ? { projectName: parsed.projectName } : {}),
    };
  } catch (error) {
    return {
      success: false,
      message: mapNetworkErrorToMessage(error),
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload a local audit JSON file to the backend API.
 * Wraps the audit data in reportJson per the backend contract.
 */
export async function uploadReportFromFile(
  config: ReportUploadConfig,
  reportFilePath: string
): Promise<ReportUploadResult> {
  const pipeline = config.pipeline ?? resolvePipelineMetadata();
  let uploadFilePath: string | undefined;
  let clientReportId = '';

  try {
    const payload = await createUploadPayloadFile(reportFilePath, pipeline);
    uploadFilePath = payload.filePath;
    clientReportId = payload.reportId;

    let attempt = 0;
    let lastResult: ReportUploadResult = {
      success: false,
      message: 'Report upload failed.',
      retryable: false,
    };

    while (attempt <= MAX_RETRIES) {
      const result = await uploadOnce(config, uploadFilePath, clientReportId);
      if (result.success || !result.retryable || attempt === MAX_RETRIES) {
        return result;
      }

      lastResult = result;
      attempt += 1;

      const backoffMs =
        result.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** (attempt - 1));
      if (config.verbose) {
        console.log(
          `  Retrying report upload in ${backoffMs}ms (attempt ${attempt}/${MAX_RETRIES})...`
        );
      }
      await sleep(backoffMs);
    }

    return lastResult;
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to prepare the report for upload.',
      retryable: false,
    };
  } finally {
    if (uploadFilePath) {
      await unlink(uploadFilePath).catch(() => undefined);
    }
  }
}
