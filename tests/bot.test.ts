import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/shared/config.js";
import { hullInsideHarbour, type BaseSite } from "../src/shared/bases.js";
import { createEmptyWorld, type World } from "../src/shared/world.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";
import { createBotBrain } from "../src/server/bot.js";
import { createFrigate, createGameState, stepGame, type FrigateInput, type GameState } from "../src/shared/sim.js";
import { mulberry32 } from "../src/shared/rng.js";

const dt = 0.05;

function makeWorld(columns = 100, rows = 80): World {
  const tile = GAME_CONFIG.world.tileSize;
  return createEmptyWorld({
    columns,
    rows,
    width: columns * tile,
    height: rows * tile,
  }, 17);
}

function site(id: string, kind: BaseSite["kind"], x: number, y: number): BaseSite {
  return {
    id,
    kind,
    homeSlot: kind === "home" ? 0 : null,
    cityX: x,
    cityY: y,
    harbourX: x,
    harbourY: y,
    facing: 0,
  };
}

function makeState(world = makeWorld(), sites: BaseSite[] = []): GameState {
  const state = createGameState(world, sites);
  state.settings = { ...DEFAULT_SETTINGS, captureTime: 1, repairTime: 1 };
  return state;
}

function addFrigate(state: GameState, id: string, x: number, y: number, heading = 0) {
  const frigate = createFrigate(id, id, 1, x, y, heading, 0, state.settings);
  frigate.spawnProtectedUntil = 0;
  state.frigates[id] = frigate;
  return frigate;
}

function runBrain(
  state: GameState,
  playerId: string,
  brain: ReturnType<typeof createBotBrain>,
  seconds: number,
  otherInputs: Record<string, FrigateInput> = {},
  observe?: (now: number) => void,
): void {
  const steps = Math.ceil(seconds / dt);
  for (let step = 1; step <= steps; step += 1) {
    const now = step * dt;
    const inputs = { ...otherInputs, [playerId]: brain.think(state, now, dt) };
    stepGame(state, inputs, dt, now);
    observe?.(now);
  }
}

describe("server bot brain", () => {
  it("navigates around a land wall to a resupply goal", () => {
    const world = makeWorld(160, 100);
    for (let row = 0; row < 50; row += 1) {
      for (let column = 75; column < 80; column += 1) {
        world.grid[row * world.columns + column] = 1;
      }
    }
    const home = site("home", "home", 2400, 800);
    const state = makeState(world, [home]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "bot";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    const bot = addFrigate(state, "bot", 800, 800);
    bot.hp = 30;
    const brain = createBotBrain("bot", 2, mulberry32(5));

    let repairedWhileStopped = false;
    runBrain(state, "bot", brain, 90, {}, () => {
      repairedWhileStopped ||= bot.resupplying && bot.throttle === 0 && hullInsideHarbour(bot, base) && bot.hp > 30;
    });
    expect(repairedWhileStopped).toBe(true);
    expect(bot.hp).toBeGreaterThan(30);
  });

  it("lets a Hard bot hit a stationary target at 500 u within 10 s", () => {
    const state = makeState();
    const bot = addFrigate(state, "bot", 800, 1000);
    const target = addFrigate(state, "target", 1300, 1000);
    const brain = createBotBrain("bot", 2, mulberry32(123));
    let hit = false;

    runBrain(state, "bot", brain, 10, {}, () => {
      hit ||= state.events.some((event) => event.type === "damage" && event.targetId === target.playerId);
    });

    expect(hit).toBe(true);
  });

  it("lets a Normal bot hit a target moving straight within 20 s", () => {
    const state = makeState();
    const bot = addFrigate(state, "bot", 800, 1000);
    const target = addFrigate(state, "target", 1300, 1000, 0);
    const brain = createBotBrain("bot", 1, mulberry32(912));
    let hit = false;

    runBrain(state, "bot", brain, 20, {
      target: { seq: 1, keys: 0, throttle: 1, fireCannon: false, fireTorpedo: false },
    }, () => {
      hit ||= state.events.some((event) => event.type === "damage" && event.targetId === target.playerId);
    });

    expect(hit).toBe(true);
  });

  it("returns to an owned harbour, stops, and refills a damaged hull", () => {
    const home = site("home", "home", 1000, 1000);
    const state = makeState(makeWorld(), [home]);
    const base = state.bases[0]!;
    base.active = true;
    base.ownerId = "bot";
    base.turret = "active";
    base.turretHp = GAME_CONFIG.bases.turretHp;
    const bot = addFrigate(state, "bot", base.harbourX, base.harbourY);
    bot.hp = 30;
    const brain = createBotBrain("bot", 1, mulberry32(77));
    let stoppedInHarbour = false;

    runBrain(state, "bot", brain, 5, {}, () => {
      stoppedInHarbour ||= bot.throttle === 0 && bot.resupplying;
    });

    expect(stoppedInHarbour).toBe(true);
    expect(bot.hp).toBe(GAME_CONFIG.player.maxHp);
    expect(bot.resupplying).toBe(false);
  });

  it("captures a neutral base on open water", () => {
    const neutral = site("neutral", "neutral", 1300, 1000);
    const state = makeState(makeWorld(), [neutral]);
    state.settings.captureTime = 1;
    const base = state.bases[0]!;
    const bot = addFrigate(state, "bot", 800, 1000);
    const brain = createBotBrain("bot", 1, mulberry32(18));

    runBrain(state, "bot", brain, 30);

    expect(base.ownerId).toBe("bot");
  });

  it("never fires torpedoes at Easy skill", () => {
    const state = makeState();
    addFrigate(state, "bot", 800, 1000);
    addFrigate(state, "target", 1100, 1000);
    const brain = createBotBrain("bot", 0, mulberry32(1));

    for (let step = 1; step <= 100; step += 1) {
      expect(brain.think(state, step * dt, dt).fireTorpedo).toBe(false);
    }
  });

  it("produces the same inputs for the same random seed", () => {
    const firstState = makeState();
    const secondState = makeState();
    addFrigate(firstState, "bot", 800, 1000);
    addFrigate(secondState, "bot", 800, 1000);
    const firstBrain = createBotBrain("bot", 1, mulberry32(1401));
    const secondBrain = createBotBrain("bot", 1, mulberry32(1401));

    for (let step = 1; step <= 400; step += 1) {
      const now = step * dt;
      const firstInput = firstBrain.think(firstState, now, dt);
      const secondInput = secondBrain.think(secondState, now, dt);
      expect(firstInput).toEqual(secondInput);
      stepGame(firstState, { bot: firstInput }, dt, now);
      stepGame(secondState, { bot: secondInput }, dt, now);
    }
  });
});
