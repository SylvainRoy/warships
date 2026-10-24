# 09 — Bases

## Sites and ownership

- The world MUST have four home sites, one for each team (site index equals team index), plus the configured number of neutral bases (Q91, Q107, Q207).
- Every active base is owned by a team; neutral bases have no owner. Home sites belong to their corresponding team.
- Each base MUST have a **40 × 40 u** building on land at the coast and a **60 × 60 u** square harbour of open water directly in front. Bases MUST use existing coasts and MUST NOT change the terrain.
- Any two bases MUST be at least **10% of the current map width** apart, measured between their harbour centres: 1,600 u on Big, 800 u on Standard, and 400 u on Small (Q135). If the generator cannot place every requested base, it MUST try the next seed; if the requested neutral count still cannot fit, it MUST place as many as possible, retain the requested setting, and send `Only N neutral bases fit on this map` to every player (Q93, Q136). The placement algorithm is an implementation detail.
- A base building MUST show a flag in its team's colour; a neutral base uses white. A home site MUST remain inactive until the first member of its team joins: it has no flag or turret and cannot be captured.
- When the last member of a team's **10 s** reconnect grace expires or switches out, its home site becomes inactive and every other base held by the team becomes neutral (Q91, Q117, Q207).
- Buildings MUST block frigates as land does; cannon shells fly over them. Because buildings stand on land, torpedoes stop there; turret rubble adds no additional blocking (Q93, Q120).
- A harbour action is valid only while the frigate's whole hull is inside the harbour square.

## Harbour actions

### Resupply

- A frigate MUST be alive, have its whole hull inside an active base owned by its team, and have commanded throttle STOP to resupply. Fuel, shells, torpedoes, and hull MUST refill simultaneously; each MUST take exactly the configured **resupply time** to fill from empty to capacity. Firing MUST NOT interrupt resupply. Teammates may use one another's bases (Q128, Q172, Q208).
- Leaving the harbour MUST stop resupply; fuel, ammunition, and hull already restored remain on board (Q112, Q172).

### Capture

- A frigate may capture a base not owned by its team by remaining continuously in its harbour for the configured **capture time**; any throttle is allowed. A teammate in harbour does not start a capture. Capture progresses only while all non-owner occupants are from one team (Q208).
- Leaving, sinking, or another player's boat entering the harbour MUST reset the capture timer.
- Neutral bases have no turret. An enemy base, including a home base, can be captured only after its turret is destroyed.
- Capturing a neutral base or a non-home enemy base awards no points (Q115).

### Turret repair or installation

- In an owned harbour, a frigate MUST remain without firing for the configured **repair time** to rebuild a destroyed turret or install one on a captured base.
- Firing, leaving the harbour, or sinking MUST restart the repair timer from zero (Q97, Q113). Turret repair/installation MUST proceed simultaneously with resupply when both actions' conditions are met.

The action times are host settings; their ranges, steps, and defaults are specified in [07-multiplayer.md](07-multiplayer.md).

## Base income

- Each active, owned non-home base adds **+1 point** to its team's bonus pool each time it remains held for the configured Base income interval. Home bases never pay, even when captured; capture itself gives no points (Q115, Q175, Q211).
- Each base has its own server-only timer. It accumulates while the base is active and owned, pays once per interval, and resets on ownership change, neutralization, map generation, or score reset (Q175, Q180).
- The host may set Base income to Off or 30–180 s in 30 s steps; the default is 60 s. Changing a nonzero interval preserves progress as a fraction; Off resets timers (Q176).
- Each payout emits a message-free income event. Members of the owning team see a floating `+1` in the team's colour; teammates hear a quiet, centred coin tick (Q177, Q206, Q211).

## Turrets

- An active turret MUST have a range of **600 u** and fire one cannon shell every **3 s** at the nearest enemy boat in range. It aims at the boat's current position without leading.
- A turret MUST ignore spawn-protected boats and boats belonging to its own team. Neutral bases and inactive home sites MUST NOT have turrets.
- Turret shells use the cannon shell's **60 u** blast radius and **10 damage**.
- A turret has **60 HP** and is destroyed by six direct shell hits. Only shells damage turrets; a team's shells MUST NOT damage that team's turrets.
- A destroyed turret MUST be shown as rubble.
- The turret stands on the base building; its range is measured from the building centre to the boat centre (Q122).
- Turret shells are credited to a member of the base's owner team: a sinking scores that member +1 and the feed reads `<member>'s turret sank <name>`. A turret MUST ignore every frigate on its owner team, not just its credited member; its shells MUST NOT damage the owner team's frigates or turrets (Q123, Q208).
- A shell hits a turret when it lands within the **60 u** blast radius of the building square, mirroring the frigate hit test; each hit deals **10 damage** (Q124).
- A captured base keeps its turret state (none for a neutral base, rubble for an enemy base); its new owner must install or repair a turret.

## Home-base loss

- When another team first captures a team's home, **5 points** move from the original team's bonus pool to the capturer team's pool; either pool MAY become negative (Q101, Q211).
- A lost home MUST return to its original team automatically after **30 s**, with a full turret.
- Until it returns, members of the original team MUST respawn at another base owned by that team, or at a random point using the v1 spawning rules if the team owns no other base.
- While its home is lost, a member of the original team may take it back by a normal capture, without points; this cancels the return countdown and restores the base to its original team (Q114).
- If a third team captures the lost home during the countdown, that team's pool gains **5 points**; the original team loses no additional points, and the countdown continues (Q114).
- If the original team becomes empty while its home is lost, the countdown stops and the home site becomes inactive (Q116, Q207).
- When the original team takes its home back by capture, it is restored as on automatic return, with a full turret (Q125).
- If the team holding another team's lost home becomes empty after reconnect grace, that home returns to its original team immediately, with a full turret (Q126).
