---
name: codex-grok-bridge
description: Use Grok Build from Codex through the codex-grok-bridge MCP tools for heavy exploration, implementation handoff, and independent review.
---

# Codex Grok Bridge

Use this skill when the user explicitly asks to use Grok, or when a task would benefit from a
second coding agent for broad exploration, implementation drafting, difficult test diagnosis, or
independent review.

## Routing

- Prefer `grok_delegate` for broad exploration, test-failure diagnosis, and implementation drafts.
- Prefer `grok_execute` only when the requested implementation is clear enough for Grok to modify
  the current workspace directly.
- Prefer `grok_review` for independent review of a plan, diff, or risky implementation.
- Prefer `grok_search` when the user wants Grok's native web/search capability. Require sourced
  output; if Grok cannot return source URLs, treat it as failed.
- Prefer `grok_generate_image` or `grok_generate_video` only when the user explicitly wants Grok
  native visual generation. These tools validate local media artifacts; do not accept prose-only
  results as success.
- Prefer Grok Build's own search and code-reading capabilities through these tools; do not add
  xAI REST, Imagine, or other external API calls for this plugin.
- Do not call Grok for tiny local edits, sensitive security decisions, or when the user explicitly
  asks Codex to do the work itself.

## Required Inputs

Always pass the absolute current workspace root as `workspaceRoot`. Pass a concise `task` that
includes the goal, constraints, and expected output. For review-only work, use `grok_review`; do not
use a write-capable tool.

## Verification Gate

Codex remains the final owner. After any Grok call:

- Inspect Grok's summary and risks.
- Inspect the returned changed files and diff summary.
- Open the returned run log path when the output is ambiguous, missing, or surprising.
- Run the relevant tests or clearly state why they were not run.
- Do not tell the user the work is done until Codex has verified the result.

If Grok reports no output, times out, or fails to provide a diff/test summary after writing, treat
that as a failed delegation and continue with Codex-owned diagnosis.

For `grok_search`, inspect source URLs and dates before relying on the answer. For media generation,
open or inspect returned artifact paths before telling the user generation succeeded.
