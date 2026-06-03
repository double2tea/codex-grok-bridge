"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRecord = isRecord;
exports.readString = readString;
exports.readRequiredString = readRequiredString;
exports.readBoolean = readBoolean;
exports.readPositiveInteger = readPositiveInteger;
exports.readStringArray = readStringArray;
exports.expandHome = expandHome;
exports.defaultDataDir = defaultDataDir;
exports.randomId = randomId;
exports.stableKey = stableKey;
exports.toError = toError;
exports.truncate = truncate;
exports.parseJson = parseJson;
exports.stripAnsi = stripAnsi;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readString(record, key) {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}
function readRequiredString(record, key) {
    const value = readString(record, key);
    if (!value) {
        throw new Error(`${key} is required`);
    }
    return value;
}
function readBoolean(record, key) {
    const value = record[key];
    return typeof value === 'boolean' ? value : undefined;
}
function readPositiveInteger(record, key) {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        return undefined;
    }
    return value;
}
function readStringArray(record, key) {
    const value = record[key];
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error(`${key} must be an array of strings`);
    }
    const items = [];
    for (const item of value) {
        if (typeof item !== 'string') {
            throw new Error(`${key} must be an array of strings`);
        }
        items.push(item);
    }
    return items;
}
function expandHome(value) {
    if (value === '~') {
        return node_os_1.default.homedir();
    }
    if (value.startsWith('~/')) {
        return node_path_1.default.join(node_os_1.default.homedir(), value.slice(2));
    }
    return value;
}
function defaultDataDir() {
    return node_path_1.default.join(node_os_1.default.homedir(), '.codex-grok-bridge');
}
function randomId(prefix) {
    return `${prefix}_${node_crypto_1.default.randomBytes(8).toString('hex')}`;
}
function stableKey(input) {
    return node_crypto_1.default.createHash('sha256').update(input).digest('hex');
}
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
function truncate(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 20)}\n...<truncated>`;
}
function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/gu, '');
}
//# sourceMappingURL=utils.js.map