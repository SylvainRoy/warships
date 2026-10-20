import { GAME_CONFIG } from "../../shared/config.js";
import { isLandAt, type World } from "../../shared/world.js";
import { ctx } from "../dom.js";
import { resetRadarSweep } from "../gameEvents.js";
import { client } from "../state.js";
import {
  landColorAt,
  noise,
  noise2,
  resetTerrainStyleCache,
  terrainFields,
  waterColorAtDistance,
} from "../terrainStyle.js";

const worldCache = new Map<string, HTMLCanvasElement>();

const terrainChunkSize = 800;

export function resetWorldCaches(): void {
  worldCache.clear();
  client.radarMapCanvas = null;
  client.radarMapWorld = null;
  resetRadarSweep();
  resetTerrainStyleCache();
}

export function renderTerrain(
  worldState: World,
  cameraX: number,
  cameraY: number,
  viewWidth: number,
  viewHeight: number,
  worldScale: number,
  dpr: number,
): void {
  const resolution = Math.max(1, Math.min(2, Math.ceil(worldScale * dpr)));
  if (resolution !== client.worldCacheResolution) {
    worldCache.clear();
    client.worldCacheResolution = resolution;
  }
  const lastWorldChunkX = Math.ceil(worldState.width / terrainChunkSize) - 1;
  const lastWorldChunkY = Math.ceil(worldState.height / terrainChunkSize) - 1;
  const firstChunkX = Math.max(0, Math.floor(cameraX / terrainChunkSize));
  const lastChunkX = Math.min(lastWorldChunkX, Math.floor((cameraX + viewWidth) / terrainChunkSize));
  const firstChunkY = Math.max(0, Math.floor(cameraY / terrainChunkSize));
  const lastChunkY = Math.min(lastWorldChunkY, Math.floor((cameraY + viewHeight) / terrainChunkSize));
  ctx.fillStyle = "#0f3d55";
  ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, worldState.width, worldState.height);
  ctx.clip();
  for (let cy = firstChunkY; cy <= lastChunkY; cy += 1) {
    for (let cx = firstChunkX; cx <= lastChunkX; cx += 1) {
      const key = `${worldState.seed}:${cx}:${cy}:${resolution}`;
      let chunk = worldCache.get(key);
      if (!chunk) {
        chunk = buildTerrainChunk(worldState, cx, cy, resolution);
        worldCache.set(key, chunk);
      }
      const chunkOriginX = cx * terrainChunkSize - GAME_CONFIG.world.tileSize;
      const chunkOriginY = cy * terrainChunkSize - GAME_CONFIG.world.tileSize;
      const paddedChunkSize = terrainChunkSize + GAME_CONFIG.world.tileSize * 2;
      ctx.drawImage(chunk, chunkOriginX, chunkOriginY, paddedChunkSize, paddedChunkSize);
    }
  }
  ctx.restore();
}

export function sampleTerrainField(worldState: World, field: Float64Array, column: number, row: number): number {
  const x = Math.max(0, Math.min(worldState.columns - 1, column));
  const y = Math.max(0, Math.min(worldState.rows - 1, row));
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(worldState.columns - 1, left + 1);
  const bottom = Math.min(worldState.rows - 1, top + 1);
  const tx = x - left;
  const ty = y - top;
  const upper = (field[top * worldState.columns + left] ?? 0) * (1 - tx)
    + (field[top * worldState.columns + right] ?? 0) * tx;
  const lower = (field[bottom * worldState.columns + left] ?? 0) * (1 - tx)
    + (field[bottom * worldState.columns + right] ?? 0) * tx;
  return upper * (1 - ty) + lower * ty;
}

export function buildTerrainImage(
  worldState: World,
  chunkX: number,
  chunkY: number,
  kind: "water" | "land",
): HTMLCanvasElement {
  const tile = GAME_CONFIG.world.tileSize;
  const chunkTiles = terrainChunkSize / tile;
  const imageMarginTiles = 3;
  const pixelsPerTile = kind === "water" ? 1 : 4;
  const imageTiles = chunkTiles + imageMarginTiles * 2;
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = imageTiles * pixelsPerTile;
  imageCanvas.height = imageTiles * pixelsPerTile;
  const imageContext = imageCanvas.getContext("2d");
  if (!imageContext) return imageCanvas;
  const image = imageContext.createImageData(imageCanvas.width, imageCanvas.height);
  const fields = terrainFields(worldState);
  const firstColumn = chunkX * chunkTiles - imageMarginTiles;
  const firstRow = chunkY * chunkTiles - imageMarginTiles;

  for (let pixelRow = 0; pixelRow < imageCanvas.height; pixelRow += 1) {
    const row = firstRow + (pixelRow + 0.5) / pixelsPerTile - 0.5;
    for (let pixelColumn = 0; pixelColumn < imageCanvas.width; pixelColumn += 1) {
      const column = firstColumn + (pixelColumn + 0.5) / pixelsPerTile - 0.5;
      let color: readonly [number, number, number];
      if (kind === "water") {
        color = waterColorAtDistance(sampleTerrainField(worldState, fields.waterDistance, column, row));
      } else {
        const edge = sampleTerrainField(worldState, fields.landDistance, column, row);
        color = landColorAt(edge, noise(column, row), noise2(column, row));
      }
      const pixel = (pixelRow * imageCanvas.width + pixelColumn) * 4;
      image.data[pixel] = Math.round(color[0]);
      image.data[pixel + 1] = Math.round(color[1]);
      image.data[pixel + 2] = Math.round(color[2]);
      image.data[pixel + 3] = 255;
    }
  }
  imageContext.putImageData(image, 0, 0);
  return imageCanvas;
}

