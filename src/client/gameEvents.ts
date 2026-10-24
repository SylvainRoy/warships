import { GAME_CONFIG } from "../shared/config.js";
import type { GameEvent, Shell, Torpedo } from "../shared/sim.js";
import type { ServerMessage } from "../shared/protocol.js";
import { computeCamera } from "./camera.js";
import { colours } from "./dom.js";
import { SynthAudio, type SoundPosition } from "./audio.js";
import {
  damageTargetKey,
  DEFAULT_EFFECTS_SETTINGS,
  EFFECTS_STORAGE_KEY,
  formatHitFeedLine,
  mergeHitFeedLine,
  mergeHitNumber,
  parseEffectsSettings,
  type EffectsSettings,
  type HitFeedLine,
  type HitNumber,
} from "./feedback.js";
import { RadarSweep } from "./radar.js";
import {
  client,
  type HitMarker,
  type IncomeNumber,
  type PendingHitFeed,
  type PendingSplashSound,
  type Snapshot,
} from "./state.js";

export const audio = new SynthAudio();

export const radarSweep = new RadarSweep(
  (team) => colours[team] ?? "#fff",
  () => audio.play("radar-ping", { own: true, gain: GAME_CONFIG.audio.radarGain }),
);

export const effects: Array<{ event: GameEvent; at: number }> = [];

export const feed: Array<{ text: string; at: number; hit?: HitFeedLine }> = [];

export const hitMarkers: HitMarker[] = [];

export const hitNumbers = new Map<string, HitNumber>();

export const incomeNumbers: IncomeNumber[] = [];

export const pendingHitFeed: PendingHitFeed[] = [];

export const recentSinkTimes = new Map<string, { at: number; playerId?: string }>();

export const knownPositions = new Map<string, { x: number; y: number }>();

export const ownDamageTimes: Array<{ at: number; amount: number }> = [];

export const pendingSplashSounds: PendingSplashSound[] = [];

