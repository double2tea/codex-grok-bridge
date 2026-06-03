import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isProbablyWritingCommand, isReadOnlySafeCommand } from '../src/grok-common.js';
import { parseRunRequest } from '../src/input.js';

describe('parseRunRequest', () => {
  it('keeps delegate read-only by default and execute write-capable by default', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-grok-bridge-input-'));

    expect(parseRunRequest({ task: 'inspect', workspaceRoot }, 'delegate').allowWrites).toBe(false);
    expect(parseRunRequest({ task: 'implement', workspaceRoot }, 'execute').allowWrites).toBe(true);
    expect(
      parseRunRequest({ task: 'review', workspaceRoot, allowWrites: true }, 'review').allowWrites
    ).toBe(false);
  });

  it('rejects cwd outside the workspace root', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-grok-bridge-input-'));

    expect(() =>
      parseRunRequest({ task: 'inspect', workspaceRoot, cwd: '../outside' }, 'delegate')
    ).toThrow('cwd must stay inside workspaceRoot');
  });

  it('rejects symlink cwd escapes after resolving real paths', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-grok-bridge-input-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-grok-bridge-outside-'));
    await fs.symlink(outside, path.join(workspaceRoot, 'escape'));

    expect(() =>
      parseRunRequest({ task: 'inspect', workspaceRoot, cwd: 'escape' }, 'delegate')
    ).toThrow('cwd must stay inside workspaceRoot');
  });
});

describe('isProbablyWritingCommand', () => {
  it('allows common read-only review commands', () => {
    expect(isProbablyWritingCommand('git', ['diff'])).toBe(false);
    expect(isReadOnlySafeCommand('rg', ['workspaceRoot'])).toBe(true);
    expect(isReadOnlySafeCommand('npm', ['test'])).toBe(false);
  });

  it('blocks obvious write commands', () => {
    expect(isProbablyWritingCommand('git', ['checkout', '--', '.'])).toBe(true);
    expect(isProbablyWritingCommand('node', ['-e', 'writeFileSync("x", "y")'])).toBe(true);
    expect(isProbablyWritingCommand('bash', ['-lc', 'echo hi > file.txt'])).toBe(true);
  });
});
