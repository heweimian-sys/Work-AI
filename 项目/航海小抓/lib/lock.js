/**
 * lib/lock.js — 轻量内存锁，防止并发竞态
 */
const locks = new Map();

export function acquireLock(key) {
  if (locks.has(key)) return false;
  locks.set(key, true);
  return true;
}

export function releaseLock(key) {
  locks.delete(key);
}

export function isLocked(key) {
  return locks.has(key);
}
