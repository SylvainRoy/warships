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

## Host

- The first player to join an empty server becomes the **host**, marked with a crown on the scoreboard.
- If the host leaves, host rights pass to the player who has been connected the longest.
- Host actions (from a menu opened with Esc, confirmed in-game rather than through browser dialogs):
  - **Regenerate world**: new random seed; all projectiles are removed; all frigates respawn per the spawning rules. Scores are kept.
  - **Reset scores**: all scores and sunk counts set to 0.
  - **Kick a player**: choose a numbered target (ordered by slot) with 1–3.
  - **Settings**: edit boat speed (`boatSpeedPct`), rotation (`rotationPct`), cannon rotation (`cannonRotationPct`), torpedo rotation (`torpedoRotationPct`), shell speed (`shellSpeedPct`), torpedo speed (`torpedoSpeedPct`), cannon reload (`cannonReload`), and torpedo reload (`torpedoReload`). Values must contain exactly the eight supported keys and satisfy their limits and steps (Q43, Q50); invalid settings are rejected.
- Enter confirms a pending action; Esc cancels it or returns from kick selection.
- All players see a notification in the event feed when the host performs an action.
- Applying settings broadcasts the new values to every joined player. When at least one value changes, the feed says `Host <name>: <changed settings>` in field order; applying unchanged values does not add an event.
- Settings are kept in server memory across world regeneration, score resets, and host succession. They reset to defaults when the server restarts. In-flight projectiles and reloads already in progress retain their values (Q44, Q46).
- Host privileges are tied to the session (connection), not to a password.

## The game loop on an empty server

When the last player leaves, the game keeps its world but has nothing to simulate. The next player to join becomes host.
