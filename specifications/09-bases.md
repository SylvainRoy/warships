# 09 — Bases

## Sites and ownership

- The world MUST have four home sites, one for each player slot, plus the configured number of neutral bases (Q91, Q107).
- Each base MUST have a **40 × 40 u** building on land at the coast and a **60 × 60 u** square harbour of open water directly in front. Bases MUST use existing coasts and MUST NOT change the terrain.
- Any two bases MUST be at least **1,600 u** apart. If the generator cannot place every base, it MUST silently try the next seed.
- A base building MUST show a flag in its owner's colour; a neutral base uses white. A home site MUST remain inactive until its player joins: it has no flag or turret and cannot be captured.
- When a player leaves, their home site becomes inactive and every other base they held becomes neutral.
- Buildings MUST block frigates as land does; cannon shells fly over them.
- A harbour action is valid only while the frigate's whole hull is inside the harbour square.

## Harbour actions

### Resupply

- A frigate in a base it owns MUST be at throttle STOP to resupply. Fuel, shells, and torpedoes refill gradually, from empty to full in the configured **resupply time**.
- Leaving the harbour MUST stop resupply. How partial progress is handled after leaving is **TBD (open point)**.

### Capture

- A frigate may capture a base it does not own by remaining continuously in its harbour for the configured **capture time**; any throttle is allowed.
- Leaving, sinking, or another player's boat entering the harbour MUST reset the capture timer.
- Neutral bases have no turret. An enemy base, including a home base, can be captured only after its turret is destroyed.

### Turret repair or installation

- In an owned harbour, a frigate MUST remain without firing for the configured **repair time** to rebuild a destroyed turret or install one on a captured base.
- Firing MUST restart the repair timer. Turret repair/installation MUST proceed simultaneously with resupply when both actions' conditions are met.
- Whether leaving or sinking preserves or resets partial repair progress is **TBD (open point)**.

The three action times are host settings; their ranges, steps, and defaults are specified in [07-multiplayer.md](07-multiplayer.md).

## Turrets

- An active turret MUST have a range of **600 u** and fire one cannon shell every **3 s** at the nearest enemy boat in range. It aims at the boat's current position without leading.
- A turret MUST ignore spawn-protected boats and boats belonging to its owner. Neutral bases and inactive home sites MUST NOT have turrets.
- Turret shells use the cannon shell's **60 u** blast radius and **10 damage**.
- A turret has **60 HP** and is destroyed by six direct shell hits. Only shells damage turrets; a player's own shells MUST NOT damage that player's turrets.
- A destroyed turret MUST be shown as rubble.

## Home-base loss

- A home base is lost when another player captures it. The original owner loses **5 points** and the capturer gains **5 points**; scores MAY be negative.
- A lost home base MUST return to its original owner automatically after **30 s**, with a full turret.
- Until it returns, the owner MUST respawn at another base they own, or at a random point using the v1 spawning rules if they own no other base.

Whether an original owner can recapture a lost home base before its 30 s return, how that affects the return timer, or what happens if the owner leaves while it runs is **TBD (open point)**. The score for capturing a neutral base is also **TBD (open point)**.

## Open points

- The base-placement algorithm and the reference points used to measure the **1,600 u** separation are **TBD (open point)**.
- Whether a building blocks torpedoes independently of the land it occupies, and whether turret rubble blocks frigates, are **TBD (open point)**.
- How ownership of captured non-home bases is handled when a new map is generated is **TBD (open point)**.
