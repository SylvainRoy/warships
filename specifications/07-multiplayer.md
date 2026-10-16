# 07 — Multiplayer & host

## Joining

1. The player opens the server URL in a browser.
2. A lobby screen asks for a **name** (1–16 characters, unique on the server, remembered in the browser's local storage). It shows the current players and free slots.
3. On "Join", if a slot is free the player is assigned the lowest free slot (which fixes their colour) and spawns immediately.
4. If 4 players are already in: the player sees "Server full" and the lobby refreshes automatically; they join as soon as a slot frees up.

## Leaving

- Closing the tab or losing the connection for more than **10 s** frees the slot: the frigate disappears and its score is dropped.
- A reconnection within those 10 s with the same name resumes the same frigate and score.

## Host

- The first player to join an empty server becomes the **host**, marked with a crown on the scoreboard.
- If the host leaves, host rights pass to the player who has been connected the longest.
- Host actions (from a menu opened with Esc, each with a confirmation):
  - **Regenerate world**: new random seed; all projectiles are removed; all frigates respawn per the spawning rules. Scores are kept.
  - **Reset scores**: all scores and sunk counts set to 0.
  - Kick a player.
- All players see a notification in the event feed when the host performs an action.
- Host privileges are tied to the session (connection), not to a password.

## The game loop on an empty server

When the last player leaves, the game keeps its world but has nothing to simulate. The next player to join becomes host.
