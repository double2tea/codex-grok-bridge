import type { GrokEngine, GrokMode, GrokOptions, RunRequest } from './types.js';
import {
  isRecord,
  readBoolean,
  readPositiveInteger,
  readRequiredString,
  readString,
  readStringArray
} from './utils.js';
import { resolveWorkspace } from './workspace.js';

export function parseRunRequest(args: unknown, mode: GrokMode): RunRequest {
  if (!isRecord(args)) {
    throw new Error('tool arguments must be an object');
  }
  const task = readRequiredString(args, 'task');
  const workspace = resolveWorkspace(
    readRequiredString(args, 'workspaceRoot'),
    readString(args, 'cwd')
  );
  const allowWrites = resolveAllowWrites(args, mode);
  return {
    task,
    workspaceRoot: workspace.workspaceRoot,
    cwd: workspace.cwd,
    mode,
    allowWrites,
    options: parseGrokOptions(args)
  };
}

export function parseRunId(args: unknown): string {
  if (!isRecord(args)) {
    throw new Error('tool arguments must be an object');
  }
  return readRequiredString(args, 'runId');
}

function resolveAllowWrites(record: Record<string, unknown>, mode: GrokMode): boolean {
  if (mode === 'review' || mode === 'search') {
    return false;
  }
  if (mode === 'image' || mode === 'video') {
    return true;
  }
  const explicit = readBoolean(record, 'allowWrites');
  if (explicit !== undefined) {
    return explicit;
  }
  return mode === 'execute';
}

export function parseGrokOptions(record: Record<string, unknown>): GrokOptions {
  return {
    grokBin: readString(record, 'grokBin') ?? process.env.GROK_BIN ?? 'grok',
    engine: readEngine(readString(record, 'engine')),
    model: readString(record, 'model'),
    reasoningEffort: readString(record, 'reasoningEffort'),
    maxTurns: readPositiveInteger(record, 'maxTurns'),
    disableWebSearch: readBoolean(record, 'disableWebSearch') ?? false,
    allow: readStringArray(record, 'allow'),
    deny: readStringArray(record, 'deny'),
    permissionMode: readString(record, 'permissionMode'),
    timeoutMs: readPositiveInteger(record, 'timeoutMs') ?? 10 * 60 * 1000
  };
}

function readEngine(value: string | undefined): GrokEngine {
  if (value === undefined) {
    return 'auto';
  }
  if (value === 'auto' || value === 'acp' || value === 'cli') {
    return value;
  }
  throw new Error('engine must be auto, acp, or cli');
}
