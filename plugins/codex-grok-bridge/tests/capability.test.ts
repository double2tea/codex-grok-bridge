import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type CapabilityToolRequest,
  parseCapabilityRequest,
  parseStructuredRunSummary,
  runCapabilityTool,
  validateCapabilityOutput,
  validateCapabilityWithNativeRecovery
} from '../src/capability.js';
import type { RunManager } from '../src/run-manager.js';
import type { StructuredRunResult } from '../src/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('parseCapabilityRequest', () => {
  it('keeps grok_search read-only and rejects disabled web search', async () => {
    const workspaceRoot = await makeTempDir('grok-capability-workspace-');

    const request = parseCapabilityRequest({ query: 'latest grok build', workspaceRoot }, 'search');

    expect(request.runRequest.allowWrites).toBe(false);
    expect(request.runRequest.mode).toBe('search');
    expect(request.runRequest.promptOverride).toContain('native search/web tools');
    expect(() =>
      parseCapabilityRequest(
        { query: 'latest grok build', workspaceRoot, disableWebSearch: true },
        'search'
      )
    ).toThrow('grok_search cannot disable web search');
  });

  it('creates image output directories inside the workspace', async () => {
    const workspaceRoot = await makeTempDir('grok-capability-workspace-');

    const request = parseCapabilityRequest(
      { prompt: 'a clean product render', workspaceRoot, outputDir: 'media/images' },
      'image'
    );
    const outputDir = request.outputDir ?? '';

    expect(outputDir).toBe(fsSync.realpathSync.native(path.join(workspaceRoot, 'media/images')));
    await expect(fs.stat(outputDir)).resolves.toBeTruthy();
    expect(request.runRequest.allowWrites).toBe(true);
  });
});

describe('validateCapabilityOutput', () => {
  it('requires sourced search results', () => {
    expect(() =>
      validateCapabilityOutput('search', JSON.stringify({ status: 'success', answer: 'ok' }))
    ).toThrow('requires at least one source');

    const result = validateCapabilityOutput(
      'search',
      JSON.stringify({
        status: 'success',
        answer: 'ok',
        sources: [{ title: 'Example', url: 'https://example.com', publishedAt: 'unknown' }]
      })
    );

    expect(result.result.status).toBe('success');
  });

  it('validates generated image artifacts under outputDir', async () => {
    const outputDir = await makeTempDir('grok-capability-output-');
    const artifactPath = path.join(outputDir, 'asset.png');
    await fs.writeFile(artifactPath, 'png-bytes');

    const result = validateCapabilityOutput(
      'image',
      JSON.stringify({
        status: 'success',
        artifacts: [{ kind: 'image', path: artifactPath, mimeType: 'image/png' }]
      }),
      outputDir
    );

    expect(result.artifacts?.[0]?.path).toBe(fsSync.realpathSync.native(artifactPath));
    expect(result.artifacts?.[0]?.sizeBytes).toBeGreaterThan(0);
  });

  it('rejects generated artifacts outside outputDir', async () => {
    const outputDir = await makeTempDir('grok-capability-output-');
    const outsideDir = await makeTempDir('grok-capability-outside-');
    const artifactPath = path.join(outsideDir, 'asset.png');
    await fs.writeFile(artifactPath, 'png-bytes');

    expect(() =>
      validateCapabilityOutput(
        'image',
        JSON.stringify({
          status: 'success',
          artifacts: [{ kind: 'image', path: artifactPath }]
        }),
        outputDir
      )
    ).toThrow('artifact path must stay inside workspaceRoot');
  });

  it('treats unavailable native Grok tools as errors', () => {
    expect(() =>
      validateCapabilityOutput(
        'video',
        JSON.stringify({ status: 'unavailable', reason: 'NATIVE_VIDEO_TOOL_UNAVAILABLE' }),
        '/tmp'
      )
    ).toThrow('native video capability is unavailable');
  });
});

describe('parseStructuredRunSummary', () => {
  it('parses structured run JSON even when grok output contains markdown fences', () => {
    const structured = {
      type: 'grok_delegate_run',
      version: 1,
      runId: 'grok_run_test',
      mode: 'search',
      status: 'success',
      workspaceRoot: '/tmp/workspace',
      cwd: '/tmp/workspace',
      allowWrites: false,
      changedFiles: [],
      diffStat: null,
      gitAuditAvailable: false,
      workspaceWasDirty: false,
      testsObserved: [],
      safety: 'ok',
      grokOutput: '```json\\n{"status":"success"}\\n```',
      startedAt: new Date(0).toISOString(),
      completedAt: new Date(1).toISOString(),
      durationMs: 1
    };
    const summary = ['Structured Result', '```json', JSON.stringify(structured), '```'].join('\n');

    expect(parseStructuredRunSummary(summary).grokOutput).toContain('```json');
  });
});

