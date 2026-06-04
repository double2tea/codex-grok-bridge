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

Recommended CLI install from the public Git marketplace:

```bash
codex plugin marketplace add double2tea/codex-grok-bridge --ref main
codex plugin add codex-grok-bridge --marketplace codex-grok-bridge
```

Then restart Codex or start a new thread.

For local development, clone the repository and install it into the default personal marketplace:

```bash
git clone https://github.com/double2tea/codex-grok-bridge.git
cd codex-grok-bridge/plugins/codex-grok-bridge
npm install
npm run build
npm run install:personal
```

The script creates `~/plugins/codex-grok-bridge` as a symlink to this plugin directory and adds a
standard entry to `~/.agents/plugins/marketplace.json`.

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

## Waiting Time

First Grok ACP startup, session restore, search, image generation, and video generation can take
several minutes. Wait for the tool result before retrying the same request.

If a read-only review needs a clean workspace, commit, stash, or move unrelated local changes before
starting the run.

The search/image/video tools do not call xAI REST APIs or any other external API from the plugin.
They send strict prompts to Grok Build, then validate the returned JSON. Media generation also
checks that returned artifacts exist, are non-empty, use an expected extension, and stay inside the
requested output directory.

Every run returns a structured JSON block and writes a run log under
`~/.codex-grok-bridge/runs/`.
