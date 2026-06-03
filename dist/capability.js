"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCapabilityTool = runCapabilityTool;
exports.parseCapabilityRequest = parseCapabilityRequest;
exports.validateCapabilityOutput = validateCapabilityOutput;
exports.parseStructuredRunSummary = parseStructuredRunSummary;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const input_js_1 = require("./input.js");
const utils_js_1 = require("./utils.js");
const workspace_js_1 = require("./workspace.js");
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const videoExtensions = new Set(['.mp4', '.mov', '.webm']);
async function runCapabilityTool(manager, args, kind) {
    const request = parseCapabilityRequest(args, kind);
    const runSummary = await manager.run(request.runRequest);
    const run = parseStructuredRunSummary(runSummary);
    if (run.status !== 'success') {
        throw new Error(`Grok ${kind} run failed with status ${run.status}`);
    }
    const validated = validateCapabilityOutput(kind, run.grokOutput, request.outputDir);
    return formatCapabilitySummary({
        type: 'grok_delegate_capability',
        version: 1,
        kind,
        status: 'success',
        runId: run.runId,
        engine: run.engine,
        workspaceRoot: run.workspaceRoot,
        cwd: run.cwd,
        outputDir: request.outputDir,
        logPath: run.logPath,
        artifacts: validated.artifacts,
        result: validated.result
    });
}
function parseCapabilityRequest(args, kind) {
    if (!(0, utils_js_1.isRecord)(args)) {
        throw new Error('tool arguments must be an object');
    }
    const workspace = (0, workspace_js_1.resolveWorkspace)((0, utils_js_1.readRequiredString)(args, 'workspaceRoot'), (0, utils_js_1.readString)(args, 'cwd'));
    const options = (0, input_js_1.parseGrokOptions)(args);
    if (kind === 'search') {
        if (options.disableWebSearch) {
            throw new Error('grok_search cannot disable web search');
        }
        const query = (0, utils_js_1.readRequiredString)(args, 'query');
        return {
            kind,
            runRequest: {
                task: query,
                workspaceRoot: workspace.workspaceRoot,
                cwd: workspace.cwd,
                mode: 'search',
                allowWrites: false,
                options,
                promptOverride: buildSearchPrompt(args, query)
            }
        };
    }
    const prompt = (0, utils_js_1.readRequiredString)(args, 'prompt');
    const outputDir = resolveOutputDir(args, workspace.workspaceRoot, kind);
    return {
        kind,
        outputDir,
        runRequest: {
            task: prompt,
            workspaceRoot: workspace.workspaceRoot,
            cwd: workspace.cwd,
            mode: kind,
            allowWrites: true,
            options,
            promptOverride: kind === 'image'
                ? buildImagePrompt(args, prompt, outputDir)
                : buildVideoPrompt(args, prompt, outputDir)
        }
    };
}
function validateCapabilityOutput(kind, grokOutput, outputDir) {
    const result = parseCapabilityJson(grokOutput);
    const status = (0, utils_js_1.readString)(result, 'status');
    if (status === 'unavailable') {
        throw new Error(`Grok Build native ${kind} capability is unavailable in this session`);
    }
    if (status !== 'success') {
        throw new Error(`Grok ${kind} output must set status to success or unavailable`);
    }
    if (kind === 'search') {
        validateSearchResult(result);
        return { result };
    }
    if (!outputDir) {
        throw new Error('outputDir is required for artifact validation');
    }
    return {
        result,
        artifacts: validateArtifacts(result, outputDir, kind)
    };
}
function parseStructuredRunSummary(summary) {
    const markerIndex = summary.indexOf('Structured Result');
    const json = extractFirstJsonObject(markerIndex >= 0 ? summary.slice(markerIndex) : summary);
    if (!json) {
        throw new Error('Grok run summary did not contain structured JSON');
    }
    const parsed = (0, utils_js_1.parseJson)(json);
    if (!isStructuredRunResult(parsed)) {
        throw new Error('Grok run summary JSON is not a grok_delegate_run result');
    }
    return parsed;
}
function buildSearchPrompt(record, query) {
    const maxResults = (0, utils_js_1.readPositiveInteger)(record, 'maxResults');
    const timeRange = (0, utils_js_1.readString)(record, 'timeRange');
    return [
        'You are Grok Build executing a search capability request for Codex.',
        'Use only Grok Build native search/web tools available in this session.',
        'Do not call external REST APIs, browser automation, curl, or third-party SDKs.',
        'If no native search/web tool is available, return unavailable JSON exactly as requested.',
        '',
        'Return JSON only, with no markdown fences and no prose outside JSON.',
        'Success schema:',
        JSON.stringify({
            status: 'success',
            query,
            answer: 'concise answer grounded in the sources',
            sources: [
                {
                    title: 'source title',
                    url: 'https://example.com/page',
                    publishedAt: 'YYYY-MM-DD or unknown',
                    accessedAt: 'ISO-8601 timestamp',
                    usedFor: 'what this source supports'
                }
            ],
            notes: []
        }, null, 2),
        'Unavailable schema:',
        JSON.stringify({
            status: 'unavailable',
            reason: 'NATIVE_SEARCH_TOOL_UNAVAILABLE'
        }, null, 2),
        '',
        `Query: ${query}`,
        maxResults ? `Maximum sources: ${String(maxResults)}` : undefined,
        timeRange ? `Time range constraint: ${timeRange}` : undefined
    ]
        .filter((line) => line !== undefined)
        .join('\n');
}
function buildImagePrompt(record, prompt, outputDir) {
    return buildVisualPrompt({
        kind: 'image',
        prompt,
        outputDir,
        style: (0, utils_js_1.readString)(record, 'style'),
        aspectRatio: (0, utils_js_1.readString)(record, 'aspectRatio'),
        durationSeconds: undefined
    });
}
function buildVideoPrompt(record, prompt, outputDir) {
    return buildVisualPrompt({
        kind: 'video',
        prompt,
        outputDir,
        style: (0, utils_js_1.readString)(record, 'style'),
        aspectRatio: (0, utils_js_1.readString)(record, 'aspectRatio'),
        durationSeconds: (0, utils_js_1.readPositiveInteger)(record, 'durationSeconds')
    });
}
function buildVisualPrompt(input) {
    const nativeMarker = input.kind === 'image' ? 'NATIVE_IMAGE_TOOL_UNAVAILABLE' : 'NATIVE_VIDEO_TOOL_UNAVAILABLE';
    const extensionHint = input.kind === 'image' ? 'png, jpg, jpeg, webp, or gif' : 'mp4, mov, or webm';
    return [
        `You are Grok Build executing a native ${input.kind} generation request for Codex.`,
        `Use only Grok Build native ${input.kind}/Imagine visual generation tools available in this session.`,
        'Do not call external REST APIs, browser automation, curl, or third-party SDKs.',
        'Do not create placeholder SVG, HTML, source code, or text files as substitutes for generated media.',
        'If no native visual generation tool is available, return unavailable JSON exactly as requested.',
        '',
        `Save the generated ${input.kind} file inside this outputDir: ${input.outputDir}`,
        `Return artifact paths for real ${extensionHint} files only.`,
        'Return JSON only, with no markdown fences and no prose outside JSON.',
        'Success schema:',
        JSON.stringify({
            status: 'success',
            prompt: input.prompt,
            artifacts: [
                {
                    kind: input.kind,
                    path: node_path_1.default.join(input.outputDir, input.kind === 'image' ? 'image.png' : 'video.mp4'),
                    mimeType: input.kind === 'image' ? 'image/png' : 'video/mp4',
                    description: 'short description of the generated media'
                }
            ],
            notes: []
        }, null, 2),
        'Unavailable schema:',
        JSON.stringify({
            status: 'unavailable',
            reason: nativeMarker
        }, null, 2),
        '',
        `Prompt: ${input.prompt}`,
        input.style ? `Style: ${input.style}` : undefined,
        input.aspectRatio ? `Aspect ratio: ${input.aspectRatio}` : undefined,
        input.durationSeconds ? `Duration seconds: ${String(input.durationSeconds)}` : undefined
    ]
        .filter((line) => line !== undefined)
        .join('\n');
}
function resolveOutputDir(record, workspaceRoot, kind) {
    const outputDirInput = (0, utils_js_1.readString)(record, 'outputDir');
    const outputDir = outputDirInput
        ? node_path_1.default.resolve(workspaceRoot, outputDirInput)
        : node_path_1.default.join(workspaceRoot, '.codex-grok-bridge', kind);
    (0, workspace_js_1.assertInsideWorkspace)(workspaceRoot, outputDir, 'outputDir');
    node_fs_1.default.mkdirSync(outputDir, { recursive: true });
    const resolved = node_fs_1.default.realpathSync.native(outputDir);
    (0, workspace_js_1.assertInsideWorkspace)(workspaceRoot, resolved, 'outputDir');
    return resolved;
}
function parseCapabilityJson(output) {
    const direct = parseJsonObject(output.trim());
    if (direct) {
        return direct;
    }
    const json = extractFirstJsonObject(output);
    if (!json) {
        throw new Error(`Grok output did not contain capability JSON: ${(0, utils_js_1.truncate)(output, 500)}`);
    }
    const parsed = parseJsonObject(json);
    if (!parsed) {
        throw new Error(`Grok capability JSON is invalid: ${(0, utils_js_1.truncate)(json, 500)}`);
    }
    return parsed;
}
function validateSearchResult(result) {
    const answer = (0, utils_js_1.readString)(result, 'answer') ?? (0, utils_js_1.readString)(result, 'summary');
    if (!answer) {
        throw new Error('grok_search success output requires answer or summary');
    }
    const sources = result.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
        throw new Error('grok_search success output requires at least one source');
    }
    for (const source of sources) {
        if (!(0, utils_js_1.isRecord)(source)) {
            throw new Error('grok_search sources must be objects');
        }
        const url = (0, utils_js_1.readString)(source, 'url');
        if (!url || !isHttpUrl(url)) {
            throw new Error('grok_search sources require http(s) url values');
        }
    }
}
function validateArtifacts(result, outputDir, kind) {
    const artifacts = result.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
        throw new Error(`grok_generate_${kind} success output requires at least one artifact`);
    }
    return artifacts.map((artifact) => validateArtifact(artifact, outputDir, kind));
}
function validateArtifact(value, outputDir, kind) {
    if (!(0, utils_js_1.isRecord)(value)) {
        throw new Error(`grok_generate_${kind} artifacts must be objects`);
    }
    const declaredKind = (0, utils_js_1.readString)(value, 'kind');
    if (declaredKind !== undefined && declaredKind !== kind) {
        throw new Error(`grok_generate_${kind} artifact kind mismatch: ${declaredKind}`);
    }
    const declaredPath = (0, utils_js_1.readRequiredString)(value, 'path');
    const artifactPath = node_path_1.default.isAbsolute(declaredPath)
        ? node_path_1.default.resolve(declaredPath)
        : node_path_1.default.resolve(outputDir, declaredPath);
    (0, workspace_js_1.assertInsideWorkspace)(outputDir, artifactPath, 'artifact path');
    if (!node_fs_1.default.existsSync(artifactPath)) {
        throw new Error(`grok_generate_${kind} artifact does not exist: ${artifactPath}`);
    }
    const resolved = node_fs_1.default.realpathSync.native(artifactPath);
    (0, workspace_js_1.assertInsideWorkspace)(outputDir, resolved, 'artifact path');
    const stat = node_fs_1.default.statSync(resolved);
    if (!stat.isFile() || stat.size <= 0) {
        throw new Error(`grok_generate_${kind} artifact must be a non-empty file: ${resolved}`);
    }
    const extensions = kind === 'image' ? imageExtensions : videoExtensions;
    const extension = node_path_1.default.extname(resolved).toLowerCase();
    if (!extensions.has(extension)) {
        throw new Error(`grok_generate_${kind} artifact has unsupported extension: ${extension}`);
    }
    return {
        path: resolved,
        kind,
        sizeBytes: stat.size,
        mimeType: (0, utils_js_1.readString)(value, 'mimeType'),
        description: (0, utils_js_1.readString)(value, 'description')
    };
}
function parseJsonObject(value) {
    const parsed = (0, utils_js_1.parseJson)(value);
    return (0, utils_js_1.isRecord)(parsed) ? parsed : undefined;
}
function extractFirstJsonObject(value) {
    const start = value.indexOf('{');
    if (start < 0) {
        return undefined;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
        const char = value.charAt(index);
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') {
            depth += 1;
            continue;
        }
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return value.slice(start, index + 1);
            }
        }
    }
    return undefined;
}
function isStructuredRunResult(value) {
    return ((0, utils_js_1.isRecord)(value) &&
        value.type === 'grok_delegate_run' &&
        value.version === 1 &&
        typeof value.runId === 'string' &&
        typeof value.mode === 'string' &&
        typeof value.status === 'string' &&
        typeof value.workspaceRoot === 'string' &&
        typeof value.cwd === 'string' &&
        typeof value.grokOutput === 'string');
}
function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function formatCapabilitySummary(summary) {
    return [
        'Capability Result',
        '```json',
        JSON.stringify(summary, null, 2),
        '```',
        '',
        `Run ID: ${summary.runId}`,
        `Capability: ${summary.kind}`,
        `Status: ${summary.status}`,
        summary.engine ? `Engine: ${summary.engine}` : undefined,
        summary.outputDir ? `Output Dir: ${summary.outputDir}` : undefined,
        summary.logPath ? `Log: ${summary.logPath}` : undefined
    ]
        .filter((line) => line !== undefined)
        .join('\n');
}
//# sourceMappingURL=capability.js.map