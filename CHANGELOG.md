# Changelog

All notable changes to Warships are recorded here. Versions follow semantic versioning: patch for fixes, minor for new features, major for breaking changes.

## [Unreleased]

- Fixed Escape handling so closing the upgrade panel cannot accidentally open the menu or leave the battle; connection-loss retries continue, and same-token joins can take over a lingering socket (Q252–Q254).
- Fixed turret repair and installation feed lines so only the player who completed the repair or installation sees them (Q250).
- Added personal money, treasure pickups, boat upgrades, and the host's Treasures & upgrades setting (Q238–Q249).

## [3.0.0] — 2026-10-20

Third major release. It implements specification v2.14. Teams, timed rounds, bots and new difficulty levels change how a game is played and scored, hence the major version.

### Teams and rounds
- Four colour teams (Blue, Red, Yellow, Purple): pick one in the lobby or switch from Esc → Team. Teammates share colour, home, bases, turrets and radar, and cannot damage each other.
- Team scores combine members' scores with base income and home-capture bonuses; scoreboards and results group players by team when a team has two or more players.
- Timed rounds (10 min by default, or Endless) with a countdown, a results screen and an automatic new map.

### Bots and difficulty
- Server-side bots fill open berths (0–3, default 2); they navigate, fight, capture bases and resupply.
- Bot skill Easy / Normal / Hard (default Normal). Hard plays like the previous default bots; Normal and Easy bots aim worse, open fire at shorter range and manoeuvre less.
- Base turrets follow the same setting: Normal and Easy turrets reach less far, fire more slowly and aim less accurately. Hard turrets behave as in v2.0.0.

### Bases
- Stopping in your own harbour repairs the hull as well as refuelling and rearming.
- Each held non-home base pays recurring income (+1 every 60 s by default), shown as a floating `+1`.
- Enemy fire interrupts harbour repairs and turret rebuilding; leave the harbour and come back to resume.

### Feel and feedback
- Synthesised positional sound effects for weapons, impacts, damage, sinking, radar contacts and harbour actions, with a volume setting.
- Hit markers, merged damage numbers, hit-feed lines, a red damage vignette and optional screen shake.
- White throttle-wave arcs in front of the bow (or behind the stern when astern) show each boat's commanded throttle.

### Internal
- Client split into modules (no gameplay change).

## [2.0.0] — 2026-10-18

Second major release. It implements specification v2.5. Rules and defaults changed (bases, supplies, speeds, default map size), hence the major version.

### Bases and turrets
- Home and neutral bases on island coasts, each with a harbour and a flag in its owner's colour. You spawn in your home harbour.
- Capture a base by keeping your whole hull inside its harbour (5 s by default).
- Owned bases carry a turret that fires at enemy boats within 600 u. Destroy it with your cannon before capturing the base. Install or repair a turret by waiting in your own harbour.
- Losing your home base costs you 5 points and gives the capturer 5. It returns to you after 30 s.

### Fuel and ammunition
- A fuel tank of two map widths, 50 shells and 30 torpedoes. Refill everything in one of your harbours with the throttle at STOP.

### Map and pace
- Host map size setting: Small, Standard (the new default) and Big (the 1.0.0 map).
- Faster boats (72 u/s), shells (600 u/s) and torpedoes (180 u/s).
- New host settings for neutral bases, fuel, shells, torpedoes, and resupply, capture and repair times.

### Display
- Ship's console HUD: hull and fuel dials, cannon and torpedo tiles, and a vertical throttle.
- Sweep radar: other boats appear as fading dots when the beam passes over them, or as fading edge triangles beyond range. The range follows the map size: 750, 1,500 or 3,000 u.
- Compact scoreboard with one score per player; hold Tab for points and sunk counts.

### Fixes
- A failed join no longer leaves ghost captains that fill the berths or make a name look taken.

## [1.0.0] — 2026-10-18

First public release of Warships, a browser-based naval free-for-all for up to four captains. It implements specification v1.18.

### Gameplay
- Server-authoritative frigates with a throttle telegraph (astern, stop, 1/3, 2/3, full), hull steering and soft land collisions.
- Cannon salvos with an adjustable bearing and range (100–800 u) and a 60 u blast radius.
- Three-torpedo spreads with an aimable bearing and an arming delay.
- Sinking, scoring, respawning with 3 s spawn protection, and a scoreboard (hold Tab).

### World and display
- A generated 16,000 × 9,000 u archipelago with connected water and channels at least 160 u wide.
- Natural terrain: turquoise shallows, surf, beaches, grass, forest and rock.
- A camera centred on your boat inside a fixed 16:9 frame, so every player sees the same 1600 × 900 u area.
- Frigate wakes, torpedo bubble trails, cannon and torpedo aim arrows, and a 3,000 u radar that shows other boats only as directions.

### Players and host
- The first player to join is the host, who can regenerate the world, reset scores, kick players and adjust game settings (speeds, reload times, aim rotation, land coverage).
- Every player can remap the 12 game controls in Esc → Controls. Bindings are saved in each browser.

### Running it
- On your LAN: `npm ci && npm run build && npm start`, then open `http://<server-ip>:8080`.
- With Docker: build and run the provided `Dockerfile`; the server listens on port 8080.
