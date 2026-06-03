#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginName = 'codex-grok-bridge';
const legacyPluginNames = ['grok-delegate'];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = os.homedir();
const personalPluginDir = path.join(home, 'plugins');
const personalPluginPath = path.join(personalPluginDir, pluginName);
const marketplacePath = path.join(home, '.agents', 'plugins', 'marketplace.json');
const force = process.argv.includes('--force');

fs.mkdirSync(personalPluginDir, { recursive: true });
removeLegacySymlinks();
ensureSymlink();
ensureMarketplace();

process.stdout.write(`Installed ${pluginName} personal plugin metadata.\n`);
process.stdout.write(`Plugin symlink: ${personalPluginPath} -> ${repoRoot}\n`);
process.stdout.write(`Marketplace: ${marketplacePath}\n`);

function ensureSymlink() {
  const stat = lstatIfExists(personalPluginPath);
  if (stat) {
    if (stat.isSymbolicLink() && path.resolve(fs.readlinkSync(personalPluginPath)) === repoRoot) {
      return;
    }
    if (!force) {
      throw new Error(
        `${personalPluginPath} already exists. Re-run with -- --force to replace it.`
      );
    }
    fs.rmSync(personalPluginPath, { recursive: true, force: true });
  }
  fs.symlinkSync(repoRoot, personalPluginPath, 'dir');
}

function removeLegacySymlinks() {
  for (const legacyName of legacyPluginNames) {
    const legacyPath = path.join(personalPluginDir, legacyName);
    const stat = lstatIfExists(legacyPath);
    if (!stat?.isSymbolicLink()) {
      continue;
    }
    const target = path.resolve(fs.readlinkSync(legacyPath));
    if (target === repoRoot) {
      fs.rmSync(legacyPath, { recursive: true, force: true });
    }
  }
}

function lstatIfExists(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function ensureMarketplace() {
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  const root = fs.existsSync(marketplacePath)
    ? JSON.parse(fs.readFileSync(marketplacePath, 'utf8'))
    : { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
  if (!Array.isArray(root.plugins)) {
    root.plugins = [];
  }
  root.plugins = root.plugins.filter(
    (item) => item && !legacyPluginNames.includes(String(item.name))
  );
  const entry = {
    name: pluginName,
    source: {
      source: 'local',
      path: `./plugins/${pluginName}`
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL'
    },
    category: 'Engineering'
  };
  const index = root.plugins.findIndex((item) => item && item.name === pluginName);
  if (index >= 0) {
    root.plugins[index] = entry;
  } else {
    root.plugins.push(entry);
  }
  fs.writeFileSync(marketplacePath, `${JSON.stringify(root, null, 2)}\n`, { mode: 0o600 });
}
