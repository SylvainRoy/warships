export function wakeArmOffset(age: number, speedFraction: number, beam: number): number {
  return beam / 2 + age * 16 * speedFraction;
}

export function torpedoWakeLength(speed: number, travelled: number): number {
  return Math.min(speed * 1.25, travelled);
}

export function shouldResetWake(prev: { x: number; y: number }, next: { x: number; y: number }): boolean {
  return Math.hypot(next.x - prev.x, next.y - prev.y) > 50;
}

export function wakeLife(speed: number): number {
  return speed < 0 ? 1 : 3;
}
