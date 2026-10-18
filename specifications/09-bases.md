# 09 — Bases

## Sites and ownership

- The world MUST have four home sites, one for each player slot, plus the configured number of neutral bases (Q91, Q107).
- Each base MUST have a **40 × 40 u** building on land at the coast and a **60 × 60 u** square harbour of open water directly in front. Bases MUST use existing coasts and MUST NOT change the terrain.
- Any two bases MUST be at least **1,600 u** apart, measured between their harbour centres (Q92, Q120). If the generator cannot place every base, it MUST silently try the next seed (Q93). The placement algorithm is an implementation detail.
- A base building MUST show a flag in its owner's colour; a neutral base uses white. A home site MUST remain inactive until its player joins: it has no flag or turret and cannot be captured.
- When a player's **10 s** reconnect grace expires, their home site becomes inactive and every other base they held becomes neutral (Q91, Q117).
- Buildings MUST block frigates as land does; cannon shells fly over them. Because buildings stand on land, torpedoes stop there; turret rubble adds no additional blocking (Q93, Q120).
- A harbour action is valid only while the frigate's whole hull is inside the harbour square.

## Harbour actions

### Resupply

- A frigate in a base it owns MUST be at throttle STOP to resupply. Fuel, shells, and torpedoes refill gradually, from empty to full in the configured **resupply time**.
- Leaving the harbour MUST stop resupply; fuel and ammunition already refilled remain on board (Q112).

### Capture

- A frigate may capture a base it does not own by remaining continuously in its harbour for the configured **capture time**; any throttle is allowed.
- Leaving, sinking, or another player's boat entering the harbour MUST reset the capture timer.
- Neutral bases have no turret. An enemy base, including a home base, can be captured only after its turret is destroyed.
- Capturing a neutral base or a non-home enemy base awards no points (Q115).

### Turret repair or installation

- In an owned harbour, a frigate MUST remain without firing for the configured **repair time** to rebuild a destroyed turret or install one on a captured base.
- Firing, leaving the harbour, or sinking MUST restart the repair timer from zero (Q97, Q113). Turret repair/installation MUST proceed simultaneously with resupply when both actions' conditions are met.

The three action times are host settings; their ranges, steps, and defaults are specified in [07-multiplayer.md](07-multiplayer.md).

## Turrets

- An active turret MUST have a range of **600 u** and fire one cannon shell every **3 s** at the nearest enemy boat in range. It aims at the boat's current position without leading.
- A turret MUST ignore spawn-protected boats and boats belonging to its owner. Neutral bases and inactive home sites MUST NOT have turrets.
- Turret shells use the cannon shell's **60 u** blast radius and **10 damage**.
- A turret has **60 HP** and is destroyed by six direct shell hits. Only shells damage turrets; a player's own shells MUST NOT damage that player's turrets.
- A destroyed turret MUST be shown as rubble.
- The turret stands on the base building; its range is measured from the building centre to the boat centre (Q122).
- Turret shells belong to the base owner: a sinking by a turret scores +1 for the owner and the feed reads `<owner>'s turret sank <name>`. Turret shells MUST NOT damage the owner's boats or turrets (Q123).
- A shell hits a turret when it lands within the **60 u** blast radius of the building square, mirroring the frigate hit test; each hit deals **10 damage** (Q124).
- A captured base keeps its turret state (none for a neutral base, rubble for an enemy base); its new owner must install or repair a turret.

## Home-base loss

- When another player first captures a home base, its original owner loses **5 points** and that capturer gains **5 points**; scores MAY be negative (Q101).
- A lost home base MUST return to its original owner automatically after **30 s**, with a full turret.
- Until it returns, the owner MUST respawn at another base they own, or at a random point using the v1 spawning rules if they own no other base.
- While its home is lost, the original owner may take it back by a normal capture, without points; this cancels the return countdown and restores the base to its owner (Q114).
- If a third player captures the lost home during the countdown, they gain **5 points**; the original owner loses no additional points, and the countdown continues (Q114).
- If the original owner leaves while their home is lost, the countdown stops and the home site becomes inactive (Q116).
- When the original owner takes their home back by capture, it is restored as on automatic return, with a full turret (Q125).
- If the player holding another player's lost home leaves (after the reconnect grace), that home returns to its original owner immediately, with a full turret (Q126).
