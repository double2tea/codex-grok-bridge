export declare const toolSchemas: readonly [{
    readonly name: "grok_delegate";
    readonly description: "Delegate exploration, planning, diagnostics, or optional implementation work to Grok Build.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: Record<string, Record<string, unknown>>;
        readonly required: readonly ["task", "workspaceRoot"];
    };
}, {
    readonly name: "grok_execute";
    readonly description: "Ask Grok Build to directly implement a clear task inside the current workspace.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: Record<string, Record<string, unknown>>;
        readonly required: readonly ["task", "workspaceRoot"];
    };
}, {
    readonly name: "grok_review";
    readonly description: "Ask Grok Build for a read-only independent review of a plan, diff, or code path.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: Record<string, Record<string, unknown>>;
        readonly required: readonly ["task", "workspaceRoot"];
    };
}, {
    readonly name: "grok_search";
    readonly description: "Ask Grok Build to use its native search/web capability and return sourced JSON.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly query: {
                readonly type: "string";
                readonly description: "Search query for Grok Build native search/web tools.";
            };
            readonly maxResults: {
                readonly type: "number";
                readonly description: "Optional maximum number of sources Grok should use.";
            };
            readonly timeRange: {
                readonly type: "string";
                readonly description: "Optional time constraint such as today, past week, or 2026.";
            };
        };
        readonly required: readonly ["query", "workspaceRoot"];
    };
}, {
    readonly name: "grok_generate_image";
    readonly description: "Ask Grok Build to use its native image/Imagine capability and save validated image artifacts.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly prompt: {
                readonly type: "string";
                readonly description: "Image generation prompt for Grok Build native visual tools.";
            };
            readonly outputDir: {
                readonly type: "string";
                readonly description: "Optional output directory inside workspaceRoot. Defaults to .codex-grok-bridge/image.";
            };
            readonly aspectRatio: {
                readonly type: "string";
                readonly description: "Optional aspect ratio constraint, such as 1:1, 16:9, or 9:16.";
            };
            readonly style: {
                readonly type: "string";
                readonly description: "Optional visual style constraint.";
            };
        };
        readonly required: readonly ["prompt", "workspaceRoot"];
    };
}, {
    readonly name: "grok_generate_video";
    readonly description: "Ask Grok Build to use its native video generation capability and save validated video artifacts.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly prompt: {
                readonly type: "string";
                readonly description: "Video generation prompt for Grok Build native visual tools.";
            };
            readonly outputDir: {
                readonly type: "string";
                readonly description: "Optional output directory inside workspaceRoot. Defaults to .codex-grok-bridge/video.";
            };
            readonly aspectRatio: {
                readonly type: "string";
                readonly description: "Optional aspect ratio constraint, such as 16:9 or 9:16.";
            };
            readonly durationSeconds: {
                readonly type: "number";
                readonly description: "Optional desired duration in whole seconds.";
            };
            readonly style: {
                readonly type: "string";
                readonly description: "Optional visual style constraint.";
            };
        };
        readonly required: readonly ["prompt", "workspaceRoot"];
    };
}, {
    readonly name: "grok_status";
    readonly description: "Show active Codex Grok Bridge runs, recent runs, and stored Grok sessions.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {};
        readonly required: readonly [];
    };
}, {
    readonly name: "grok_cancel";
    readonly description: "Cancel an active Codex Grok Bridge run by runId.";
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly runId: {
                readonly type: "string";
                readonly description: "Run id returned by any Codex Grok Bridge tool.";
            };
        };
        readonly required: readonly ["runId"];
    };
}];
//# sourceMappingURL=tool-schemas.d.ts.map