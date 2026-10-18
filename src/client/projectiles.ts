import type { ServerMessage } from "../shared/protocol.js";
import type { Shell, Torpedo } from "../shared/sim.js";
import type { World } from "../shared/world.js";

type ProjectileMessage = Extract<ServerMessage, { type: "projectiles" }>;

export class ProjectileStore {
  private readonly shells = new Map<string, { projectile: Shell; serverTime: number }>();
  private readonly torpedoes = new Map<string, { projectile: Torpedo; serverTime: number }>();

  apply(message: ProjectileMessage): void {
    if (message.reset) this.clear();
    for (const id of message.removed) {
      this.shells.delete(id);
      this.torpedoes.delete(id);
    }
    for (const shell of message.shells) {
      this.shells.set(shell.id, { projectile: { ...shell }, serverTime: message.serverTime });
    }
    for (const torpedo of message.torpedoes) {
      this.torpedoes.set(torpedo.id, { projectile: { ...torpedo }, serverTime: message.serverTime });
    }
  }

  at(serverTime: number, world: Pick<World, "width" | "height">): { shells: Shell[]; torpedoes: Torpedo[] } {
    const shells: Shell[] = [];
    for (const [id, stored] of this.shells) {
      const elapsed = stored.projectile.elapsed + serverTime - stored.serverTime;
      if (serverTime < stored.serverTime || elapsed < 0) continue;
      if (elapsed >= stored.projectile.duration) {
        this.shells.delete(id);
        continue;
      }
      shells.push({ ...stored.projectile, elapsed });
    }

    const torpedoes: Torpedo[] = [];
    for (const [id, stored] of this.torpedoes) {
      const delta = serverTime - stored.serverTime;
      if (delta < 0) continue;
      const x = stored.projectile.x + Math.cos(stored.projectile.angle) * stored.projectile.speed * delta;
      const y = stored.projectile.y + Math.sin(stored.projectile.angle) * stored.projectile.speed * delta;
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
        this.torpedoes.delete(id);
        continue;
      }
      torpedoes.push({
        ...stored.projectile,
        x,
        y,
        elapsed: stored.projectile.elapsed + delta,
      });
    }

    return { shells, torpedoes };
  }

  clear(): void {
    this.shells.clear();
    this.torpedoes.clear();
  }
}