export function storedEffects(): string | null {
  try {
    return localStorage.getItem(EFFECTS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function listenerPosition(): { x: number; y: number } {
  const own = client.predictedOwn ?? client.latestSnapshot?.frigates.find((frigate) => frigate.playerId === client.ownId);
  if (!own) return { x: 0, y: 0 };
  if ((own.status === "alive" && !client.ownSinking) || !client.world) return { x: own.x, y: own.y };
  const camera = computeCamera({ x: own.x, y: own.y }, client.world);
  return {
    x: camera.x + GAME_CONFIG.screen.width / 2,
    y: camera.y + GAME_CONFIG.screen.height / 2,
  };
}

export function worldSoundPosition(x: number, y: number): SoundPosition {
  const listener = listenerPosition();
  return { distance: Math.hypot(x - listener.x, y - listener.y), dx: x - listener.x };
}

export function saveEffectsSettings(next: EffectsSettings): void {
  client.effectsSettings = next;
  audio.setVolume(next.volume);
  try {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the current settings for this session if storage is unavailable.
  }
}

export function resetRadarSweep(): void {
  radarSweep.clear();
  client.previousRadarSweepAngle = null;
  client.radarSweepOwnerId = client.ownId;
  client.radarSweepRange = null;
  client.radarOwnStatus = null;
}

export function playProjectileSounds(message: Extract<ServerMessage, { type: "projectiles" }>): void {
  if (message.reset) return;
  const playerShells = new Map<string, Shell>();
  const turretShells = new Map<string, Shell>();
  const torpedoSpreads = new Map<string, Torpedo>();
  for (const shell of message.shells) {
    if (shell.turretBaseId) turretShells.set(shell.turretBaseId, shell);
    else playerShells.set(shell.ownerId, shell);
  }
  for (const torpedo of message.torpedoes) torpedoSpreads.set(torpedo.ownerId, torpedo);
  for (const shell of playerShells.values()) {
    const position = shell.ownerId === client.ownId
      ? { own: true }
      : worldSoundPosition(shell.startX, shell.startY);
    audio.play("cannon-fire", position);
  }
  for (const shell of turretShells.values()) {
    audio.play("turret-fire", worldSoundPosition(shell.startX, shell.startY));
  }
  for (const torpedo of torpedoSpreads.values()) {
    const position = torpedo.ownerId === client.ownId
      ? { own: true }
      : worldSoundPosition(torpedo.x, torpedo.y);
    audio.play("torpedo-launch", position);
  }
}

export function cancelPendingSplashAt(x: number, y: number): void {
  for (let index = pendingSplashSounds.length - 1; index >= 0; index -= 1) {
    const splash = pendingSplashSounds[index];
    if (!splash || Math.hypot(splash.x - x, splash.y - y) > GAME_CONFIG.cannon.damageRadius) continue;
    window.clearTimeout(splash.timer);
    pendingSplashSounds.splice(index, 1);
  }
}

export function handleGameEvent(event: GameEvent, at: number): void {
  if (event.type === "explosion" && event.x !== undefined && event.y !== undefined) {
    if (event.cause === "torpedo" && event.kind === "hit") {
      audio.play("torpedo-hit", worldSoundPosition(event.x, event.y));
    } else if (event.cause !== "torpedo" && event.kind === "splash") {
      const splash: PendingSplashSound = { x: event.x, y: event.y, timer: 0 };
      splash.timer = window.setTimeout(() => {
        const index = pendingSplashSounds.indexOf(splash);
        if (index < 0) return;
        pendingSplashSounds.splice(index, 1);
        audio.play("splash", worldSoundPosition(splash.x, splash.y));
      }, GAME_CONFIG.audio.splashDelayMs);
      pendingSplashSounds.push(splash);
    } else if (event.cause !== "torpedo" && event.kind === "land") {
      cancelPendingSplashAt(event.x, event.y);
      audio.play("shell-explosion", worldSoundPosition(event.x, event.y));
    } else if (event.cause !== "torpedo" && event.kind === "hit") {
      cancelPendingSplashAt(event.x, event.y);
      audio.play("shell-explosion", worldSoundPosition(event.x, event.y));
    }
  } else if (event.type === "sank" && event.targetId) {
    if (event.targetId === client.ownId) client.ownSinking = true;
    const position = knownPositions.get(event.targetId);
    if (position) audio.play("sinking", worldSoundPosition(position.x, position.y));
    recentSinkTimes.set(`frigate:${event.targetId}`, {
      at,
      ...(event.playerId ? { playerId: event.playerId } : {}),
    });
  } else if (event.type === "damage") {
    if (event.x !== undefined && event.y !== undefined && (event.cause === "shell" || event.cause === "turret")) {
      cancelPendingSplashAt(event.x, event.y);
    }
    handleDamageEvent(event, at);
  } else if (event.type === "income") {
    const ownTeam = client.latestSnapshot?.players.find((player) => player.playerId === client.ownId)?.team;
    if (event.x !== undefined && event.y !== undefined && event.team !== undefined && event.team === ownTeam) {
      incomeNumbers.push({
        x: event.x,
        y: event.y,
        team: event.team,
        amount: event.amount ?? GAME_CONFIG.baseIncome.payout,
        startedAt: at,
      });
    }
    if (event.team !== undefined && event.team === ownTeam) {
      audio.play("coin", { own: true, gain: GAME_CONFIG.baseIncome.coinGain });
    }
  } else if (event.playerId === client.ownId && event.type === "capture") {
    audio.play("chime", { own: true });
  } else if (event.playerId === client.ownId && event.type === "turret" && /installed|repaired/i.test(event.message ?? "")) {
    audio.play("chime", { own: true });
  } else if (event.playerId === client.ownId && event.type === "repairInterrupted") {
    addFeed("Repairs interrupted — leave the harbour and come back");
  }
}

export function handleDamageEvent(event: GameEvent, at: number): void {
  if (event.amount === undefined || event.x === undefined || event.y === undefined) return;
  if (event.targetId === client.ownId) {
    audio.play("own-damage", { own: true });
    ownDamageTimes.push({ at, amount: event.amount });
    client.damageVignetteAt = at;
  }
  const targetKey = damageTargetKey(event);
  if (
    !targetKey
    || event.playerId !== client.ownId
    || event.cause === "turret"
    || (event.targetId === client.ownId)
  ) return;

  const hit = mergeHitNumber(
    hitNumbers.get(targetKey),
    { targetKey, x: event.x, y: event.y, amount: event.amount },
    at,
  );
  hitNumbers.set(targetKey, hit);
  hitMarkers.push({ x: event.x, y: event.y, at });
  if (event.cause === "shell") client.reticleFlashAt = at;
  pendingHitFeed.push({
    targetKey,
    ...(event.targetId ? { targetId: event.targetId } : {}),
    label: hitFeedLabel(event),
    amount: event.amount,
    at,
  });
}

export function hitFeedLabel(event: GameEvent): string {
  if (event.baseId) {
    const ownerTeam = client.bases.find((base) => base.id === event.baseId)?.ownerTeam;
    const ownerName = client.latestSnapshot?.players.find((player) => player.team === ownerTeam)?.name ?? "Unknown";
    return `You hit ${ownerName}'s turret`;
  }
  const targetName = client.latestSnapshot?.frigates.find((frigate) => frigate.playerId === event.targetId)?.name
    ?? client.latestSnapshot?.players.find((player) => player.playerId === event.targetId)?.name
    ?? "Unknown";
  return `You hit ${targetName}`;
}

export function flushPendingHitFeed(now: number): void {
  for (let index = pendingHitFeed.length - 1; index >= 0; index -= 1) {
    const pending = pendingHitFeed[index];
    if (!pending || now - pending.at < GAME_CONFIG.effects.damageFeedDelayMs) continue;
    pendingHitFeed.splice(index, 1);
    const sink = recentSinkTimes.get(pending.targetKey);
    if (
      sink?.playerId === client.ownId
      && sink.at >= pending.at
      && sink.at - pending.at <= GAME_CONFIG.effects.sinkSuppressionWindowMs
    ) continue;
    const existing = [...feed].reverse().find((entry) => entry.hit?.targetKey === pending.targetKey);
    const previous = existing?.hit;
    const updated = mergeHitFeedLine(
      previous ? [previous] : [],
      { targetKey: pending.targetKey, label: pending.label, amount: pending.amount },
      now,
    )[0];
    if (!updated) continue;
    if (existing && now - existing.at <= GAME_CONFIG.effects.feedMergeWindowMs) {
      existing.text = formatHitFeedLine(updated);
      existing.at = now;
      existing.hit = updated;
    } else {
      feed.push({ text: formatHitFeedLine(updated), at: now, hit: updated });
      feed.splice(0, Math.max(0, feed.length - 8));
    }
  }
}

export function addFeed(text: string): void {
  feed.push({ text, at: performance.now() });
  feed.splice(0, Math.max(0, feed.length - 8));
}

export function initializeGameEvents(): void {
  client.effectsSettings = parseEffectsSettings(storedEffects());
  audio.setVolume(client.effectsSettings.volume);
}
