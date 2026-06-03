export const toolSchemas = [
  {
    name: 'grok_delegate',
    description:
      'Delegate exploration, planning, diagnostics, or optional implementation work to Grok Build.',
    inputSchema: {
      type: 'object',
      properties: runProperties({
        allowWritesDescription:
          'Allow Grok to modify files inside workspaceRoot. Defaults to false.'
      }),
      required: ['task', 'workspaceRoot']
    }
  },
  {
    name: 'grok_execute',
    description: 'Ask Grok Build to directly implement a clear task inside the current workspace.',
    inputSchema: {
      type: 'object',
      properties: runProperties({
        allowWritesDescription: 'Whether Grok may modify files. Defaults to true for execute.'
      }),
      required: ['task', 'workspaceRoot']
    }
  },
  {
    name: 'grok_review',
    description: 'Ask Grok Build for a read-only independent review of a plan, diff, or code path.',
    inputSchema: {
      type: 'object',
      properties: runProperties({
        allowWritesDescription: 'Ignored for review; review is always read-only.'
      }),
      required: ['task', 'workspaceRoot']
    }
  },
  {
    name: 'grok_search',
    description: 'Ask Grok Build to use its native search/web capability and return sourced JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for Grok Build native search/web tools.'
        },
        maxResults: {
          type: 'number',
          description: 'Optional maximum number of sources Grok should use.'
        },
        timeRange: {
          type: 'string',
          description: 'Optional time constraint such as today, past week, or 2026.'
        },
        ...capabilityCommonProperties()
      },
      required: ['query', 'workspaceRoot']
    }
  },
  {
    name: 'grok_generate_image',
    description:
      'Ask Grok Build to use its native image/Imagine capability and save validated image artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt for Grok Build native visual tools.'
        },
        outputDir: {
          type: 'string',
          description:
            'Optional output directory inside workspaceRoot. Defaults to .codex-grok-bridge/image.'
        },
        aspectRatio: {
          type: 'string',
          description: 'Optional aspect ratio constraint, such as 1:1, 16:9, or 9:16.'
        },
        style: {
          type: 'string',
          description: 'Optional visual style constraint.'
        },
        ...capabilityCommonProperties()
      },
      required: ['prompt', 'workspaceRoot']
    }
  },
  {
    name: 'grok_generate_video',
    description:
      'Ask Grok Build to use its native video generation capability and save validated video artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Video generation prompt for Grok Build native visual tools.'
        },
        outputDir: {
          type: 'string',
          description:
            'Optional output directory inside workspaceRoot. Defaults to .codex-grok-bridge/video.'
        },
        aspectRatio: {
          type: 'string',
          description: 'Optional aspect ratio constraint, such as 16:9 or 9:16.'
        },
        durationSeconds: {
          type: 'number',
          description: 'Optional desired duration in whole seconds.'
        },
        style: {
          type: 'string',
          description: 'Optional visual style constraint.'
        },
        ...capabilityCommonProperties()
      },
      required: ['prompt', 'workspaceRoot']
    }
  },
  {
    name: 'grok_status',
    description: 'Show active Codex Grok Bridge runs, recent runs, and stored Grok sessions.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'grok_cancel',
    description: 'Cancel an active Codex Grok Bridge run by runId.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by any Codex Grok Bridge tool.'
        }
      },
      required: ['runId']
    }
  }
] as const;

function capabilityCommonProperties(): Record<string, Record<string, unknown>> {
  const properties = runProperties({
    allowWritesDescription: ''
  });
  return {
    workspaceRoot: properties.workspaceRoot,
    cwd: properties.cwd,
    engine: properties.engine,
    grokBin: properties.grokBin,
    model: properties.model,
    reasoningEffort: properties.reasoningEffort,
    maxTurns: properties.maxTurns,
    timeoutMs: properties.timeoutMs,
    allow: properties.allow,
    deny: properties.deny,
    permissionMode: properties.permissionMode,
    disableWebSearch: {
      ...properties.disableWebSearch,
      description:
        'Disable Grok web search/fetch tools. grok_search rejects true because search requires web tools.'
    }
  };
}

function runProperties(input: {
  readonly allowWritesDescription: string;
}): Record<string, Record<string, unknown>> {
  return {
    task: {
      type: 'string',
      description: 'The delegated task, including goal, constraints, and expected output.'
    },
    workspaceRoot: {
      type: 'string',
      description: 'Absolute path to the Codex workspace root.'
    },
    cwd: {
      type: 'string',
      description: 'Optional working directory inside workspaceRoot.'
    },
    allowWrites: {
      type: 'boolean',
      description: input.allowWritesDescription
    },
    engine: {
      type: 'string',
      enum: ['auto', 'acp', 'cli'],
      description: 'Grok invocation engine. Defaults to auto.'
    },
    grokBin: {
      type: 'string',
      description: 'Grok binary path. Defaults to GROK_BIN or grok.'
    },
    model: {
      type: 'string',
      description: 'Optional Grok model id.'
    },
    reasoningEffort: {
      type: 'string',
      description: 'Optional Grok reasoning effort.'
    },
    maxTurns: {
      type: 'number',
      description: 'Optional Grok max turns for CLI fallback.'
    },
    timeoutMs: {
      type: 'number',
      description: 'Run timeout in milliseconds. Defaults to 600000.'
    },
    disableWebSearch: {
      type: 'boolean',
      description: 'Disable Grok web search/fetch tools.'
    },
    allow: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional Grok allow rules for CLI fallback.'
    },
    deny: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional Grok deny rules for CLI fallback.'
    },
    permissionMode: {
      type: 'string',
      description: 'Optional Grok permission mode for CLI fallback.'
    }
  };
}
