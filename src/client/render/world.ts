import { GAME_CONFIG } from "../../shared/config.js";
import type { Frigate, GameEvent, Shell, Torpedo } from "../../shared/sim.js";
import type { SnapshotFrigate } from "../../shared/protocol.js";
import { colours, ctx } from "../dom.js";
import { floatingNumberStyle, type HitNumber } from "../feedback.js";
import { effects, hitMarkers, hitNumbers, incomeNumbers } from "../gameEvents.js";
import { throttleWaveOffsets } from "../throttleWaves.js";
import {
  client,
  type HitMarker,
  type IncomeNumber,
  type Snapshot,
  type WakeObservation,
  type WakeSample,
} from "../state.js";
import { shouldResetWake, torpedoWakeLength, wakeArmOffset, wakeLife } from "../wake.js";

const wakeTrails = new Map<string, WakeSample[]>();

const wakeObservations = new Map<string, WakeObservation>();

export function sternPoint(sample: WakeSample): { x: number; y: number } {
  return {
    x: sample.x - Math.cos(sample.heading) * GAME_CONFIG.frigate.length / 2,
    y: sample.y - Math.sin(sample.heading) * GAME_CONFIG.frigate.length / 2,
  };
}

export function wakeSpeedFraction(speed: number): number {
  const settingAdjustedSpeed = GAME_CONFIG.frigate.maxForwardSpeed * client.gameSettings.boatSpeedPct / 100;
  return Math.max(0, Math.min(1, Math.abs(speed) / settingAdjustedSpeed));
}

export function wakeArmPoint(sample: WakeSample, now: number, side: number): { x: number; y: number } {
  const age = now - sample.at;
  const offset = wakeArmOffset(age, wakeSpeedFraction(sample.speed), GAME_CONFIG.frigate.beam);
  const stern = sternPoint(sample);
  const perpendicularX = -Math.sin(sample.heading);
  const perpendicularY = Math.cos(sample.heading);
  return {
    x: stern.x + perpendicularX * offset * side,
    y: stern.y + perpendicularY * offset * side,
  };
}

