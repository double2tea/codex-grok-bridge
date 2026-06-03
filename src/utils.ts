import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = readString(record, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function readPositiveInteger(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function readStringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${key} must be an array of strings`);
    }
    items.push(item);
  }
  return items;
}

export function expandHome(value: string): string {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function defaultDataDir(): string {
  return path.join(os.homedir(), '.codex-grok-bridge');
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function stableKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 20)}\n...<truncated>`;
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, '');
}
