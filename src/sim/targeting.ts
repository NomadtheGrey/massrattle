/**
 * TARGET LOCKS (CONTROLS.md; commissioned as the follow-on
 * contract closing the Controls landing's named waits, 2026-10-22):
 * a ship may hold ONE lock — `Ship.targetId`, the ownerId of a
 * hostile capital ship, or a turret id `turret:<starOwnerId>:<id>`
 * — set by Tab's cycle or by click/tap (UI's surface), read
 * tomorrow by the Lightning Lock (SIGNATURE_ABILITIES.md). The law here is the whole contract:
 *
 * VALIDITY = hostile + alive + unsheltered + VISIBLE under the
 * stealth geometry (src/sim/stealth.ts is the one table — a
 * shape in the fade band counts; a fully cloaked hull does not,
 * so a submarine that slips its cloak drops every lock on it).
 * A docked ship rides inside a harbor and cannot be hit, so it
 * cannot be locked either.
 *
 * CYCLE ORDER = seat order (stable as ships move; a distance
 * order would reshuffle under the player's thumb). Cycling
 * past the last valid target wraps to the first; a lone valid
 * target cycles onto itself.
 *
 * LOCKS CLEAR the frame their target leaves validity — death,
 * docking, a cloak closing, a team change — never linger as a
 * stale truth (stepTargetLocks runs in the host frame after
 * the death sweep).
 */
import type { SeatSimState, Ship } from '../types';
import { areHostile } from './teams';
import { isVisibleTo } from './stealth';
import {
  isValidTurretTarget,
  parseTurretTargetId,
  validTurretTargetIds,
} from './turretState';

/** May `observer` hold a lock on `targetOwnerId` right now? Ships
 *  by ownerId, turrets by `turret:<starOwnerId>:<turretId>` — the
 *  turret branch reads the turret validity law (hostile + alive),
 *  so a lock on a destroyed turret clears the frame it dies, like
 *  every other stale lock. */
export const isValidTarget = (
  seats: SeatSimState[],
  observer: Ship,
  targetOwnerId: string | null | undefined,
): boolean => {
  if (!targetOwnerId || targetOwnerId === observer.ownerId) return false;
  const turret = parseTurretTargetId(targetOwnerId);
  if (turret) {
    return isValidTurretTarget(seats, observer.ownerId, turret.starOwnerId, turret.turretId);
  }
  const target = seats.find(s => s.ownerId === targetOwnerId)?.ship;
  if (!target || target.health <= 0) return false;
  if (target.dockedTo) return false;
  if (!areHostile(seats, observer.ownerId, targetOwnerId)) return false;
  return isVisibleTo(target, observer.pos);
};

/** Every currently valid lock target for `observer`, in seat
 *  order — the cycle's track. Ships first (seat order), then
 *  turrets (seat order, ladder order within each star) — one
 *  track, so Tab walks ships and then their stars' guns. */
export const validTargetIds = (seats: SeatSimState[], observer: Ship): string[] => [
  ...seats.filter(s => s.ship && isValidTarget(seats, observer, s.ownerId)).map(s => s.ownerId),
  ...validTurretTargetIds(seats, observer.ownerId),
];

/** The cycle's next stop: the valid target after the current
 *  lock in seat order (wrapping), the first valid target when
 *  the current lock is absent or stale, or null when nothing
 *  is valid. */
export const nextTargetId = (seats: SeatSimState[], observer: Ship): string | null => {
  const valid = validTargetIds(seats, observer);
  if (valid.length === 0) return null;
  const idx = observer.targetId ? valid.indexOf(observer.targetId) : -1;
  return valid[(idx + 1) % valid.length];
};

/** Per-frame lock hygiene: a lock whose target left validity
 *  clears where it stands. Runs for every seat's ship — locks
 *  are set by intents and verbs, but they DIE by this law. */
export const stepTargetLocks = (seats: SeatSimState[]): void => {
  for (const seat of seats) {
    const ship = seat.ship;
    if (ship?.targetId && !isValidTarget(seats, ship, ship.targetId)) {
      ship.targetId = undefined;
    }
  }
};
