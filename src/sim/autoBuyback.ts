/**
 * Auto-buyback (dev pin, 2026-10-25; Adam delegated the pins to dev).
 *
 * "Let the buyback be automatic; purchase the ship line/tier as much
 * as possible, then the Ship Enhancements, then the other upgrades.
 * Some will be unable to be purchased due to the death tax."
 *
 * PIPELINE (price first, then auto-spend of the remainder — the
 * price buys the frame, auto-spend fills it):
 *   (1) SHIP FRAME — re-climb the SAME line step by step to the
 *       pre-death tier, then hull steps to the pre-death count;
 *       never a line switch; broke mid-climb = fly the tier reached.
 *   (2) SHIP ENHANCEMENTS — the five tracks, each to its pre-death
 *       level before moving on, in order: thrust → hold (cargo) →
 *       fuel → vacuum (attractor) → handling.
 *   (3) OTHER UPGRADES — workforce count (defense drones ride with
 *       workforce), then arsenal tiers, then mounts (to pre-death
 *       count), then defenses.
 * Within each phase, SKIP-AND-CONTINUE (greedy fill): an
 * unaffordable item is skipped, cheaper later items still buy — no
 * debt, remainder stays banked.
 *
 * PIN READINGS (BG's, correctable — stated here so dev/Adam can
 * strike them): "arsenal tiers" is read as WEAPON tiers in registry
 * order, "defenses" as the defense-category tiers after mounts, and
 * hybrids ride after defenses (also registry order). Within the
 * weapon beat the SELECTED weapon's tiers buy first (the fighting
 * gun restores first); within defense/hybrid beats the EQUIPPED
 * item buys first (so it lands in the empty slot — first purchase
 * auto-equips only into an empty slot; a taken slot swaps paid).
 *
 * NOT auto-bought: hold cargo (dropped as salvage — the new frame's
 * hold starts empty), escorts (player re-buys in the workshop),
 * line switches, signatures (not built yet — vacuous for now).
 *
 * MECHANICS: the paid verbs run on a THROWAWAY clone (a fresh
 * starter at the arrival spawn, inside the home well, holding the
 * post-price bank) — so prices AND field effects come from the one
 * shop truth, never a mirrored copy. The caller deducts `spent`
 * from the real bank at press and stores the built frame as the
 * seat's pendingBuyback; the arrival tick lands it with the frame.
 * Nothing here touches the real seat: computeBuyback is pure.
 *
 * WORKFORCE SUBTLETY: a dead seat's drones SURVIVE (they anchor to
 * the home star while shipless — stepDrones flies them baseline),
 * so the beat restores only the GAP: snapshot count minus
 * survivors at press. Survivors seed the clone's field AFTER the
 * climb (never during it: an intermediate tier's lower drone cap
 * must not shed survivors the final frame could hold — the climb
 * is transit, a manual type purchase lands ON its tier).
 * Escorts likewise survive ship death (they anchor to the star,
 * dissolving only on seat elimination) — so the escort exclusion
 * is vacuous in practice: the wing persists, nothing to re-buy.
 * Flagged to dev; escort law itself is untouched here.
 */

import type {
  DeathSnapshot,
  Harvester,
  SeatSimState,
  Ship,
  Star,
} from '../types';
import { PHYSICS } from '../constants';
import { createStarterShip } from './seatState';
import { shipSpawnPosition } from './matchAssembly';
import {
  LOADOUT_ITEMS,
  getLoadoutItem,
  itemTierCost,
  swapCostForTier,
} from '../loadout';
import {
  DRONE_MAX_HEALTH,
  DRONE_PRICE,
  DEFENSE_DRONE_PRICE,
  hullStepPrice,
  turretMountPriceFor,
  typeFor,
  typeStepPrice,
  type ShipLine,
  type TypeTier,
} from '../shipProgression';
import {
  seatBuildDefenseDrone,
  seatBuildDrone,
  seatBuyHullStep,
  seatBuyItem,
  seatBuyTrack,
  seatBuyTurretMount,
  seatBuyType,
  seatEquipItem,
  trackPriceFor,
  type SeatShopCtx,
  type UpgradeTrack,
} from './seatShop';

/** One ledger line: what auto-buyback bought, or could not afford. */
export interface BuybackLine {
  label: string;
  price: number;
  /** Why a skipped line did not buy (absent on bought lines). */
  reason?: 'funds' | 'cap';
}

/** The clone run's result: the built frame, the workforce built
 *  (survivors already fly — only the gap is built), the spend, and
 *  the bought/skipped ledger for the UI's transparent form. */
