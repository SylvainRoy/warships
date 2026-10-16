# 02 — World

## Units

Physical sizes like "2 cm" depend on the player's monitor, so the game uses an abstract **world unit (u)**.

- The **reference screen** (the area a player sees) is **1600 u × 900 u** (16:9).
- The browser canvas scales the reference screen to fit the window (letterboxing if the aspect ratio differs). Every player therefore sees **exactly the same area** of the world whatever their resolution: no player gets an advantage from a bigger monitor.
- On a typical 24" 1920 × 1080 monitor in full screen, 1 u ≈ 0.33 mm, so a 60 u frigate ≈ 2 cm, matching the original intent.

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
- Target land coverage: **20–30 %** of the world, made of:
  - a dozen large islands / land masses,
  - many small islands (some just a few tiles), giving cover against torpedoes.
- **Connectivity MUST be guaranteed**: after generation, a flood fill identifies water regions; every water region not connected to the largest one is turned into land (or connected by carving a channel). Result: all water is reachable by any frigate.
- **Navigability**: channels between land MUST be at least 3 frigate widths wide (≈ 60 u), otherwise they are widened or filled. Prevents frigates getting stuck in slivers.
- The host can regenerate the world at any time (new random seed), see [07-multiplayer.md](07-multiplayer.md).

## Camera

- The camera is centred on the player's own frigate and does not rotate (north is always up).
- Near world edges the camera clamps so it never shows outside the world (the frigate is then off-centre).
- There is **no minimap**: players only know the part of the world they can see.

## Visibility

No fog of war: anything inside the player's viewport is visible.
