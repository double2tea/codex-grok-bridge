import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseCapabilityRequest,
  parseStructuredRunSummary,
  validateCapabilityOutput
} from '../src/capability.js';

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

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
