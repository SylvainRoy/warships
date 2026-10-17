import WebSocket from "ws";
import { INPUT_KEYS, type Shell, type Torpedo } from "../src/shared/sim.js";
import type { ServerMessage } from "../src/shared/protocol.js";

const address = process.env.WARSHIPS_WS ?? "ws://127.0.0.1:8080/ws";
const timeoutMs = 10_000;
type SnapshotMessage = Extract<ServerMessage, { type: "snapshot" }>;
type ProjectilesMessage = Extract<ServerMessage, { type: "projectiles" }>;
const clients = new Set<Client>();

class Client {
  readonly socket = new WebSocket(address);
  readonly messages: ServerMessage[] = [];
  readonly projectileMessages: ProjectilesMessage[] = [];
  snapshotTimes: number[] = [];
  latestSnapshot: SnapshotMessage | undefined;
  latestSnapshotAt = 0;
  private readonly liveShells = new Map<string, { shell: Shell; serverTime: number }>();
  private readonly liveTorpedoes = new Map<string, Torpedo>();
  receivedBytes = 0;
  bytesByType: Record<string, number> = {};
  maxShellsAlive = 0;
  maxTorpedoesAlive = 0;
  cannonFiresSent = 0;
  torpedoFiresSent = 0;
  private measuring = false;

  constructor() {
    clients.add(this);
    this.socket.on("message", (data) => {
      const encoded = data.toString();
      const bytes = Buffer.byteLength(encoded);
      if (this.measuring) this.receivedBytes += bytes;
      const message = JSON.parse(encoded) as ServerMessage;
      if (this.measuring) this.bytesByType[message.type] = (this.bytesByType[message.type] ?? 0) + bytes;
      this.messages.push(message);
      if (message.type === "snapshot") {
        this.snapshotTimes.push(Date.now());
        this.latestSnapshot = message;
        this.latestSnapshotAt = Date.now();
      } else if (message.type === "projectiles") {
        this.projectileMessages.push(message);
        if (message.reset) {
          this.liveShells.clear();
          this.liveTorpedoes.clear();
        }
        for (const id of message.removed) {
          this.liveShells.delete(id);
          this.liveTorpedoes.delete(id);
        }
        for (const shell of message.shells) this.liveShells.set(shell.id, { shell, serverTime: message.serverTime });
        for (const torpedo of message.torpedoes) this.liveTorpedoes.set(torpedo.id, torpedo);
        this.pruneExpiredShells(message.serverTime);
        this.updateMaxProjectileCounts();
      }
    });
  }

  private pruneExpiredShells(serverTime: number): void {
    for (const [id, stored] of this.liveShells) {
      if (stored.shell.elapsed + serverTime - stored.serverTime >= stored.shell.duration) this.liveShells.delete(id);
    }
  }

  private updateMaxProjectileCounts(): void {
    this.maxShellsAlive = Math.max(this.maxShellsAlive, this.liveShells.size);
    this.maxTorpedoesAlive = Math.max(this.maxTorpedoesAlive, this.liveTorpedoes.size);
  }

  async open(): Promise<void> {
    await waitFor(() => this.socket.readyState === WebSocket.OPEN);
    this.send({ type: "hello" });
  }

  send(message: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  async waitFor<T extends ServerMessage["type"]>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    return waitFor(() => this.messages.find((message) => message.type === type) as Extract<ServerMessage, { type: T }> | undefined);
  }

  close(): void {
    this.socket.close();
  }

  startMeasuring(): void {
    this.receivedBytes = 0;
    this.bytesByType = {};
    this.maxShellsAlive = 0;
    this.maxTorpedoesAlive = 0;
    if (this.latestSnapshot) this.pruneExpiredShells(this.latestSnapshot.serverTime);
    this.updateMaxProjectileCounts();
    this.measuring = true;
  }

  stopMeasuring(): void {
    this.measuring = false;
  }
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (value !== undefined && value !== false) return value as T;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  const players = [new Client(), new Client()];
  await Promise.all(players.map((player) => player.open()));
  players[0]!.send({ type: "join", name: `Smoke-${Date.now() % 100_000}` });
  players[1]!.send({ type: "join", name: `Gunner-${Date.now() % 100_000}` });
  const [firstWelcome, secondWelcome] = await Promise.all(players.map((player) => player.waitFor("welcome")));
  await Promise.all(players.map((player) => player.waitFor("snapshot")));
  const start = Date.now();
  while (Date.now() - start < 1200) await new Promise((resolve) => setTimeout(resolve, 100));
  const snapshotCounts = players.map((player) => player.snapshotTimes.filter((time) => time >= start).length);
  if (snapshotCounts.some((count) => count < 15)) throw new Error(`Snapshot rate below 15/s: ${snapshotCounts.join(", ")}`);

