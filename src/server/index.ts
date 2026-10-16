import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { Room } from "./room.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const clientDirectory = resolve(process.cwd(), "dist/client");
const room = new Room();
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = resolve(clientDirectory, normalize(relative));
  if (!filePath.startsWith(`${clientDirectory}/`) && filePath !== clientDirectory) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  const contentType: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  response.writeHead(200, { "content-type": contentType[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});
const webSockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url ?? "/", "http://localhost").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  webSockets.handleUpgrade(request, socket, head, (webSocket) => webSockets.emit("connection", webSocket, request));
});

webSockets.on("connection", (socket) => room.accept(socket));

server.listen(port, "0.0.0.0", () => {
  room.start();
  const addresses = Object.values(networkInterfaces()).flatMap((items) =>
    (items ?? []).filter((item) => item.family === "IPv4" && !item.internal).map((item) => `http://${item.address}:${port}`),
  );
  process.stdout.write(`Warships listening on port ${port}\n`);
  for (const address of addresses) process.stdout.write(`${address}\n`);
});

const shutdown = () => {
  room.stop();
  webSockets.close();
  server.close();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
