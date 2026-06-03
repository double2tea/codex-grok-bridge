"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const utils_js_1 = require("./utils.js");
class SessionStore {
    dataDir;
    filePath;
    data;
    constructor(dataDir = (0, utils_js_1.defaultDataDir)()) {
        this.dataDir = dataDir;
        node_fs_1.default.mkdirSync(this.dataDir, { recursive: true });
        this.filePath = node_path_1.default.join(this.dataDir, 'state.json');
        this.data = this.read();
    }
    sessionKey(workspaceRoot, mode) {
        return (0, utils_js_1.stableKey)(`${workspaceRoot}\n${mode}`);
    }
    getSession(workspaceRoot, mode) {
        const key = this.sessionKey(workspaceRoot, mode);
        return this.data.sessions.find((session) => session.key === key);
    }
    setSession(input) {
        const key = this.sessionKey(input.workspaceRoot, input.mode);
        const next = {
            key,
            workspaceRoot: input.workspaceRoot,
            mode: input.mode,
            nativeSessionId: input.nativeSessionId,
            updatedAt: Date.now()
        };
        this.data = {
            ...this.data,
            sessions: [next, ...this.data.sessions.filter((session) => session.key !== key)]
        };
        this.write();
    }
    addRecentRun(run) {
        this.data = {
            ...this.data,
            recentRuns: [run, ...this.data.recentRuns].slice(0, 20)
        };
        this.write();
    }
    recentRuns() {
        return this.data.recentRuns;
    }
    sessions() {
        return this.data.sessions;
    }
    read() {
        if (!node_fs_1.default.existsSync(this.filePath)) {
            return { sessions: [], recentRuns: [] };
        }
        const parsed = JSON.parse(node_fs_1.default.readFileSync(this.filePath, 'utf8'));
        if (!(0, utils_js_1.isRecord)(parsed)) {
            return { sessions: [], recentRuns: [] };
        }
        return {
            sessions: readSessions(parsed.sessions),
            recentRuns: readRecentRuns(parsed.recentRuns)
        };
    }
    write() {
        node_fs_1.default.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, {
            mode: 0o600
        });
    }
}
exports.SessionStore = SessionStore;
function readSessions(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        if (!(0, utils_js_1.isRecord)(item)) {
            return [];
        }
        const key = (0, utils_js_1.readString)(item, 'key');
        const workspaceRoot = (0, utils_js_1.readString)(item, 'workspaceRoot');
        const mode = readMode((0, utils_js_1.readString)(item, 'mode'));
        const nativeSessionId = (0, utils_js_1.readString)(item, 'nativeSessionId');
        const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();
        if (!key || !workspaceRoot || !mode || !nativeSessionId) {
            return [];
        }
        return [{ key, workspaceRoot, mode, nativeSessionId, updatedAt }];
    });
}
function readRecentRuns(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        if (!(0, utils_js_1.isRecord)(item)) {
            return [];
        }
        const runId = (0, utils_js_1.readString)(item, 'runId');
        const mode = readMode((0, utils_js_1.readString)(item, 'mode'));
        const workspaceRoot = (0, utils_js_1.readString)(item, 'workspaceRoot');
        const status = readStatus((0, utils_js_1.readString)(item, 'status'));
        const summary = (0, utils_js_1.readString)(item, 'summary');
        const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
        const completedAt = typeof item.completedAt === 'number' ? item.completedAt : createdAt;
        const engine = readEngine((0, utils_js_1.readString)(item, 'engine'));
        if (!runId || !mode || !workspaceRoot || !status || summary === undefined) {
            return [];
        }
        return [{ runId, mode, workspaceRoot, status, summary, createdAt, completedAt, engine }];
    });
}
function readMode(value) {
    return value === 'delegate' || value === 'execute' || value === 'review' ? value : undefined;
}
function readStatus(value) {
    return value === 'success' || value === 'error' || value === 'cancelled' ? value : undefined;
}
function readEngine(value) {
    return value === 'acp' || value === 'cli' ? value : undefined;
}
//# sourceMappingURL=session-store.js.map