export interface BuybackPlan {
  ship: Ship;
  /** Harvester drones BUILT (not the snapshot count). */
  harvesters: number;
  /** Defense drones BUILT (not the snapshot count). */
  defenseDrones: number;
  spent: number;
  bought: BuybackLine[];
  skipped: BuybackLine[];
}

/**
 * Snapshot the dead frame's build, before the cascade nulls the
 * ship. Hold cargo is deliberately NOT snapshotted (salvage);
 * escorts are deliberately NOT snapshotted (workshop re-buy).
 * Drone counts use the verbs' own fielded definitions, so the
 * restore target matches what the shop counts as fielded.
 */
export const snapshotDeadShip = (
  ship: Ship,
  drones: readonly Harvester[],
): DeathSnapshot => ({
  line: ship.line,
  typeTier: ship.typeTier,
  lineSwitchesUsed: ship.lineSwitchesUsed,
  hullSteps: ship.hullSteps,
  upgrades: { ...ship.upgrades },
  turretMounts: ship.turretMounts,
  arsenal: { ...ship.arsenal },
  loadout: { ...ship.loadout },
  harvesters: drones.filter(
    (d) =>
      d.ownerId === ship.ownerId &&
      d.mode !== 'defense' &&
      !d.starFleet &&
      !d.liquidating,
  ).length,
  defenseDrones: drones.filter(
    (d) => d.ownerId === ship.ownerId && d.mode === 'defense',
  ).length,
});

/** Fielded-harvester filter, mirroring seatBuildDrone's cap count. */
const fieldedHarvesters = (drones: readonly Harvester[], ownerId: string) =>
  drones.filter(
    (d) =>
      d.ownerId === ownerId &&
      d.mode !== 'defense' &&
      !d.starFleet &&
      !d.liquidating,
  ).length;

/** Fielded-defense-drone filter, mirroring seatBuildDefenseDrone's. */
const fieldedDefenseDrones = (drones: readonly Harvester[], ownerId: string) =>
  drones.filter((d) => d.ownerId === ownerId && d.mode === 'defense').length;

/** Track order, pin order: thrust → hold → fuel → vacuum → handling.
 *  `key` is the upgrades-record field the track reads (fuel rides
 *  fuelCap, vacuum rides attractor). */
const TRACK_ORDER: { track: UpgradeTrack; key: keyof DeathSnapshot['upgrades'] }[] = [
  { track: 'thrust', key: 'thrust' },
  { track: 'cargo', key: 'cargo' },
  { track: 'fuel', key: 'fuelCap' },
  { track: 'attractor', key: 'attractor' },
  { track: 'handling', key: 'handling' },
];

/**
 * Run the pinned phases against a throwaway clone of the seat
 * (post-price bank, fresh starter at the arrival spawn) and return
 * the built frame + spend + ledger. Pure: the input seat is never
 * mutated — the caller deducts `spent` and stores the frame.
 * `drones` is the CURRENT real drone list at press (survivors seed
 * the clone's field, so caps and reconcileSwitch see the truth).
 */
