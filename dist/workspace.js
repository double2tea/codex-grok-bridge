"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWorkspace = resolveWorkspace;
exports.assertInsideWorkspace = assertInsideWorkspace;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function resolveWorkspace(workspaceRootInput, cwdInput) {
    const workspaceRootPath = node_path_1.default.resolve(workspaceRootInput);
    if (!node_fs_1.default.existsSync(workspaceRootPath)) {
        throw new Error(`workspaceRoot does not exist: ${workspaceRootPath}`);
    }
    const workspaceRoot = node_fs_1.default.realpathSync.native(workspaceRootPath);
    if (!node_fs_1.default.statSync(workspaceRoot).isDirectory()) {
        throw new Error(`workspaceRoot is not a directory: ${workspaceRoot}`);
    }
    const cwdPath = cwdInput ? node_path_1.default.resolve(workspaceRoot, cwdInput) : workspaceRoot;
    assertInsideWorkspace(workspaceRoot, cwdPath, 'cwd');
    if (!node_fs_1.default.existsSync(cwdPath)) {
        throw new Error(`cwd does not exist: ${cwdPath}`);
    }
    const cwd = node_fs_1.default.realpathSync.native(cwdPath);
    assertInsideWorkspace(workspaceRoot, cwd, 'cwd');
    if (!node_fs_1.default.statSync(cwd).isDirectory()) {
        throw new Error(`cwd is not a directory: ${cwd}`);
    }
    return { workspaceRoot, cwd };
}
function assertInsideWorkspace(workspaceRoot, target, label) {
    const root = node_fs_1.default.realpathSync.native(node_path_1.default.resolve(workspaceRoot));
    const targetPath = node_path_1.default.resolve(target);
    const resolved = node_fs_1.default.existsSync(targetPath) ? node_fs_1.default.realpathSync.native(targetPath) : targetPath;
    const relative = node_path_1.default.relative(root, resolved);
    if (relative === '' || (!relative.startsWith('..') && !node_path_1.default.isAbsolute(relative))) {
        return;
    }
    throw new Error(`${label} must stay inside workspaceRoot: ${resolved}`);
}
//# sourceMappingURL=workspace.js.map