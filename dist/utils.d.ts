export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function readString(record: Record<string, unknown>, key: string): string | undefined;
export declare function readRequiredString(record: Record<string, unknown>, key: string): string;
export declare function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined;
export declare function readPositiveInteger(record: Record<string, unknown>, key: string): number | undefined;
export declare function readStringArray(record: Record<string, unknown>, key: string): readonly string[];
export declare function expandHome(value: string): string;
export declare function defaultDataDir(): string;
export declare function randomId(prefix: string): string;
export declare function stableKey(input: string): string;
export declare function toError(value: unknown): Error;
export declare function truncate(value: string, maxLength: number): string;
export declare function parseJson(value: string): unknown;
export declare function stripAnsi(value: string): string;
//# sourceMappingURL=utils.d.ts.map