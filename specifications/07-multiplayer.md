# 07 — Multiplayer & host

## Joining

1. The player opens the server URL in a browser.
2. A lobby screen asks for a **name** (1–16 characters, unique on the server, remembered in the browser's local storage) and a team choice. Four colour buttons list current team members; the choice is stored locally.
3. On "Join", if a berth is free the player is assigned the lowest free slot and requested valid team. Without a valid choice, the server chooses the lowest empty team or least-populated team, lowest index on ties.
4. If 4 players are already in: the player sees "Server full" and the lobby refreshes automatically; they join as soon as a slot frees up.

## Spawn validity

A spawn point is valid only when no land tile lies within 60 u of the frigate hull at any heading. The server checks tiles against a disc around the spawn point with radius equal to the hull half-diagonal plus 60 u.

## Leaving

- Closing the tab or losing the connection for more than **10 s** frees the slot: the frigate disappears and its score is dropped.
- A reconnection within those 10 s with the same name resumes the same frigate and score.
- When a joined connection is lost, the client shows the lobby and `Connection lost — reconnecting…`, then retries every 1 s while resuming; a socket still connecting after 5 s is closed so it can retry. A welcome clears the message and stops retries. A join error stops retries and leaves its error visible.
- A valid token and matching case-insensitive name can take over the same session even while its old socket is still connected. The server closes that socket with code 4001 and reason `replaced`; the old tab shows `This captain joined from another tab.` and does not reconnect. Takeover does not announce a disconnect. Code 4000 retains the kicked behavior and does not reconnect (Q254).
- If an already-joined connection sends Join again, the server MUST resend the current welcome without creating a session when the name matches case-insensitively; if the name differs, it MUST fully remove the old session without closing the connection before processing the new join (Q143).
- Team bases remain active while any teammate remains, including during reconnect grace. When a team's last session leaves or switches out, its home becomes inactive and its other bases become neutral (Q91, Q117, Q207).

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
    - **Base income**: Off or every 30–180 s, step 30 s, default every 60 s. Changing a nonzero interval preserves each base's progress as a fraction; Off resets timers and stops payouts (Q176).
    - **Bots**: 0–3, step 1, default 2. **Bot skill**: Easy, Normal, or Hard, default Normal. Bots are server-controlled captains; the host changes their count or skill in Settings (Q182, Q184).
    - **Treasures & upgrades**: On by default. Off clears treasures and resets wallets and upgrade levels, and disables money awards, purchases, effects, and economy UI (Q248).
    - Fuel and ammunition setting changes apply immediately; current amounts MUST be clamped to the new maximum (Q107). A time-setting change applies immediately to an action in progress, preserving progress as a fraction of that action (Q119).
- Enter confirms a pending action; Esc cancels it or returns from kick selection.
- All players see a notification in the event feed when the host performs an action.
- Applying settings broadcasts the new values to every joined player. When at least one value changes, the feed says `Host <name>: <changed settings>` in field order; applying unchanged values does not add an event. Changing Land coverage, Map size, or Neutral bases immediately regenerates the map and respawns all frigates at home, while keeping scores (Q54, Q133). If fewer neutral bases fit than requested, the setting MUST stay unchanged and every player MUST receive `Only N neutral bases fit on this map` (Q136).
- Settings are kept in server memory across world regeneration, score resets, and host succession. They reset to defaults when the server restarts. In-flight projectiles and reloads already in progress retain their values (Q44, Q46).
- Host privileges are tied to the session (connection), not to a password.

## Teams

The four teams correspond to Blue, Red, Yellow, and Purple, indexed 0–3. Berth `slot` remains a separate capacity identity. Teams have no size limit beyond the four-player room capacity. Players may switch teams from the Esc menu, with a 30 s server-side cooldown; switching is rejected during intermission and to the current team. The old frigate is removed without a sink or death, personal score is retained, and the player respawns at the new team's home after the ordinary delay. The lobby remembers the selection. Team colour is shared across ships, names, flags, scoreboards, radar, end screen, and feed (Q203–Q206).

Each team has one home site whose site index equals its team index. A home activates when its first member joins or switches in. Teammates spawn at that home with collision-avoiding offsets; if it is lost, the ordinary alternative-base/random fallback applies for the team. When the final member leaves after reconnect grace or switches out, the home deactivates and the team's other bases become neutral (Q207).

Bases are team-owned. Capture, repair, and lost-home identity use team indices; every teammate may resupply, repair hull, or repair/install a turret at a team base. A teammate never captures its own base. Capture progresses only when all non-owner harbour occupants are from one team. Turrets ignore their own team. Shells and torpedoes do not damage teammates or own-team turrets, while spawn protection, self-torpedo arming, and land damage retain their existing rules (Q208–Q209).

Base income and home-capture points go to a four-entry team bonus pool. Team score is the sum of personal scores and the pool. The pool resets when the team empties, on score reset, and on a new round. Snapshots carry the four integer bonuses. Round results rank teams by team score; ties between all non-empty teams are draws. Bots join the least-populated team at creation and treat other teams as enemies (Q211–Q214).

There are no host team controls (Q215).

## Bots

The server fills available berths with bots up to the configured count while at least one human session exists. Humans include sessions within reconnect grace. The target bot count is `min(Bots, 4 − humans)`; bots are removed newest-first when the target falls. When all berths are occupied and a human joins, the newest bot is removed synchronously so the human is admitted. Bots use the lowest free slot, never become host, and cannot be kicked. Their names are reserved in order: Bot Nelson, Bot Suffren, Bot Tromp. A matching human name is rejected case-insensitively. Bots appear in the lobby roster with `(bot)`, scoreboards, and game events, but do not count as human free-slot usage. Snapshot players carry no bot flag (Q183–Q185).

Bots are ordinary `PlayerSession`s with no socket. Their inputs pass through the same simulation and they receive no physics or scoring exceptions. Per-session network sends skip them. They use deterministic brains seeded from the room's random source and act only on public information: enemy frigates within 900 u and public base ownership/positions (Q185–Q186).

At each skill's reaction interval, the bot chooses in order: resupply at the nearest owned active harbour when hull, shells, or fuel is low; engage the nearest visible, alive, unprotected enemy within its skill's derived band; assault the nearest active base it does not own, first shelling an active enemy turret from its skill's standoff band; otherwise patrol toward a random reachable point at least 400 u away. Weapons fire whenever a firing solution exists.

Normal and Hard bots, but not Easy bots, may detour to the nearest treasure within 500 u when no enemy is visible and they are not resupplying. At an owned harbour, bots purchase at most one affordable upgrade per think tick in the order hull, cannon damage, cannon range, speed, torpedo damage, torpedo speed (Q247).

| Skill | Bearing error | Range error | Reaction | Lead | Torpedoes | Cannon fire range | Torpedo range | Cruise / combat throttle | Dodge | Engage band | Turret standoff |
|---|---:|---:|---:|---|---|---:|---:|---:|---|---:|---:|
| Easy | 8° | 12% | 1.0 s | No | No | 450 u | 0 u | 2 / 1 | No | 350–400 u | 300–400 u |
| Normal | 5° | 8% | 0.7 s | Yes | Yes | 600 u | 400 u | 2 / 1 | Yes | 350–550 u | 450–550 u |
| Hard | 3° | 5% | 0.5 s | Yes | Yes | 800 u | 500 u | 3 / 2 | Yes | 350–600 u | 650–750 u |

The engage band is `350 u` to `min(600 u, cannon fire range − 50 u)`; turret standoff is `cannon fire range − 150 u` to `cannon fire range − 50 u`. Hard uses the former Normal bot behaviour; the former Hard profile is removed (Q228–Q231). Bot skill also sets range, reload, and aim difficulty for every base turret regardless of its owner's team (see [09-bases.md](09-bases.md), Q233–Q236); bot turret standoff bands remain unchanged (Q237). The Bots count setting remains separate and unchanged.

Navigation uses A* on an 8-neighbour, 40 u grid. A cell is passable only if its centre and eight points on a 20 u ring are water. Paths are cached per world, replanned every 2 s or after a goal moves more than 200 u, and string-pulled to the furthest directly visible waypoint. If stuck, a bot reverses with the opposite turn for 1.5 s before repathing. World regeneration clears bot paths and targets; bots respawn by the ordinary respawn rules, and score reset clears their scores (Q189–Q190).

## The game loop on an empty server

When the last player leaves, the game keeps its world but has nothing to simulate. The next player to join becomes host.
