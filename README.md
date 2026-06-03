# Codex Grok Bridge Marketplace

This repository is a Codex plugin marketplace for `codex-grok-bridge`.

## Install

Recommended Codex CLI install from Git:

```bash
codex plugin marketplace add double2tea/codex-grok-bridge --ref main
codex plugin add codex-grok-bridge --marketplace codex-grok-bridge
```

Then restart Codex or start a new thread.

The plugin itself lives at:

```text
plugins/codex-grok-bridge
```

For local development:

```bash
git clone https://github.com/double2tea/codex-grok-bridge.git
cd codex-grok-bridge/plugins/codex-grok-bridge
npm install
npm run build
npm run install:personal
```
