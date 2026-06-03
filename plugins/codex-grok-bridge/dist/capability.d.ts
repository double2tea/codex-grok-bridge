import type { RunManager } from './run-manager.js';
import type { RunRequest, StructuredRunResult } from './types.js';
export type CapabilityKind = 'search' | 'image' | 'video';
export interface CapabilityToolRequest {
    readonly kind: CapabilityKind;
    readonly runRequest: RunRequest;
    readonly outputDir?: string;
}
export interface ValidatedArtifact {
    readonly path: string;
    readonly kind: Extract<CapabilityKind, 'image' | 'video'>;
    readonly sizeBytes: number;
    readonly mimeType?: string;
    readonly description?: string;
}
export interface ValidatedCapability {
    readonly result: Record<string, unknown>;
    readonly artifacts?: readonly ValidatedArtifact[];
    readonly recoveredArtifacts?: boolean;
}
export declare function runCapabilityTool(manager: RunManager, args: unknown, kind: CapabilityKind): Promise<string>;
export declare function validateCapabilityWithNativeRecovery(kind: CapabilityKind, run: StructuredRunResult, request: CapabilityToolRequest): ValidatedCapability;
export declare function parseCapabilityRequest(args: unknown, kind: CapabilityKind): CapabilityToolRequest;
export declare function validateCapabilityOutput(kind: CapabilityKind, grokOutput: string, outputDir?: string): ValidatedCapability;
export declare function parseStructuredRunSummary(summary: string): StructuredRunResult;
//# sourceMappingURL=capability.d.ts.map