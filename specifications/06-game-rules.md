# 06 — Game rules

## Spawning

A frigate spawns when a player joins, after being sunk, after switching teams, and when the world is regenerated.

- Normally, a frigate spawns in its team's home harbour facing open water, offset to avoid every living frigate. Teammates share the home; existing spawn-validity checks apply, with ordinary fallback rules if no safe home position fits. It spawns with full fuel, shells, torpedoes, and hull; the cannon range is at minimum (100 u), and bearings point forward (Q106, Q207).
- If its team's home base has been lost, the player respawns at another base owned by that team. If the team owns no other base, use the v1 random-point rules below (Q102).
- Every spawn starts at speed 0.
- Random-point fallback: choose a water point such that
  - the whole frigate is on water with at least 60 u clearance from land,
  - it is at least **15% of the current map width** from every other living frigate: 2 400 u on Big, 1 200 u on Standard, or 600 u on Small (Q138). If no such point is found after N attempts, the point maximising the distance to the nearest frigate is used.
- For a random-point fallback, heading is random.
- **Spawn protection**: 3 s of invulnerability, ended early if the player fires. Shown by a blinking hull.

## Sinking

- A frigate sinks when its HP reaches 0. A short sinking animation plays (≈ 2 s); the wreck does not block anything.
- **Respawn delay: 3 s** after sinking.
- Projectiles fired before sinking stay active and can still score.

## Scoring

- Capturing another team's home base removes **5 points** from the original team's bonus pool and adds **5 points** to the capturer team's pool. Pools may become negative (Q101, Q208, Q211).
- **+1 point** to the player whose shell or torpedo dealt the final damage.
- Each active, owned non-home base awards its team's bonus pool **+1 point** for each Base income interval it remains held; home bases never pay, and capture itself awards no points (Q115, Q175, Q211).
- Sinking yourself (own shell / torpedo, or running into land): no point gained, **−1 point**.
- No points for damage that does not sink.
- Personal scores are kept for as long as a player stays connected; a player leaving loses their score. Team score is the sum of members' personal scores plus the team's bonus pool; the pool resets when the team becomes empty, on score reset, and on a new round.
- The full (Tab) scoreboard also shows the number of times each player was sunk.
- The team with the highest team score wins; if all non-empty teams tie, the round is a draw. The host may reset scores (see [07-multiplayer.md](07-multiplayer.md)).

## New maps and score resets

- When a new map is generated, all bases MUST be re-placed and each team's home site MUST be restored (Q110).
- Resetting scores MUST NOT change bases.
- On a new map, every non-home base starts neutral; each team's home site is active when that team has members (Q110, Q118, Q207).

## Rounds

The default round lasts 10 minutes. The host may choose 5–30 minutes in 5-minute steps or Endless. At the end of a timed round the simulation freezes for a 10-second intermission; projectiles are cleared and snapshots continue. The end screen lists all current players, including bots, with results ordered by personal score, sinks, then deaths. Team score—the sum of members' personal scores and the team's bonus pool—determines the winning team or teams; all members of every winning team win. If all non-empty teams tie, the result is a Draw. Accuracy is hits divided by shots, or `—` when no shots were fired. After the intermission, a new map is generated with current settings, scores and round stats reset, base timers cleared, and all frigates respawned at their shared team home with full supplies (Q193–Q200, Q207, Q211, Q213).

Reset scores starts a fresh round immediately without an end screen. Regenerate changes the map but keeps scores and the current timer. Changing Round length restarts the timer; Endless has no timer. During intermission, settings apply to the next round, while Regenerate and Reset scores are rejected (Q199).
