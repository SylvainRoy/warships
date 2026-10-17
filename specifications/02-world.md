# 02 — World

## Units

Physical sizes like "2 cm" depend on the player's monitor, so the game uses an abstract **world unit (u)**.

- The **reference screen** is **1600 u × 900 u** (16:9).
- The browser canvas fits the reference screen inside the window, leaving plain dark **#071b2a** bands when the aspect ratio differs; no terrain appears in the bands. Every player sees exactly **1600 × 900 u**, so the visible area does not depend on window shape.
- On a typical 24" 1920 × 1080 monitor in full screen, 1 u ≈ 0.33 mm, so a 30 u frigate ≈ 1 cm.

## Dimensions

- World size: **10 × 10 screens = 16 000 u × 9 000 u**, i.e. 10 reference screens horizontally and 10 vertically.
- The world is bounded: its border is an impassable edge (rendered as a coastline/cliff). It does not wrap around.

## Terrain

Two terrain types, stored as a grid of **tiles of 20 u × 20 u** (800 × 450 tiles):

- **Water** — navigable; torpedoes travel through it.
- **Land** — islands and larger land masses (including coasts along the world border). Blocks frigates and torpedoes. Cannon balls fly over it.

Rendering MAY smooth tile edges (e.g. marching squares) so coasts look natural; collision uses the same smoothed shape or the tile grid (implementation choice, must be identical on server and client).

## Generation

- The world is generated procedurally from a **seed** (integer) on the server. Clients receive the seed + generation algorithm version, or the tile grid itself (implementation choice).
- The host's **Land coverage** setting controls the target share of the map: **5–40 %** in 5-point steps, default **25 %**. Generation accepts a result within **±2.5 percentage points** of the target; targets above 40 % are unsupported because generation may fail.
- Land is made of:
  - a dozen large islands / land masses,
  - many small islands (some just a few tiles), giving cover against torpedoes.
- **Connectivity MUST be guaranteed**: after generation, a flood fill identifies water regions; every water region not connected to the largest one is turned into land (or connected by carving a channel). Result: all water is reachable by any frigate.
- **Navigability**: channels between land MUST be at least 8 tiles (160 u) wide. Every water tile MUST belong to at least one all-water 8 × 8-tile square; narrower passages are filled. Prevents frigates getting stuck in slivers.
- The host can regenerate the world at any time (new random seed), see [07-multiplayer.md](07-multiplayer.md).

## Camera

- The camera is centred on the player's own frigate, does not rotate (north is always up), and clamps at the world edges so it never shows beyond the world.
- The cannon reticle stays at its true world position and may be off screen; it does not affect camera framing.
- There is **no minimap**: players only know the part of the world they can see.

## Visibility

No fog of war: anything inside the player's viewport is visible.