export function buildTerrainChunk(worldState: World, chunkX: number, chunkY: number, resolution: number): HTMLCanvasElement {
  const chunkSize = terrainChunkSize;
  const tile = GAME_CONFIG.world.tileSize;
  const chunkTiles = chunkSize / tile;
  const padding = tile;
  const paddedSize = chunkSize + padding * 2;
  const chunk = document.createElement("canvas");
  chunk.width = Math.ceil(paddedSize * resolution);
  chunk.height = Math.ceil(paddedSize * resolution);
  const terrain = chunk.getContext("2d", { alpha: false });
  if (!terrain) return chunk;
  terrain.scale(resolution, resolution);
  terrain.fillStyle = "#0f3d55";
  terrain.fillRect(0, 0, paddedSize, paddedSize);
  const landCases: string[][][] = [
    [],
    [["tl", "t", "l"]],
    [["tr", "r", "t"]],
    [["tl", "tr", "r", "l"]],
    [["br", "b", "r"]],
    [["tl", "t", "l"], ["br", "b", "r"]],
    [["tr", "br", "b", "t"]],
    [["tl", "tr", "br", "b", "l"]],
    [["bl", "l", "b"]],
    [["tl", "t", "b", "bl"]],
    [["tr", "r", "t"], ["bl", "l", "b"]],
    [["tl", "tr", "r", "b", "bl", "l"]],
    [["bl", "br", "r", "l"]],
    [["tl", "t", "r", "br", "bl", "l"]],
    [["t", "tr", "br", "bl", "l"]],
    [["tl", "tr", "br", "bl"]],
  ];
  const polygonMarginTiles = 3;
  const startColumn = Math.max(0, chunkX * chunkTiles - polygonMarginTiles);
  const endColumn = Math.min(worldState.columns - 2, chunkX * chunkTiles + chunkTiles + polygonMarginTiles - 1);
  const startRow = Math.max(0, chunkY * chunkTiles - polygonMarginTiles);
  const endRow = Math.min(worldState.rows - 2, chunkY * chunkTiles + chunkTiles + polygonMarginTiles - 1);
  const landPath = new Path2D();
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const topLeft = isLandAt(worldState, column * tile + tile / 2, row * tile + tile / 2);
      const topRight = isLandAt(worldState, (column + 1) * tile + tile / 2, row * tile + tile / 2);
      const bottomRight = isLandAt(worldState, (column + 1) * tile + tile / 2, (row + 1) * tile + tile / 2);
      const bottomLeft = isLandAt(worldState, column * tile + tile / 2, (row + 1) * tile + tile / 2);
      const code = Number(topLeft) | (Number(topRight) << 1) | (Number(bottomRight) << 2) | (Number(bottomLeft) << 3);
      const polygons = landCases[code] ?? [];
      if (polygons.length === 0) continue;
      const x = column * tile - chunkX * chunkSize + padding;
      const y = row * tile - chunkY * chunkSize + padding;
      const points: Record<string, [number, number]> = {
        tl: [x, y],
        t: [x + tile / 2, y],
        tr: [x + tile, y],
        r: [x + tile, y + tile / 2],
        br: [x + tile, y + tile],
        b: [x + tile / 2, y + tile],
        bl: [x, y + tile],
        l: [x, y + tile / 2],
      };
      for (const polygon of polygons) {
        const firstKey = polygon[0];
        const first = firstKey ? points[firstKey] : undefined;
        if (!first) continue;
        landPath.moveTo(first[0], first[1]);
        for (const key of polygon.slice(1)) {
          const point = points[key];
          if (point) landPath.lineTo(point[0], point[1]);
        }
        landPath.closePath();
      }
    }
  }

  terrain.imageSmoothingEnabled = true;
  const imageOffset = -tile * 2;
  const imageSize = paddedSize + tile * 4;
  const waterImage = buildTerrainImage(worldState, chunkX, chunkY, "water");
  terrain.drawImage(waterImage, imageOffset, imageOffset, imageSize, imageSize);
  terrain.lineJoin = "round";
  terrain.lineCap = "round";
  terrain.strokeStyle = "rgba(255, 255, 255, .15)";
  terrain.lineWidth = 12;
  terrain.stroke(landPath);
  terrain.strokeStyle = "rgba(255, 255, 255, .6)";
  terrain.lineWidth = 5;
  terrain.stroke(landPath);
  const landImage = buildTerrainImage(worldState, chunkX, chunkY, "land");
  terrain.save();
  terrain.clip(landPath);
  terrain.drawImage(landImage, imageOffset, imageOffset, imageSize, imageSize);
  terrain.restore();
  return chunk;
}