export const computeBuyback = (
  seat: SeatSimState,
  snapshot: DeathSnapshot,
  drones: readonly Harvester[],
): BuybackPlan => {
  const work: SeatSimState = {
    ...seat,
    ship: createStarterShip(seat.ownerId, shipSpawnPosition(seat.star), {
      withStarterWeapon: true,
    }),
  };
  const startBank = work.bankedScrap;
  const bought: BuybackLine[] = [];
  const skipped: BuybackLine[] = [];
  // The drone list starts EMPTY through the climb: the climb is
  // TRANSIT, not a destination, and an intermediate tier's lower
  // drone cap must not shed survivors the final frame could hold
  // (a manual type purchase lands ON that tier, so its forced sell
  // is correct there; here it would destroy a drone and then
  // charge to rebuild it). Survivors seed the field only when the
  // workforce beat starts, after the final tier is reached.
  const droneList: Harvester[] = [];
  const ctx: SeatShopCtx = {
    seats: [work],
    drones: droneList,
    escorts: [],
    localOwnerId: seat.ownerId,
  };
  const ship = () => work.ship!;
  const skipReason = (price: number): 'funds' | 'cap' =>
    work.bankedScrap < price ? 'funds' : 'cap';

  // ---- PHASE 1 — SHIP FRAME: same line, step by step. ----
  if (snapshot.line) {
    while (ship().typeTier < snapshot.typeTier) {
      const fromTier = ship().typeTier;
      const price = typeStepPrice(snapshot.line, fromTier);
      const change = seatBuyType(work, ctx, snapshot.line);
      if (!change || ship().typeTier === fromTier) {
        skipped.push({
          label: typeFor(snapshot.line, (fromTier + 1) as TypeTier).name,
          price,
          reason: skipReason(price),
        });
        break; // step prices climb, so a failed step ends the climb
      }
      bought.push({ label: typeFor(snapshot.line, ship().typeTier).name, price });
    }
  }
  // The toll ladder restores with the frame: death neither grants
  // a free switch nor resets what a future manual switch would pay.
  ship().lineSwitchesUsed = snapshot.lineSwitchesUsed;
  // Hull steps, after the tier is reached (the new tier's cap gates).
  while (ship().hullSteps < snapshot.hullSteps) {
    const price = hullStepPrice(ship().hullSteps);
    const before = ship().hullSteps;
    const ok = seatBuyHullStep(work, ctx);
    if (!ok || ship().hullSteps === before) {
      skipped.push({ label: 'hull step', price, reason: skipReason(price) });
      break;
    }
    bought.push({ label: 'hull step', price });
  }

  // ---- PHASE 2 — SHIP ENHANCEMENTS: each track to its dead level. ----
  for (const { track, key } of TRACK_ORDER) {
    const target = snapshot.upgrades[key];
    while ((ship().upgrades as unknown as Record<string, number>)[key] < target) {
      const level = (ship().upgrades as unknown as Record<string, number>)[key];
      const price = trackPriceFor(track, level);
      const ok = seatBuyTrack(work, ctx, track);
      const now = (ship().upgrades as unknown as Record<string, number>)[key];
      if (!ok || now === level) {
        skipped.push({ label: `${track} L${level + 1}`, price, reason: skipReason(price) });
        break; // this track stalls; the NEXT track still tries
      }
      bought.push({ label: `${track} L${now}`, price });
    }
  }

  // ---- PHASE 3 — OTHER UPGRADES. ----
  // Workforce: survivors seed the field NOW (after the climb, so
  // no intermediate cap sheds them) — the beat restores only the
  // gap between fielded survivors and the snapshot count.
  droneList.push(
    ...drones.filter((d) => d.ownerId === seat.ownerId && !d.starFleet),
  );
  // Harvesters, then defense drones — only the gap (survivors
  // already fly; the verbs' caps gate the rest).
  let harvesters = 0;
  while (fieldedHarvesters(droneList, seat.ownerId) < snapshot.harvesters) {
    const change = seatBuildDrone(work, ctx);
    if (!change?.drone) {
      skipped.push({ label: 'harvester drone', price: DRONE_PRICE, reason: skipReason(DRONE_PRICE) });
      break;
    }
    droneList.push(change.drone);
    harvesters++;
    bought.push({ label: 'harvester drone', price: DRONE_PRICE });
  }
  let defenseDrones = 0;
  while (fieldedDefenseDrones(droneList, seat.ownerId) < snapshot.defenseDrones) {
    const change = seatBuildDefenseDrone(work, ctx);
    if (!change?.drone) {
      skipped.push({ label: 'defense drone', price: DEFENSE_DRONE_PRICE, reason: skipReason(DEFENSE_DRONE_PRICE) });
      break;
    }
    droneList.push(change.drone);
    defenseDrones++;
    bought.push({ label: 'defense drone', price: DEFENSE_DRONE_PRICE });
  }

  // Arsenal tiers, registry order. The SELECTED weapon's tiers buy
  // first (the fighting gun restores first); other owned weapons
  // follow in registry order. Tiers owned but not equipped restore
  // as tiers only — equipping is the selection step below.
  const ownedWeapons = LOADOUT_ITEMS.filter(
    (item) => item.category === 'weapon' && (snapshot.arsenal[item.id] ?? 0) > 0,
  );
  const selectedWeapon = snapshot.loadout.weapon;
  const weaponOrder = [
    ...(selectedWeapon
      ? ownedWeapons.filter((item) => item.id === selectedWeapon)
      : []),
    ...ownedWeapons.filter((item) => item.id !== selectedWeapon),
  ];
  for (const item of weaponOrder) {
    const target = snapshot.arsenal[item.id] ?? 0;
    while ((ship().arsenal[item.id] ?? 0) < target) {
      const owned = ship().arsenal[item.id] ?? 0;
      const price = itemTierCost(item, owned);
      const ok = seatBuyItem(work, ctx, item.id);
      if (!ok || (ship().arsenal[item.id] ?? 0) === owned) {
        skipped.push({ label: `${item.name} T${owned + 1}`, price, reason: skipReason(price) });
        break;
      }
      bought.push({ label: `${item.name} T${ship().arsenal[item.id]}`, price });
    }
  }
  // Weapon SELECTION: re-equip the pre-death selected weapon if
  // its tier was restored, else the starter Bolt stays. A non-Bolt
  // weapon swaps into the occupied weapon slot at the pinned swap
  // price; if the swap is unaffordable the tiers stay owned but
  // unequipped (shop law — owning is not equipping).
  if (
    selectedWeapon &&
    selectedWeapon !== ship().loadout.weapon &&
    (ship().arsenal[selectedWeapon] ?? 0) > 0
  ) {
    const def = getLoadoutItem(selectedWeapon);
    const tier = ship().arsenal[selectedWeapon] ?? 0;
    const price = ship().loadout.weapon === null ? 0 : swapCostForTier(tier);
    const ok = seatEquipItem(work, ctx, selectedWeapon);
    if (ok && ship().loadout.weapon === selectedWeapon) {
      bought.push({ label: `equip ${def?.name ?? selectedWeapon}`, price });
    } else {
      skipped.push({ label: `equip ${def?.name ?? selectedWeapon}`, price, reason: 'funds' });
    }
  }

  // Mounts, to the pre-death count (the new frame's cap gates).
  while (ship().turretMounts < snapshot.turretMounts) {
    const price = turretMountPriceFor(ship().turretMounts);
    const before = ship().turretMounts;
    const ok = seatBuyTurretMount(work, ctx);
    if (!ok || ship().turretMounts === before) {
      skipped.push({ label: 'turret mount', price, reason: skipReason(price) });
      break;
    }
    bought.push({ label: 'turret mount', price });
  }

  // Defenses, then hybrids: the EQUIPPED item buys first (its first
  // purchase auto-equips into the empty slot), then other owned
  // items in registry order (tiers only — the slot is taken).
  for (const category of ['defense', 'hybrid'] as const) {
    const equipped = snapshot.loadout[category];
    const owned = LOADOUT_ITEMS.filter(
      (item) => item.category === category && (snapshot.arsenal[item.id] ?? 0) > 0,
    );
    const order = [
      ...(equipped ? owned.filter((item) => item.id === equipped) : []),
      ...owned.filter((item) => item.id !== equipped),
    ];
    for (const item of order) {
      const target = snapshot.arsenal[item.id] ?? 0;
      while ((ship().arsenal[item.id] ?? 0) < target) {
        const ownedTier = ship().arsenal[item.id] ?? 0;
        const price = itemTierCost(item, ownedTier);
        const ok = seatBuyItem(work, ctx, item.id);
        if (!ok || (ship().arsenal[item.id] ?? 0) === ownedTier) {
          skipped.push({ label: `${item.name} T${ownedTier + 1}`, price, reason: skipReason(price) });
          break;
        }
        bought.push({ label: `${item.name} T${ship().arsenal[item.id]}`, price });
      }
    }
  }

  return {
    ship: ship(),
    harvesters,
    defenseDrones,
    spent: startBank - work.bankedScrap,
    bought,
    skipped,
  };
};

