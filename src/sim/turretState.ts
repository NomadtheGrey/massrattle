/**
 * TURRET STATE (Adam, 2026-10-24 — turrets hittable/targetable).
 * ================================================================
 * The ladder (starDefense.ts) still owns MEMBERSHIP — who exists,
 * at what tier, in what order. This module owns what the ladder
 * never had: per-turret HP, destroyed state, and the regen queue.
 * The state rides the turret records themselves (merged by stable
 * id each frame), so it needs no separate store, sync, or save
 * handling — snapshots and solo saves carry it as-is.
 *
 * THE LAW, as commissioned:
 * - Turrets take NORMAL weapon damage; HP 60 DRAFT (5 bolts at 12).
 * - Scrap pods deal 5 HP DRAFT per pod (the integrity-ratio
 *   translation, accepted as a draft for the numbers pass).
 * - Regen: destroyed turrets return ONE AT A TIME, one every
 *   30 s (PINNED), destruction order first-restored, at full HP,
 *   at their ladder tier/position, until all are replaced.
 * - Damage is hostile-only: a bolt or pod never harms its own
 *   side's turrets — it flies straight through them. (Stars are
 *   terrain and stop friendly bolts; turret hubs are small, and
 *   stopping a ship's own outgoing fire on its own star's ring
 *   would read as a bug, not a rule.)
 * - Targeting: a turret lock reads `turret:<starOwnerId>:<id>` and
 *   obeys the ship validity law minus what cannot apply to star
 *   furniture — hostile + alive, no docked state, no cloak.
 */

import { PHYSICS } from '../constants';
import { turretRingRadius } from '../starDefense';
import { areHostile } from './teams';
import type { SeatSimState, Star, StarTurret } from '../types';

export const TURRET_MAX_HP = PHYSICS.STAR_DEFENSE.TURRET_MAX_HP;
export const TURRET_POD_DAMAGE = PHYSICS.STAR_DEFENSE.TURRET_POD_DAMAGE;
export const TURRET_REGEN_MS = PHYSICS.STAR_DEFENSE.TURRET_REGEN_MS;
export const TURRET_HIT_RADIUS = PHYSICS.STAR_DEFENSE.TURRET_HIT_RADIUS;

/** A lock's name for a turret. The `turret:` prefix keeps the
 *  target-id namespace disjoint from ship ownerIds. */
export const turretTargetId = (starOwnerId: string, turretId: string): string =>
  `turret:${starOwnerId}:${turretId}`;

/** Parse a turret lock back into its star + turret, or null when
 *  the id names a ship (or nothing at all). */
export const parseTurretTargetId = (
  id: string,
): { starOwnerId: string; turretId: string } | null => {
  if (!id.startsWith('turret:')) return null;
  const parts = id.split(':');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  return { starOwnerId: parts[1], turretId: parts[2] };
};

/**
 * Merge a fresh ladder list with the previous frame's state: the
 * ladder's shell/angle/tier stand, and each turret's HP/destroyed
 * state carries across by stable id. A turret the ladder just grew
 * (milestone growth) enters at full HP. Tier-ups never touch HP.
 */
export const reconcileTurrets = (
  prev: StarTurret[] | undefined,
  fresh: StarTurret[],
): StarTurret[] => {
  const byId = new Map((prev || []).map(t => [t.id, t]));
  return fresh.map(t => {
    const old = byId.get(t.id);
    if (!old) return { ...t, hp: TURRET_MAX_HP };
    return {
      ...t,
      hp: old.hp ?? TURRET_MAX_HP,
      destroyed: old.destroyed,
      destroyedAt: old.destroyedAt,
    };
  });
};

/**
 * A turret's live position: its star's center + ring radius at its
 * STAMPED angle. The loop stamps angles in the star step; callers
 * that run before it (projectiles, bots) read last frame's stamp —
 * one frame of orbit (~1.2 deg on the 5 s ring) sits far inside
 * the hitbox, so the staleness is invisible.
 */
export const turretPos = (star: Star, turret: StarTurret): { x: number; y: number } => {
  const ring = turretRingRadius(star.size, turret.shell);
  return {
    x: star.pos.x + Math.cos(turret.angle) * ring,
    y: star.pos.y + Math.sin(turret.angle) * ring,
  };
};

