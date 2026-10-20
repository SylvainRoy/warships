import { GAME_CONFIG } from "../shared/config.js";
import type { BasePublic } from "../shared/bases.js";
import type { Frigate, Shell, Torpedo } from "../shared/sim.js";
import { createEmptyWorld, mapDimensions } from "../shared/world.js";
import { computeCamera, computeViewport } from "./camera.js";
import { drawBases, drawCaptureProgress } from "./bases.js";
import { canvasElement, colours, ctx, nameInput } from "./dom.js";
import { effects, flushPendingHitFeed, initializeGameEvents, ownDamageTimes } from "./gameEvents.js";
import { initializeBindings, initializeInputUi, registerInputListeners, simulationTick } from "./input.js";
import { drawHud } from "./hud/console.js";
import { registerMenuKeyListener } from "./menu.js";
import { connect, projectileStore, registerNetListeners } from "./net.js";
import { renderTerrain } from "./render/terrain.js";
import {
  drawDamageVignette,
  drawExplosion,
  drawFrigate,
  drawHitFeedback,
  drawReticle,
  drawShell,
  drawTorpedo,
  drawTorpedoWake,
  drawWakes,
} from "./render/world.js";
import { client, type Snapshot } from "./state.js";

declare global {
  interface Window {
    __warships: Readonly<{
      ownId: string | null;
      latestSnapshot: Readonly<Snapshot> | null;
      predictedOwnFrigate: Readonly<Frigate> | null;
      bases: ReadonlyArray<Readonly<BasePublic>>;
      projectiles: Readonly<{ shells: Shell[]; torpedoes: Torpedo[] }>;
      projectileServerTime: number;
    }>;
  }
}

initializeBindings();
initializeGameEvents();

Object.defineProperty(window, "__warships", {
  configurable: false,
  enumerable: false,
  get: () => Object.freeze({
    ownId: client.ownId,
    latestSnapshot: client.latestSnapshot ? deepFreeze(structuredClone(client.latestSnapshot)) : null,
    predictedOwnFrigate: client.predictedOwn ? deepFreeze({ ...client.predictedOwn }) : null,
    bases: deepFreeze(structuredClone(client.bases)),
    projectiles: deepFreeze(structuredClone(client.renderedProjectiles)),
    projectileServerTime: client.projectileServerTime,
  }),
});

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}

nameInput.value = sessionStorage.getItem("warships.sessionName") ?? localStorage.getItem("warships.name") ?? "";

function getRenderSnapshot(): Snapshot | null {
  if (client.snapshots.length === 0) return client.latestSnapshot;
  const targetTime = performance.now() - GAME_CONFIG.network.interpolationDelay * 1000;
  let before = client.snapshots[0];
  let after = client.snapshots[client.snapshots.length - 1];
  for (let i = 1; i < client.snapshots.length; i += 1) {
    const candidate = client.snapshots[i];
    if (candidate && candidate.receivedAt >= targetTime) {
      after = candidate;
      before = client.snapshots[i - 1] ?? candidate;
      break;
    }
  }
  if (!before || !after || before === after) return client.latestSnapshot;
  const fraction = Math.max(0, Math.min(1, (targetTime - before.receivedAt) / (after.receivedAt - before.receivedAt)));
  const later = after.value;
  const frigates = later.frigates.map((item) => {
    if (item.playerId === client.ownId) return client.predictedOwn ?? item;
    const earlier = before?.value.frigates.find((candidate) => candidate.playerId === item.playerId);
    if (!earlier) return item;
    return {
      ...item,
      x: earlier.x + (item.x - earlier.x) * fraction,
      y: earlier.y + (item.y - earlier.y) * fraction,
      heading: interpolateAngle(earlier.heading, item.heading, fraction),
    };
  });
  return { ...later, frigates };
}

function interpolateAngle(first: number, second: number, amount: number): number {
  const delta = Math.atan2(Math.sin(second - first), Math.cos(second - first));
  return first + delta * amount;
}

function resizeCanvas(): {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
} {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvasElement.width !== Math.round(width * dpr) || canvasElement.height !== Math.round(height * dpr)) {
    canvasElement.width = Math.round(width * dpr);
    canvasElement.height = Math.round(height * dpr);
  }
  const viewport = computeViewport(width, height);
  return {
    width,
    height,
    ...viewport,
    dpr,
  };
}

