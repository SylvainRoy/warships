# 07 — Multiplayer & host

## Joining

1. The player opens the server URL in a browser.
2. A lobby screen asks for a **name** (1–16 characters, unique on the server, remembered in the browser's local storage). It shows the current players and free slots.
3. On "Join", if a slot is free the player is assigned the lowest free slot (which fixes their colour) and spawns immediately at a valid spawn point.
4. If 4 players are already in: the player sees "Server full" and the lobby refreshes automatically; they join as soon as a slot frees up.

## Spawn validity

A spawn point is valid only when no land tile lies within 60 u of the frigate hull at any heading. The server checks tiles against a disc around the spawn point with radius equal to the hull half-diagonal plus 60 u.

## Leaving

- Closing the tab or losing the connection for more than **10 s** frees the slot: the frigate disappears and its score is dropped.
- A reconnection within those 10 s with the same name resumes the same frigate and score.
- If an already-joined connection sends Join again, the server MUST resend the current welcome without creating a session when the name matches case-insensitively; if the name differs, it MUST fully remove the old session without closing the connection before processing the new join (Q143).
- A player's bases remain theirs during the **10 s** reconnect grace. When the grace expires and the slot is freed, their home site becomes inactive and every other base they held becomes neutral (Q91, Q117).

## Host

- The first player to join an empty server becomes the **host**, marked with a crown on the scoreboard.
- If the host leaves, host rights pass to the player who has been connected the longest.
- Host actions (from a menu opened with Esc, confirmed in-game rather than through browser dialogs):
  - **Regenerate world**: new random seed; all projectiles are removed; all frigates respawn per the spawning rules. Scores are kept.
  - **Reset scores**: all scores and sunk counts set to 0.
  - **Kick a player**: choose a numbered target (ordered by slot) with 1–3.
  - **Settings**: edit boat speed (`boatSpeedPct`), rotation (`rotationPct`), cannon rotation (`cannonRotationPct`), torpedo rotation (`torpedoRotationPct`), shell speed (`shellSpeedPct`), torpedo speed (`torpedoSpeedPct`), cannon reload (`cannonReload`), torpedo reload (`torpedoReload`), Land coverage (`landCoveragePct`), Map size (`mapSize`), and the remaining v2 settings below. Updates MUST contain exactly the supported settings and satisfy their limits and steps; invalid settings are rejected.
    - **Map size**: Small (200 × 112 tiles), Standard (400 × 225 tiles), or Big (800 × 450 tiles); default Standard. Changing it regenerates the map and respawns every player at home (Q132, Q133, Q140, Q141).
    - **Neutral bases**: 0–8, step 1, default 4. Changing the value regenerates the map (Q107, Q120).
    - **Fuel crossings**: 1–10, step 1, default 2. Each crossing is the current map width (Q103, Q137).
    - **Shells**: 10–200, step 10, default 50; **Torpedoes**: 5–100, step 5, default 30 (Q105).
    - **Resupply time**, **Capture time**, and **Repair time**: each 1–30 s, step 1 s, default 5 s (Q95–Q97).
    - Fuel and ammunition setting changes apply immediately; current amounts MUST be clamped to the new maximum (Q107). A time-setting change applies immediately to an action in progress, preserving progress as a fraction of that action (Q119).
- Enter confirms a pending action; Esc cancels it or returns from kick selection.
- All players see a notification in the event feed when the host performs an action.
- Applying settings broadcasts the new values to every joined player. When at least one value changes, the feed says `Host <name>: <changed settings>` in field order; applying unchanged values does not add an event. Changing Land coverage, Map size, or Neutral bases immediately regenerates the map and respawns all frigates at home, while keeping scores (Q54, Q133). If fewer neutral bases fit than requested, the setting MUST stay unchanged and every player MUST receive `Only N neutral bases fit on this map` (Q136).
- Settings are kept in server memory across world regeneration, score resets, and host succession. They reset to defaults when the server restarts. In-flight projectiles and reloads already in progress retain their values (Q44, Q46).
- Host privileges are tied to the session (connection), not to a password.

## The game loop on an empty server

When the last player leaves, the game keeps its world but has nothing to simulate. The next player to join becomes host.