/**
 * Spawn the bought workforce as fresh entities at arrival,
 * mirroring the shop verbs' literals (harvester at the home star,
 * defense drone beside the arrived ship). The money was already
 * taken at press — this charges nothing.
 */
export const spawnBuybackDrones = (
  ship: Ship,
  star: Star,
  harvesters: number,
  defenseDrones: number,
  owner: 'player' | 'enemy',
): Harvester[] => {
  const out: Harvester[] = [];
  const capacity =
    PHYSICS.DRONES.CAPACITY + typeFor(ship.line, ship.typeTier).droneCarryBonus;
  for (let i = 0; i < harvesters; i++) {
    out.push({
      id: 'player-drone-' + Math.random().toString(36).substr(2, 9),
      pos: { x: star.pos.x + 100, y: star.pos.y + 100 },
      vel: { x: 0, y: 0 },
      angle: 0,
      targetId: null,
      carrying: 0,
      capacity,
      owner,
      ownerId: ship.ownerId,
      state: 'searching',
      health: DRONE_MAX_HEALTH,
    });
  }
  for (let i = 0; i < defenseDrones; i++) {
    out.push({
      id: 'player-drone-' + Math.random().toString(36).substr(2, 9),
      pos: { x: ship.pos.x + 40, y: ship.pos.y + 40 },
      vel: { x: 0, y: 0 },
      angle: 0,
      targetId: null,
      carrying: 0,
      capacity: 0,
      owner,
      ownerId: ship.ownerId,
      state: 'searching',
      mode: 'defense',
      health: DRONE_MAX_HEALTH,
    });
  }
  return out;
};
