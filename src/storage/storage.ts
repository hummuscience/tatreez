import type { GroundTruth, Pattern } from '../engine/types';

const PATTERN_PREFIX = 'tatreez:pattern:';
const GT_PREFIX = 'tatreez:gt:';

export interface SavedPattern {
  id: string;
  pattern: Pattern;
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listSavedPatterns(): SavedPattern[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const out: SavedPattern[] = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key || !key.startsWith(PATTERN_PREFIX)) continue;
    const raw = ls.getItem(key);
    if (!raw) continue;
    try {
      const pattern = JSON.parse(raw) as Pattern;
      out.push({ id: key.slice(PATTERN_PREFIX.length), pattern });
    } catch {
      // skip corrupted
    }
  }
  return out;
}

export function savePattern(pattern: Pattern): string {
  const ls = safeLocalStorage();
  if (!ls) throw new Error('localStorage not available');
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  ls.setItem(PATTERN_PREFIX + id, JSON.stringify(pattern));
  return id;
}

export function deletePattern(id: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.removeItem(PATTERN_PREFIX + id);
  ls.removeItem(GT_PREFIX + savedPatternKey(id));
}

export function savedPatternKey(id: string): string {
  return `saved:${id}`;
}

export function builtinPatternKey(id: string): string {
  return `builtin:${id}`;
}

export function getGroundTruth(patternKey: string): GroundTruth | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  const raw = ls.getItem(GT_PREFIX + patternKey);
  if (!raw) return null;
  try {
    const gt = JSON.parse(raw) as GroundTruth;
    // Migrate legacy GTs (recorded before parts existed): wrap the whole
    // recording into one anonymous part so consumers can rely on
    // `gt.parts` always being populated.
    if (!gt.parts && gt.points && gt.points.length > 0) {
      gt.parts = [{ name: 'unnamed', pointStart: 0, pointEnd: gt.points.length }];
    }
    return gt;
  } catch {
    return null;
  }
}

export function setGroundTruth(patternKey: string, gt: GroundTruth): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.setItem(GT_PREFIX + patternKey, JSON.stringify(gt));
}

export function clearGroundTruth(patternKey: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.removeItem(GT_PREFIX + patternKey);
}