describe('validateCapabilityWithNativeRecovery', () => {
  it('recovers generated image artifacts from the Grok native session directory', async () => {
    const workspaceRoot = await makeTempDir('grok-capability-workspace-');
    const outputDir = await makeTempDir('grok-capability-output-');
    const nativeSessionId = 'sess_recover_image';
    const mediaDir = path.join(
      os.homedir(),
      '.grok',
      'sessions',
      encodeURIComponent(workspaceRoot),
      nativeSessionId,
      'images'
    );
    tempDirs.push(path.dirname(path.dirname(mediaDir)));
    await fs.mkdir(mediaDir, { recursive: true });
    const artifactPath = path.join(mediaDir, '1.jpg');
    const now = Date.now();
    await fs.writeFile(artifactPath, 'jpeg-bytes');
    await fs.utimes(artifactPath, new Date(now), new Date(now));

    const result = validateCapabilityWithNativeRecovery(
      'image',
      makeStructuredRun({
        workspaceRoot,
        nativeSessionId,
        startedAt: new Date(now - 1000).toISOString(),
        completedAt: new Date(now + 1000).toISOString(),
        grokOutput: JSON.stringify({
          status: 'unavailable',
          reason: 'NATIVE_IMAGE_TOOL_UNAVAILABLE'
        })
      }),
      makeCapabilityRequest(workspaceRoot, outputDir)
    );

    expect(result.result.status).toBe('success');
    expect(result.recoveredArtifacts).toBe(true);
    expect(result.artifacts?.[0]?.path).toBe(
      fsSync.realpathSync.native(path.join(outputDir, `grok-${nativeSessionId}.jpg`))
    );
    await expect(fs.stat(result.artifacts?.[0]?.path ?? '')).resolves.toBeTruthy();
  });

  it('does not recover old artifacts from a reused Grok native session', async () => {
    const workspaceRoot = await makeTempDir('grok-capability-workspace-');
    const outputDir = await makeTempDir('grok-capability-output-');
    const nativeSessionId = 'sess_old_image';
    const mediaDir = nativeMediaDir(workspaceRoot, nativeSessionId, 'images');
    tempDirs.push(path.dirname(path.dirname(mediaDir)));
    await fs.mkdir(mediaDir, { recursive: true });
    const artifactPath = path.join(mediaDir, 'old.png');
    const now = Date.now();
    await fs.writeFile(artifactPath, 'png-bytes');
    await fs.utimes(artifactPath, new Date(now - 60000), new Date(now - 60000));

    expect(() =>
      validateCapabilityWithNativeRecovery(
        'image',
        makeStructuredRun({
          workspaceRoot,
          nativeSessionId,
          startedAt: new Date(now - 1000).toISOString(),
          completedAt: new Date(now + 1000).toISOString(),
          grokOutput: JSON.stringify({
            status: 'unavailable',
            reason: 'NATIVE_IMAGE_TOOL_UNAVAILABLE'
          })
        }),
        makeCapabilityRequest(workspaceRoot, outputDir)
      )
    ).toThrow('native image capability is unavailable');
  });

  it('writes recovered artifacts into the run log capability audit', async () => {
    const workspaceRoot = await makeTempDir('grok-capability-workspace-');
    const outputDir = path.join(workspaceRoot, 'generated');
    const nativeSessionId = 'sess_log_image';
    const mediaDir = nativeMediaDir(workspaceRoot, nativeSessionId, 'images');
    const logPath = path.join(outputDir, 'run-log.json');
    tempDirs.push(path.dirname(path.dirname(mediaDir)));
    await fs.mkdir(mediaDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(logPath, '{}\n');
    const artifactPath = path.join(mediaDir, 'fresh.webp');
    const now = Date.now();
    await fs.writeFile(artifactPath, 'webp-bytes');
    await fs.utimes(artifactPath, new Date(now), new Date(now));

    const run = makeStructuredRun({
      workspaceRoot,
      nativeSessionId,
      logPath,
      startedAt: new Date(now - 1000).toISOString(),
      completedAt: new Date(now + 1000).toISOString(),
      grokOutput: JSON.stringify({
        status: 'unavailable',
        reason: 'NATIVE_IMAGE_TOOL_UNAVAILABLE'
      })
    });
    const manager = {
      run: async (): Promise<string> =>
        ['Structured Result', '```json', JSON.stringify(run), '```'].join('\n')
    } as unknown as RunManager;

    await runCapabilityTool(
      manager,
      { prompt: 'poster', workspaceRoot, outputDir, engine: 'acp' },
      'image'
    );

    const log = JSON.parse(await fs.readFile(logPath, 'utf8')) as unknown;
    expect(log).toMatchObject({
      capabilityAudit: {
        kind: 'image',
        outputDir: fsSync.realpathSync.native(outputDir),
        note: expect.stringContaining('recovered from Grok native session storage')
      }
    });
  });
});

function makeCapabilityRequest(workspaceRoot: string, outputDir: string): CapabilityToolRequest {
  return {
    kind: 'image',
    outputDir,
    runRequest: {
      task: 'poster',
      workspaceRoot,
      cwd: workspaceRoot,
      mode: 'image',
      allowWrites: true,
      options: {
        grokBin: 'grok',
        engine: 'acp',
        disableWebSearch: false,
        allow: [],
        deny: [],
        timeoutMs: 30000
      }
    }
  };
}

function makeStructuredRun(input: {
  readonly workspaceRoot: string;
  readonly nativeSessionId: string;
  readonly grokOutput: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly logPath?: string;
}): StructuredRunResult {
  return {
    type: 'grok_delegate_run',
    version: 1,
    runId: 'grok_run_test',
    mode: 'image',
    status: 'success',
    engine: 'acp',
    workspaceRoot: input.workspaceRoot,
    cwd: input.workspaceRoot,
    allowWrites: true,
    nativeSessionId: input.nativeSessionId,
    sessionResolution: 'new',
    exitCode: 0,
    changedFiles: [],
    diffStat: null,
    gitAuditAvailable: false,
    workspaceWasDirty: false,
    testsObserved: [],
    safety: 'ok',
    logPath: input.logPath,
    grokOutput: input.grokOutput,
    startedAt: input.startedAt ?? new Date(0).toISOString(),
    completedAt: input.completedAt ?? new Date(1).toISOString(),
    durationMs: 1
  };
}

function nativeMediaDir(workspaceRoot: string, nativeSessionId: string, mediaKind: string): string {
  return path.join(
    os.homedir(),
    '.grok',
    'sessions',
    encodeURIComponent(workspaceRoot),
    nativeSessionId,
    mediaKind
  );
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