/**
 * Deal `dmg` to a turret. Returns true when this hit destroyed it.
 * Destroyed turrets take no further damage. The first destruction
 * on a star arms the regen countdown (30 s PINNED).
 */
export const damageTurret = (
  star: Star,
  turret: StarTurret,
  dmg: number,
  time: number,
): boolean => {
  if (turret.destroyed) return false;
  const hp = (turret.hp ?? TURRET_MAX_HP) - dmg;
  if (hp > 0) {
    turret.hp = hp;
    return false;
  }
  const queueWasEmpty = !(star.turrets || []).some(t => t !== turret && t.destroyed);
  turret.hp = 0;
  turret.destroyed = true;
  turret.destroyedAt = time;
  if (queueWasEmpty) star.turretRegenInMs = TURRET_REGEN_MS;
  return true;
};

/**
 * Tick the regen queue by `dtMs`: at 0 the oldest destroyed turret
 * (FIFO on destroyedAt) restores at full HP and the countdown
 * resets while any remain. No destroyed turrets = countdown idle.
 * The countdown is a duration, not a loop-clock stamp, so it rides
 * solo saves exactly — a resumed match owes the same wait.
 */
export const stepTurretRegen = (star: Star, dtMs: number): void => {
  const queue = (star.turrets || []).filter(t => t.destroyed);
  if (queue.length === 0) {
    star.turretRegenInMs = 0;
    return;
  }
  const remaining = (star.turretRegenInMs ?? TURRET_REGEN_MS) - dtMs;
  if (remaining > 0) {
    star.turretRegenInMs = remaining;
    return;
  }
  queue.sort(
    (a, b) => (a.destroyedAt ?? 0) - (b.destroyedAt ?? 0) || (a.id < b.id ? -1 : 1),
  );
  const next = queue[0];
  next.hp = TURRET_MAX_HP;
  next.destroyed = false;
  next.destroyedAt = undefined;
  star.turretRegenInMs = queue.length > 1 ? TURRET_REGEN_MS : 0;
};

/**
 * May `observerOwnerId` hold a lock on this turret? The ship
 * validity law, minus the parts that cannot apply to a star
 * structure: hostile + alive. No docked state, no cloak — a
 * turret is star furniture, always visible.
 */
export const isValidTurretTarget = (
  seats: SeatSimState[],
  observerOwnerId: string,
  starOwnerId: string,
  turretId: string,
): boolean => {
  const star = seats.find(s => s.ownerId === starOwnerId)?.star;
  if (!star) return false;
  if (!areHostile(seats, starOwnerId, observerOwnerId)) return false;
  const turret = (star.turrets || []).find(t => t.id === turretId);
  return !!turret && !turret.destroyed;
};

/**
 * Every valid turret lock for `observerOwnerId`, in cycle order:
 * seats in order, turrets in ladder order within each star.
 */
export const validTurretTargetIds = (
  seats: SeatSimState[],
  observerOwnerId: string,
): string[] => {
  const ids: string[] = [];
  for (const seat of seats) {
    if (!areHostile(seats, seat.ownerId, observerOwnerId)) continue;
    for (const t of seat.star.turrets || []) {
      if (!t.destroyed) ids.push(turretTargetId(seat.ownerId, t.id));
    }
  }
  return ids;
};

/**
 * The nearest VALID turret under a point — click targeting's
 * helper (the canvas owns the click, this owns the pick):
 * within `radius` of the turret's live position, nearest wins,
 * or null when nothing valid is under the point.
 */
export const turretAtPoint = (
  seats: SeatSimState[],
  observerOwnerId: string,
  x: number,
  y: number,
  radius: number,
): { starOwnerId: string; turretId: string } | null => {
  let best: { starOwnerId: string; turretId: string; dist: number } | null = null;
  for (const seat of seats) {
    if (!areHostile(seats, seat.ownerId, observerOwnerId)) continue;
    for (const t of seat.star.turrets || []) {
      if (t.destroyed) continue;
      const p = turretPos(seat.star, t);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= radius && (!best || d < best.dist)) {
        best = { starOwnerId: seat.ownerId, turretId: t.id, dist: d };
      }
    }
  }
  return best ? { starOwnerId: best.starOwnerId, turretId: best.turretId } : null;
};