export function drawWakes(frigates: readonly SnapshotFrigate[], now: number): void {
  const present = new Set(frigates.map((frigate) => frigate.playerId));
  for (const playerId of wakeObservations.keys()) {
    if (present.has(playerId)) continue;
    wakeTrails.delete(playerId);
    wakeObservations.delete(playerId);
  }
  for (const frigate of frigates) {
    const history = wakeTrails.get(frigate.playerId) ?? [];
    const last = history[history.length - 1];
    const previousObservation = wakeObservations.get(frigate.playerId);
    const observationJumped = previousObservation !== undefined && shouldResetWake(previousObservation, frigate);
    const observationMoved = previousObservation !== undefined
      && Math.hypot(frigate.x - previousObservation.x, frigate.y - previousObservation.y) > 0.001;
    const observationStatusChanged = previousObservation !== undefined && previousObservation.status !== frigate.status;
    const respawned = observationStatusChanged
      && previousObservation.status !== "alive"
      && frigate.status === "alive";
    const sampleJumped = last !== undefined && shouldResetWake(last, frigate);
    let speed = frigate.speed;
    if (typeof speed !== "number") {
      speed = previousObservation && observationMoved && !observationJumped && !respawned && now > previousObservation.at
        ? (
          (frigate.x - previousObservation.x) * Math.cos(frigate.heading)
          + (frigate.y - previousObservation.y) * Math.sin(frigate.heading)
        ) / (now - previousObservation.at)
        : 0;
    }
    if (!previousObservation || observationMoved || observationJumped || observationStatusChanged) {
      wakeObservations.set(frigate.playerId, {
        x: frigate.x,
        y: frigate.y,
        heading: frigate.heading,
        status: frigate.status,
        at: now,
      });
    }

    if (sampleJumped || respawned) history.length = 0;
    const lastSample = history[history.length - 1];
    if (
      (frigate.status === "alive" || frigate.status === "sinking")
      && Math.abs(speed) > 2
      && (!lastSample || Math.hypot(frigate.x - lastSample.x, frigate.y - lastSample.y) >= 3)
    ) {
      history.push({ x: frigate.x, y: frigate.y, heading: frigate.heading, speed, at: now });
    }

    const currentSamples = history.filter((sample) => now - sample.at < wakeLife(sample.speed));
    if (currentSamples.length > 0) wakeTrails.set(frigate.playerId, currentSamples);
    else wakeTrails.delete(frigate.playerId);
  }

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const history of wakeTrails.values()) {
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const sample = history[index];
      if (!previous || !sample) continue;
      const age = now - sample.at;
      const speedFraction = wakeSpeedFraction(sample.speed);
      const fade = Math.max(0, 1 - age / wakeLife(sample.speed));
      if (fade === 0 || speedFraction === 0) continue;

      const previousStern = sternPoint(previous);
      const currentStern = sternPoint(sample);
      ctx.strokeStyle = `rgba(222, 246, 248, ${0.18 * fade * speedFraction})`;
      ctx.lineWidth = 8 + age * 2;
      ctx.beginPath();
      ctx.moveTo(previousStern.x, previousStern.y);
      ctx.lineTo(currentStern.x, currentStern.y);
      ctx.stroke();

      if (previous.speed <= 2 || sample.speed <= 2) continue;
      ctx.strokeStyle = `rgba(222, 246, 248, ${0.55 * fade * speedFraction})`;
      ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        const previousArm = wakeArmPoint(previous, now, side);
        const currentArm = wakeArmPoint(sample, now, side);
        ctx.beginPath();
        ctx.moveTo(previousArm.x, previousArm.y);
        ctx.lineTo(currentArm.x, currentArm.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function torpedoBubbleJitter(id: string, index: number): number {
  let hash = 2166136261;
  for (let character = 0; character < id.length; character += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(character), 16777619);
  }
  hash = Math.imul(hash ^ index, 16777619);
  return (hash >>> 0) / 0xffffffff * 4 - 2;
}

export function drawTorpedoWake(torpedo: Torpedo): void {
  const travelled = torpedo.elapsed * torpedo.speed;
  const length = torpedoWakeLength(torpedo.speed, travelled);
  if (length <= 0) return;

  ctx.save();
  const tailX = torpedo.x;
  const tailY = torpedo.y;
  const directionX = Math.cos(torpedo.angle);
  const directionY = Math.sin(torpedo.angle);
  const farX = tailX - directionX * length;
  const farY = tailY - directionY * length;
  const gradient = ctx.createLinearGradient(tailX, tailY, farX, farY);
  gradient.addColorStop(0, "rgba(222, 246, 248, .5)");
  gradient.addColorStop(1, "rgba(222, 246, 248, 0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(farX, farY);
  ctx.stroke();

  for (let distance = 12, index = 0; distance <= length; distance += 12, index += 1) {
    const fade = 1 - distance / length;
    if (fade <= 0) continue;
    const jitter = torpedoBubbleJitter(torpedo.id, index);
    const x = tailX - directionX * distance - directionY * jitter;
    const y = tailY - directionY * distance + directionX * jitter;
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = "#def6f8";
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function frigateHidden(frigate: SnapshotFrigate, now: number): boolean {
  if (frigate.status === "waiting") return true;
  return frigate.status === "alive" && now < frigate.spawnProtectedUntil && Math.floor(now * 8) % 2 === 0;
}

export function drawFrigateName(frigate: SnapshotFrigate, now: number): void {
  if (frigateHidden(frigate, now)) return;
  ctx.fillStyle = "#000000";
  ctx.font = "600 13px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(frigate.name, frigate.x, frigate.y - 12);
}

export function drawFrigate(frigate: SnapshotFrigate, now: number, debug: boolean): void {
  if (frigateHidden(frigate, now)) return;
  const sinkingProgress = frigate.status === "sinking"
    ? Math.min(1, (now - frigate.sinkingStartedAt) / GAME_CONFIG.player.sinkAnimation)
    : 0;
  const color = colours[frigate.team] ?? "#d6e9ee";
  ctx.save();
  ctx.translate(frigate.x, frigate.y);
  ctx.rotate(frigate.heading);
  ctx.globalAlpha = 1 - sinkingProgress * 0.8;
  if (frigate.status === "alive") {
    const waveStyle = GAME_CONFIG.effects.throttleWave;
    ctx.strokeStyle = waveStyle.stroke;
    ctx.lineWidth = waveStyle.lineWidth;
    ctx.lineCap = "round";
    for (const offset of throttleWaveOffsets(frigate.throttle)) {
      const direction = offset < 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(offset, -waveStyle.chord / 2);
      ctx.quadraticCurveTo(offset + direction * waveStyle.convexity, 0, offset, waveStyle.chord / 2);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(0, 12, 19, .38)";
  ctx.beginPath();
  ctx.ellipse(-1, 1.5, 15.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = frigate.status === "sinking" ? "#58646a" : color;
  ctx.strokeStyle = "#e9f7f6";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(10, -4);
  ctx.lineTo(-11.5, -4.5);
  ctx.lineTo(-14.5, -2.5);
  ctx.lineTo(-14.5, 2.5);
  ctx.lineTo(-11.5, 4.5);
  ctx.lineTo(10, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(10, 35, 45, .72)";
  ctx.fillRect(-7, -2.5, 8, 5);
  ctx.fillStyle = "rgba(242, 250, 242, .85)";
  ctx.fillRect(2.5, -1, 4, 2);
  if (debug) {
    ctx.strokeStyle = "#ff4d63";
    ctx.lineWidth = 1;
    ctx.strokeRect(-15, -5, 30, 10);
    ctx.strokeStyle = "#faeb68";
    for (const offset of GAME_CONFIG.frigate.collisionCircleOffsets) {
      ctx.beginPath();
      ctx.arc(offset, 0, GAME_CONFIG.frigate.hitCircleRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if (frigate.playerId !== client.ownId) {
    const economy = client.latestSnapshot?.economy?.players.find((player) => player.playerId === frigate.playerId);
    const hullLevel = client.gameSettings.treasures ? economy?.upgrades.hull ?? 0 : 0;
    const maxHp = frigate.maxHp ?? GAME_CONFIG.player.maxHp + hullLevel * GAME_CONFIG.economy.upgrades.hull;
    ctx.fillStyle = "rgba(5, 20, 25, .78)";
    ctx.fillRect(frigate.x - 21, frigate.y + 10, 42, 4);
    ctx.fillStyle = frigate.hp > 35 ? "#62d3b2" : "#ff776c";
    ctx.fillRect(frigate.x - 21, frigate.y + 10, 42 * Math.max(0, frigate.hp / maxHp), 4);
  }
}

export function drawTreasures(treasures: readonly { id: string; x: number; y: number }[], now: number): void {
  for (const treasure of treasures) {
    ctx.save();
    ctx.translate(treasure.x, treasure.y);
    ctx.fillStyle = "#f3c94e";
    ctx.strokeStyle = "#704e17";
    ctx.lineWidth = 1;
    ctx.fillRect(-5, -4, 10, 8);
    ctx.strokeRect(-5, -4, 10, 8);
    ctx.fillStyle = "#ffe88b";
    ctx.fillRect(-5, -5, 10, 2);
    ctx.globalAlpha = .5 + (Math.sin(now / 180 + treasure.x) + 1) * .15;
    ctx.fillStyle = "#fff2ad";
    ctx.beginPath();
    ctx.arc(0, -8, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawShell(shell: Shell): void {
  const progress = Math.max(0, Math.min(1, shell.elapsed / shell.duration));
  const x = shell.startX + (shell.impactX - shell.startX) * progress;
  const y = shell.startY + (shell.impactY - shell.startY) * progress;
  const height = Math.sin(progress * Math.PI) * 48;
  const size = 2.2 + Math.sin(progress * Math.PI) * 2.5;
  const angle = Math.atan2(shell.impactY - shell.startY, shell.impactX - shell.startX);
  ctx.fillStyle = "rgba(0, 11, 17, .3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, size * 2, size * .7, angle, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - height);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(2.6 * size, 0);
  ctx.quadraticCurveTo(1.4 * size, -0.8 * size, 0.4 * size, -0.8 * size);
  ctx.lineTo(-1.6 * size, -0.8 * size);
  ctx.lineTo(-1.6 * size, 0.8 * size);
  ctx.lineTo(0.4 * size, 0.8 * size);
  ctx.quadraticCurveTo(1.4 * size, 0.8 * size, 2.6 * size, 0);
  ctx.closePath();
  ctx.fillStyle = "#0b0d0e";
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(225, 240, 236, .75)";
  ctx.stroke();
  ctx.restore();
}

export function drawTorpedo(torpedo: Torpedo): void {
  ctx.save();
  ctx.translate(torpedo.x, torpedo.y);
  ctx.rotate(torpedo.angle);
  ctx.fillStyle = "#e8f6e9";
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, -3);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-5, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawExplosion(effect: { event: GameEvent; at: number }, now: number): void {
  const event = effect.event;
  if (event.type !== "explosion" || event.x === undefined || event.y === undefined) return;
  const age = (now - effect.at) / 1000;
  const duration = event.kind === "splash" ? 0.7 : 0.45;
  if (age > duration) return;
  const progress = age / duration;
  const radius = event.kind === "hit" ? 9 + progress * 27 : 5 + progress * 38;
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = event.kind === "splash" ? "#b9f0ed" : "#ffd277";
  ctx.lineWidth = 3 - progress * 2;
  ctx.beginPath();
  ctx.arc(event.x, event.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawReticle(frigate: Frigate, now: number): void {
  if (frigate.playerId !== client.ownId || frigate.status !== "alive") return;
  const angle = frigate.heading + frigate.cannonBearing;
  const x = frigate.x + Math.cos(angle) * frigate.cannonRange;
  const y = frigate.y + Math.sin(angle) * frigate.cannonRange;
  const reticleRadius = 30;
  const reloading = Math.max(0, frigate.cannonReadyAt - now);
  const progress = 1 - reloading / client.gameSettings.cannonReload;
  const reticleFlash = performance.now() - client.reticleFlashAt < GAME_CONFIG.effects.reticleFlashDuration * 1000;
  ctx.save();
  ctx.globalAlpha = reticleFlash ? 1 : reloading > 0 ? .35 : .95;
  ctx.strokeStyle = reticleFlash ? "#fff" : "#5dffac";
  ctx.fillStyle = "#5dffac";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, reticleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#5dffac";
  ctx.beginPath();
  ctx.arc(x, y, 1.25, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i += 1) {
    const a = angle + i * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25);
    ctx.lineTo(x + Math.cos(a) * 27.5, y + Math.sin(a) * 27.5);
    ctx.stroke();
  }
  if (reloading > 0) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, reticleRadius + 3.5, angle, angle + Math.PI * 2 * progress);
    ctx.stroke();
  }
  const cannonAxisX = Math.cos(angle);
  const cannonAxisY = Math.sin(angle);
  const cannonPerpendicularX = -cannonAxisY;
  const cannonPerpendicularY = cannonAxisX;
  ctx.beginPath();
  ctx.moveTo(
    frigate.x + cannonAxisX * 70,
    frigate.y + cannonAxisY * 70,
  );
  ctx.lineTo(
    frigate.x + cannonAxisX * 60 + cannonPerpendicularX * 4,
    frigate.y + cannonAxisY * 60 + cannonPerpendicularY * 4,
  );
  ctx.lineTo(
    frigate.x + cannonAxisX * 60 - cannonPerpendicularX * 4,
    frigate.y + cannonAxisY * 60 - cannonPerpendicularY * 4,
  );
  ctx.closePath();
  ctx.fillStyle = "#5dffac";
  ctx.fill();
  const torpedoAngle = frigate.heading + frigate.torpedoBearing;
  const torpedoReload = Math.max(0, frigate.torpedoReadyAt - now);
  const torpedoProgress = 1 - torpedoReload / client.gameSettings.torpedoReload;
  const filled = Math.floor(torpedoProgress * 5);
  const ready = torpedoReload === 0;
  const axisX = Math.cos(torpedoAngle);
  const axisY = Math.sin(torpedoAngle);
  const perpendicularX = -axisY;
  const perpendicularY = axisX;
  const dashLength = (48 - 19 - 4 * 1.5) / 5;
  ctx.strokeStyle = "#7dff70";
  ctx.lineCap = "butt";
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 5; i += 1) {
    const startRadius = 19 + i * (dashLength + 1.5);
    ctx.globalAlpha = ready || i < filled ? .95 : .25;
    ctx.beginPath();
    ctx.moveTo(frigate.x + axisX * startRadius, frigate.y + axisY * startRadius);
    ctx.lineTo(frigate.x + axisX * (startRadius + dashLength), frigate.y + axisY * (startRadius + dashLength));
    ctx.stroke();
  }
  ctx.globalAlpha = ready ? .95 : .25;
  const tipX = frigate.x + axisX * 56;
  const tipY = frigate.y + axisY * 56;
  for (const side of [-1, 1]) {
    const baseX = frigate.x + axisX * 49 + perpendicularX * 4.5 * side;
    const baseY = frigate.y + axisY * 49 + perpendicularY * 4.5 * side;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX, baseY);
    ctx.stroke();
  }
  ctx.globalAlpha = ready ? .95 : .6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(
    frigate.x + axisX * 19 - perpendicularX * 3,
    frigate.y + axisY * 19 - perpendicularY * 3,
  );
  ctx.lineTo(
    frigate.x + axisX * 19 + perpendicularX * 3,
    frigate.y + axisY * 19 + perpendicularY * 3,
  );
  ctx.stroke();
  ctx.restore();
}

export function drawHitFeedback(now: number): void {
  for (let index = hitMarkers.length - 1; index >= 0; index -= 1) {
    const marker = hitMarkers[index];
    if (!marker) continue;
    const age = (now - marker.at) / 1000;
    if (age >= GAME_CONFIG.effects.hitMarkerDuration) {
      hitMarkers.splice(index, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = 1 - age / GAME_CONFIG.effects.hitMarkerDuration;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = GAME_CONFIG.effects.hitMarkerLineWidth;
    for (let arm = 0; arm < 4; arm += 1) {
      const angle = Math.PI / 4 + arm * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(
        marker.x + Math.cos(angle) * GAME_CONFIG.effects.hitMarkerInnerRadius,
        marker.y + Math.sin(angle) * GAME_CONFIG.effects.hitMarkerInnerRadius,
      );
      ctx.lineTo(
        marker.x + Math.cos(angle) * GAME_CONFIG.effects.hitMarkerOuterRadius,
        marker.y + Math.sin(angle) * GAME_CONFIG.effects.hitMarkerOuterRadius,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const [targetKey, hit] of hitNumbers) {
    const age = (now - hit.startedAt) / 1000;
    if (age >= GAME_CONFIG.effects.damageNumberDuration) {
      hitNumbers.delete(targetKey);
      continue;
    }
    const style = floatingNumberStyle(
      age,
      GAME_CONFIG.effects.damageNumberDuration,
      GAME_CONFIG.effects.damageNumberFade,
      GAME_CONFIG.effects.damageNumberRise,
    );
    ctx.save();
    ctx.globalAlpha = style.alpha;
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${GAME_CONFIG.effects.damageNumberFontSize}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `−${Math.max(1, Math.round(hit.amount))}`,
      hit.x,
      hit.y - style.offset,
    );
    ctx.restore();
  }
  for (let index = incomeNumbers.length - 1; index >= 0; index -= 1) {
    const number = incomeNumbers[index];
    if (!number) continue;
    const age = (now - number.startedAt) / 1000;
    if (age >= GAME_CONFIG.baseIncome.feedbackDuration) {
      incomeNumbers.splice(index, 1);
      continue;
    }
    const style = floatingNumberStyle(
      age,
      GAME_CONFIG.baseIncome.feedbackDuration,
      GAME_CONFIG.baseIncome.feedbackFade,
      GAME_CONFIG.baseIncome.feedbackRise,
    );
    ctx.save();
    ctx.globalAlpha = style.alpha;
    ctx.fillStyle = number.money ? GAME_CONFIG.economy.feedback.gold : colours[number.team] ?? "#fff";
    ctx.font = `700 ${GAME_CONFIG.baseIncome.feedbackFontSize}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${number.money ? "+$" : "+"}${number.amount}`, number.x, number.y - style.offset);
    ctx.restore();
  }
}

export function drawDamageVignette(now: number): void {
  const age = now - client.damageVignetteAt;
  if (age < 0 || age >= GAME_CONFIG.effects.vignetteDuration * 1000) return;
  const alpha = 1 - age / (GAME_CONFIG.effects.vignetteDuration * 1000);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
  ctx.clip();
  const centerX = GAME_CONFIG.screen.width / 2;
  const centerY = GAME_CONFIG.screen.height / 2;
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    GAME_CONFIG.effects.vignetteInnerRadius,
    centerX,
    centerY,
    GAME_CONFIG.effects.vignetteOuterRadius,
  );
  gradient.addColorStop(0, "rgba(220, 40, 40, 0)");
  gradient.addColorStop(1, "rgba(220, 40, 40, .35)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_CONFIG.screen.width, GAME_CONFIG.screen.height);
  ctx.restore();
}