  const initial = players[0]!.messages.find((message) => message.type === "snapshot") as Extract<ServerMessage, { type: "snapshot" }>;
  const initialFrigate = initial.frigates.find((frigate) => frigate.playerId === firstWelcome!.playerId);
  if (!initialFrigate) throw new Error("First player's frigate missing from snapshot");
  let seqA = 0;
  let seqB = 0;
  for (let tick = 0; tick < 72; tick += 1) {
    players[0]!.send({
      type: "input",
      seq: ++seqA,
      keys: 0,
      throttle: 3,
      fireCannon: false,
      fireTorpedo: false,
    });
    players[1]!.send({
      type: "input",
      seq: ++seqB,
      keys: 0,
      throttle: 0,
      fireCannon: tick === 0,
      fireTorpedo: tick === 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000 / 30));
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  const latest = players[0]!.messages.filter((message) => message.type === "snapshot").at(-1) as Extract<ServerMessage, { type: "snapshot" }>;
  const moved = latest.frigates.find((frigate) => frigate.playerId === firstWelcome!.playerId);
  if (!moved || Math.hypot(moved.x - initialFrigate.x, moved.y - initialFrigate.y) < 20) {
    throw new Error("Forward input did not move the frigate");
  }
  const projectileMessages = players[1]!.projectileMessages;
  if (!projectileMessages.some((message) => message.shells.length > 0)) {
    throw new Error("No cannon shell appeared in projectiles messages");
  }
  if (!projectileMessages.some((message) => message.torpedoes.length > 0)) {
    throw new Error("No torpedo appeared in projectiles messages");
  }

  const extra = [new Client(), new Client()];
  await Promise.all(extra.map((player) => player.open()));
  extra[0]!.send({ type: "join", name: `Third-${Date.now() % 100_000}` });
  extra[1]!.send({ type: "join", name: `Fourth-${Date.now() % 100_000}` });
  const extraWelcomes = await Promise.all(extra.map((player) => player.waitFor("welcome")));
  const fifth = new Client();
  await fifth.open();
  fifth.send({ type: "join", name: `Fifth-${Date.now() % 100_000}` });
  const full = await fifth.waitFor("error");
  if (full.code !== "full") throw new Error(`Expected full error, received ${full.code}`);
  fifth.close();

  const allPlayers = [...players, ...extra];
  const allWelcomes = [firstWelcome, secondWelcome, ...extraWelcomes];
  await Promise.all(allPlayers.map((player) => player.waitFor("snapshot")));
  allPlayers.forEach((player) => player.startMeasuring());
  const sequences = [seqA, seqB, 0, 0];
  const measurementStartedAt = Date.now();
  const measurementDurationMs = 20_000;
  while (Date.now() - measurementStartedAt < measurementDurationMs) {
    const now = Date.now();
    allPlayers.forEach((player, index) => {
      const snapshot = player.latestSnapshot;
      const playerId = allWelcomes[index]!.playerId;
      const frigate = snapshot?.frigates.find((candidate) => candidate.playerId === playerId);
      const serverTime = snapshot
        ? snapshot.serverTime + (now - player.latestSnapshotAt) / 1000
        : 0;
      const alive = frigate?.status === "alive";
      const fireCannon = Boolean(alive && typeof frigate?.cannonReadyAt === "number" && serverTime >= frigate.cannonReadyAt);
      const fireTorpedo = Boolean(alive && typeof frigate?.torpedoReadyAt === "number" && serverTime >= frigate.torpedoReadyAt);
      const seq = (sequences[index] ?? 0) + 1;
      sequences[index] = seq;
      player.send({
        type: "input",
        seq,
        keys: INPUT_KEYS.turnRight,
        throttle: 3,
        fireCannon,
        fireTorpedo,
      });
      if (fireCannon) player.cannonFiresSent += 1;
      if (fireTorpedo) player.torpedoFiresSent += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 1000 / 30));
  }
  const measurementElapsedMs = Date.now() - measurementStartedAt;
  allPlayers.forEach((player) => player.stopMeasuring());
  const bandwidth = allPlayers.map((player, index) => ({
    playerId: allWelcomes[index]!.playerId,
    receivedBytes: player.receivedBytes,
    bytesPerSecond: Math.round(player.receivedBytes * 1000 / measurementElapsedMs),
    bytesByType: player.bytesByType,
    maxShellsAlive: player.maxShellsAlive,
    maxTorpedoesAlive: player.maxTorpedoesAlive,
  }));
  if (bandwidth.some((client) => client.bytesPerSecond >= 50_000)) {
    throw new Error(`Bandwidth exceeded 50,000 B/s per client: ${JSON.stringify(bandwidth)}`);
  }
  if (allPlayers.some((player) => player.cannonFiresSent < 5 || player.torpedoFiresSent < 2)) {
    throw new Error(`Insufficient sustained fire inputs: ${JSON.stringify(allPlayers.map(({ cannonFiresSent, torpedoFiresSent }) => ({ cannonFiresSent, torpedoFiresSent })))}`);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    snapshotCounts,
    movedDistance: Math.round(Math.hypot(moved.x - initialFrigate.x, moved.y - initialFrigate.y)),
    cannonVisible: true,
    torpedoVisible: true,
    fifthClient: full.code,
    playerIds: allWelcomes.map((welcome) => welcome!.playerId),
    combatSeconds: Math.round(measurementElapsedMs / 1000),
    bandwidthBytesPerSecond: bandwidth,
    maxTorpedoesAlive: Math.max(...allPlayers.map((player) => player.maxTorpedoesAlive)),
    fireInputsSent: allPlayers.map(({ cannonFiresSent, torpedoFiresSent }) => ({ cannonFiresSent, torpedoFiresSent })),
  }, null, 2) + "\n");
  for (const client of [...players, ...extra, fifth]) client.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
  for (const client of clients) client.close();
});
