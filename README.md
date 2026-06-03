# Codex Grok Bridge

Codex Grok Bridge is a local Codex plugin that exposes MCP tools for handing off work to the local
Grok Build CLI. Codex remains responsible for final review: every write-capable run returns a diff
summary and test summary for Codex to verify.

## Build

```bash
npm install
npm run build
```

## Install In Codex

This repository is the plugin source. Install it into the default personal marketplace with:

```bash
npm run install:personal
```

The script creates `~/plugins/codex-grok-bridge` as a symlink to this repository and adds a standard
entry to `~/.agents/plugins/marketplace.json`.

## Tools

- `grok_delegate`: exploration, planning, diagnostics, or optional implementation.
- `grok_execute`: direct implementation in the current workspace.
- `grok_review`: read-only independent review.
- `grok_search`: native Grok Build search/web lookup with required source URLs.
- `grok_generate_image`: native Grok Build image/Imagine generation with validated image files.
- `grok_generate_video`: native Grok Build video generation with validated video files.
- `grok_status`: active and recent run state.
- `grok_cancel`: cancel an active run.

The plugin expects a logged-in `grok` CLI on the local machine.

The search/image/video tools do not call xAI REST APIs or any other external API from the plugin.
They send strict prompts to Grok Build, then validate the returned JSON. Media generation also
checks that returned artifacts exist, are non-empty, use an expected extension, and stay inside the
requested output directory.

Every run returns a structured JSON block and writes a run log under
`~/.codex-grok-bridge/runs/`.