function renderFrame(now: number): void {
  const viewport = resizeCanvas();
  const serverNow = now / 1000 + client.serverTimeOffset;
  ownDamageTimes.splice(
    0,
    ownDamageTimes.length,
    ...ownDamageTimes.filter((damage) => now - damage.at < GAME_CONFIG.effects.shakeDuration * 1000),
  );
  let shakeAmplitude = 0;
  if (client.effectsSettings.shake) {
    for (const damage of ownDamageTimes) {
      const elapsed = (now - damage.at) / 1000;
      const remaining = 1 - elapsed / GAME_CONFIG.effects.shakeDuration;
      const amplitude = Math.min(
        GAME_CONFIG.effects.shakeMaxAmplitude,
        GAME_CONFIG.effects.shakePerDamage * damage.amount,
      ) * Math.max(0, remaining);
      shakeAmplitude = Math.max(shakeAmplitude, amplitude);
    }
  }
  const shakeX = (Math.random() * 2 - 1) * shakeAmplitude;
  const shakeY = (Math.random() * 2 - 1) * shakeAmplitude;
  flushPendingHitFeed(now);
  if (client.hasServerTimeOffset) {
    client.projectileServerTime = performance.now() / 1000 + client.serverTimeOffset - GAME_CONFIG.network.interpolationDelay;
    client.renderedProjectiles = projectileStore.at(
      client.projectileServerTime,
      client.world ?? createEmptyWorld(mapDimensions(client.gameSettings.mapSize)),
    );
  } else {
    client.projectileServerTime = 0;
    client.renderedProjectiles = { shells: [], torpedoes: [] };
  }
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.fillStyle = "#071b2a";
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.setTransform(
    viewport.dpr * viewport.scale,
    0,
    0,
    viewport.dpr * viewport.scale,
    viewport.dpr * viewport.offsetX,
    viewport.dpr * viewport.offsetY,
  );
  const snapshot = getRenderSnapshot();
  const own = client.predictedOwn ?? snapshot?.frigates.find((frigate) => frigate.playerId === client.ownId) as Frigate | undefined;
  if (client.world && own) {
    const camera = computeCamera({ x: own.x, y: own.y }, client.world);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
    ctx.clip();
    ctx.translate(-camera.x + shakeX, -camera.y + shakeY);
    renderTerrain(
      client.world,
      camera.x,
      camera.y,
      GAME_CONFIG.screen.width,
      GAME_CONFIG.screen.height,
      viewport.scale,
      viewport.dpr,
    );
    const visible = snapshot?.frigates ?? [];
    const players = snapshot?.players ?? [];
    drawBases(ctx, client.bases, (ownerId) => {
      const owner = players.find((player) => player.playerId === ownerId);
      return owner ? colours[owner.slot - 1] : undefined;
    });
    drawWakes(visible, serverNow);
    for (const shell of client.renderedProjectiles.shells) drawShell(shell);
    for (const torpedo of client.renderedProjectiles.torpedoes) {
      drawTorpedoWake(torpedo);
      drawTorpedo(torpedo);
    }
    for (const frigate of visible) if (frigate.playerId !== client.ownId) drawFrigate(frigate, serverNow, client.debugVisible);
    if (own) drawFrigate(own, serverNow, client.debugVisible);
    for (const effect of effects) drawExplosion(effect, now);
    drawHitFeedback(now);
    if (own) drawReticle(own, serverNow);
    if (own) drawCaptureProgress(
      ctx,
      own,
      client.bases,
      own.playerId,
      client.gameSettings.captureTime,
      client.gameSettings.repairTime,
      client.gameSettings,
    );
    ctx.restore();
  } else {
    ctx.setTransform(viewport.dpr * viewport.scale, 0, 0, viewport.dpr * viewport.scale, 0, 0);
    const logicalWidth = viewport.width / viewport.scale;
    const logicalHeight = viewport.height / viewport.scale;
    ctx.fillStyle = "#071b2a";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.fillStyle = "#88adaf";
    ctx.font = "14px DM Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CONNECTING TO THE FLEET…", logicalWidth / 2, logicalHeight / 2);
  }
  drawDamageVignette(now);
  if (snapshot) {
    ctx.setTransform(viewport.dpr * viewport.scale, 0, 0, viewport.dpr * viewport.scale, 0, 0);
    drawHud(snapshot, own, serverNow, viewport.width / viewport.scale, viewport.height / viewport.scale);
  }
  effects.splice(0, effects.length, ...effects.filter((effect) => now - effect.at < 1200));
  const frameDelta = Math.min(100, now - client.lastFrameAt);
  client.accumulator += frameDelta;
  client.lastFrameAt = now;
  while (client.accumulator >= 1000 / GAME_CONFIG.network.tickRate) {
    simulationTick();
    client.accumulator -= 1000 / GAME_CONFIG.network.tickRate;
  }
  client.fpsFrames += 1;
  if (now - client.fpsStartedAt >= 1000) {
    client.fps = client.fpsFrames * 1000 / (now - client.fpsStartedAt);
    client.fpsFrames = 0;
    client.fpsStartedAt = now;
  }
  if (client.lastPingAt > 0 && now - client.lastPingAt > 500) client.ping = 0;
  requestAnimationFrame(renderFrame);
}

initializeInputUi();
registerNetListeners();
registerInputListeners();
registerMenuKeyListener();
connect();
requestAnimationFrame(renderFrame);
