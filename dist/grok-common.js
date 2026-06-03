"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentArgs = buildAgentArgs;
exports.buildCliArgs = buildCliArgs;
exports.formatCommand = formatCommand;
exports.isProbablyWritingCommand = isProbablyWritingCommand;
exports.isReadOnlySafeCommand = isReadOnlySafeCommand;
const node_path_1 = __importDefault(require("node:path"));
function buildAgentArgs(options) {
    return ['agent', ...buildSharedAgentOptions(options), 'stdio'];
}
function buildCliArgs(prompt, cwd, options) {
    const args = [
        '-p',
        prompt,
        '--output-format',
        'streaming-json',
        '--cwd',
        cwd,
        ...buildSharedCliOptions(options)
    ];
    return args;
}
function formatCommand(command, args) {
    return [command, ...args].join(' ');
}
function isProbablyWritingCommand(command, args) {
    const executable = node_path_1.default.basename(command);
    const joined = [executable, ...args].join(' ');
    if (executable === 'git') {
        const subcommand = args[0] ?? '';
        return !['diff', 'status', 'show', 'log', 'rev-parse', 'ls-files', 'grep', 'branch'].includes(subcommand);
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(executable)) {
        return isPackageManagerWrite(args);
    }
    if (['bash', 'sh', 'zsh'].includes(executable)) {
        return shellLooksWriting(joined);
    }
    if (['rm', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'tee', 'perl', 'sed'].includes(executable)) {
        return true;
    }
    if (['node', 'python', 'python3', 'ruby'].includes(executable)) {
        return args.includes('-e') || args.includes('-c');
    }
    return false;
}
function isReadOnlySafeCommand(command, args) {
    const executable = node_path_1.default.basename(command);
    if (executable === 'git') {
        const subcommand = args[0] ?? '';
        return ['diff', 'status', 'show', 'log', 'rev-parse', 'ls-files', 'grep', 'branch'].includes(subcommand);
    }
    if ([
        'rg',
        'grep',
        'sed',
        'cat',
        'ls',
        'find',
        'pwd',
        'wc',
        'head',
        'tail',
        'stat',
        'file',
        'which',
        'date'
    ].includes(executable)) {
        return true;
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(executable)) {
        const subcommand = args[0] ?? '';
        return ['ls', 'list', 'why', 'outdated'].includes(subcommand);
    }
    return false;
}
function buildSharedAgentOptions(options) {
    const args = [];
    pushOption(args, '--model', options.model);
    pushOption(args, '--reasoning-effort', options.reasoningEffort);
    if (options.disableWebSearch) {
        args.push('--disable-web-search');
    }
    return args;
}
function buildSharedCliOptions(options) {
    const args = [];
    pushOption(args, '--model', options.model);
    pushOption(args, '--reasoning-effort', options.reasoningEffort);
    pushOption(args, '--permission-mode', options.permissionMode);
    pushOption(args, '--max-turns', options.maxTurns?.toString());
    if (options.disableWebSearch) {
        args.push('--disable-web-search');
    }
    for (const rule of options.allow) {
        args.push('--allow', rule);
    }
    for (const rule of options.deny) {
        args.push('--deny', rule);
    }
    return args;
}
function pushOption(args, name, value) {
    if (value !== undefined && value.length > 0) {
        args.push(name, value);
    }
}
function isPackageManagerWrite(args) {
    const joined = args.join(' ');
    if (/\b(--fix|install|add|remove|update|upgrade|dedupe|rebuild|link)\b/u.test(joined)) {
        return true;
    }
    return false;
}
function shellLooksWriting(command) {
    return (command.includes('>') ||
        /(^|\s)(rm|mv|cp|mkdir|touch|chmod|chown|tee|npm\s+install|pnpm\s+install|yarn\s+add)\b/u.test(command));
}
//# sourceMappingURL=grok-common.js.map