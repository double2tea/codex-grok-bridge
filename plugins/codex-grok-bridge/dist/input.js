"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRunRequest = parseRunRequest;
exports.parseRunId = parseRunId;
exports.parseGrokOptions = parseGrokOptions;
const utils_js_1 = require("./utils.js");
const workspace_js_1 = require("./workspace.js");
function parseRunRequest(args, mode) {
    if (!(0, utils_js_1.isRecord)(args)) {
        throw new Error('tool arguments must be an object');
    }
    const task = (0, utils_js_1.readRequiredString)(args, 'task');
    const workspace = (0, workspace_js_1.resolveWorkspace)((0, utils_js_1.readRequiredString)(args, 'workspaceRoot'), (0, utils_js_1.readString)(args, 'cwd'));
    const allowWrites = resolveAllowWrites(args, mode);
    return {
        task,
        workspaceRoot: workspace.workspaceRoot,
        cwd: workspace.cwd,
        mode,
        allowWrites,
        options: parseGrokOptions(args)
    };
}
function parseRunId(args) {
    if (!(0, utils_js_1.isRecord)(args)) {
        throw new Error('tool arguments must be an object');
    }
    return (0, utils_js_1.readRequiredString)(args, 'runId');
}
function resolveAllowWrites(record, mode) {
    if (mode === 'review' || mode === 'search') {
        return false;
    }
    if (mode === 'image' || mode === 'video') {
        return true;
    }
    const explicit = (0, utils_js_1.readBoolean)(record, 'allowWrites');
    if (explicit !== undefined) {
        return explicit;
    }
    return mode === 'execute';
}
function parseGrokOptions(record) {
    return {
        grokBin: (0, utils_js_1.readString)(record, 'grokBin') ?? process.env.GROK_BIN ?? 'grok',
        engine: readEngine((0, utils_js_1.readString)(record, 'engine')),
        model: (0, utils_js_1.readString)(record, 'model'),
        reasoningEffort: (0, utils_js_1.readString)(record, 'reasoningEffort'),
        maxTurns: (0, utils_js_1.readPositiveInteger)(record, 'maxTurns'),
        disableWebSearch: (0, utils_js_1.readBoolean)(record, 'disableWebSearch') ?? false,
        allow: (0, utils_js_1.readStringArray)(record, 'allow'),
        deny: (0, utils_js_1.readStringArray)(record, 'deny'),
        permissionMode: (0, utils_js_1.readString)(record, 'permissionMode'),
        timeoutMs: (0, utils_js_1.readPositiveInteger)(record, 'timeoutMs') ?? 10 * 60 * 1000
    };
}
function readEngine(value) {
    if (value === undefined) {
        return 'auto';
    }
    if (value === 'auto' || value === 'acp' || value === 'cli') {
        return value;
    }
    throw new Error('engine must be auto, acp, or cli');
}
//# sourceMappingURL=input.js.map