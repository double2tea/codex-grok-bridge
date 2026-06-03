import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../src/session-store.js';
import type { GrokMode } from '../src/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('SessionStore', () => {
  it('persists and reads capability mode sessions', async () => {
    const dataDir = await makeTempDir('codex-grok-bridge-state-');
    const workspaceRoot = await makeTempDir('codex-grok-bridge-workspace-');
    const modes: GrokMode[] = ['search', 'image', 'video'];

    const writer = new SessionStore(dataDir);
    for (const mode of modes) {
      writer.setSession({ workspaceRoot, mode, nativeSessionId: `sess_${mode}` });
    }

    const reader = new SessionStore(dataDir);

    expect(
      reader
        .sessions()
        .map((session) => session.mode)
        .sort()
    ).toEqual(modes.sort());
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
