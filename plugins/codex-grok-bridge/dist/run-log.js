"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunLogger = void 0;
exports.runRequestLogView = runRequestLogView;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
class RunLogger {
    runsDir;
    constructor(dataDir) {
        this.runsDir = node_path_1.default.join(dataDir, 'runs');
        node_fs_1.default.mkdirSync(this.runsDir, { recursive: true });
    }
    write(runId, record) {
        const filePath = node_path_1.default.join(this.runsDir, `${safeRunId(runId)}.json`);
        node_fs_1.default.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
        return filePath;
    }
}
exports.RunLogger = RunLogger;
function runRequestLogView(request) {
    return {
        mode: request.mode,
        workspaceRoot: request.workspaceRoot,
        cwd: request.cwd,
        allowWrites: request.allowWrites,
        task: request.task
    };
}
function safeRunId(runId) {
    return runId.replace(/[^a-zA-Z0-9_-]/gu, '_');
}
//# sourceMappingURL=run-log.js.map