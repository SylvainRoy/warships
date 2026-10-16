# 04 — Weapons

Each frigate has two independent weapon systems with their own aim and reload. Both aims are **relative to the hull**: when the frigate turns, the aim turns with it (like a turret) (proposed, Q11).

## Cannons

Ballistic weapon: shells fly in the air, over water and land, and land on the aimed point.

### Aiming

- **Bearing**: Left / Right arrow rotate the cannon bearing at 90 °/s (proposed). Full 360° allowed.
- **Range**: the draft only defines rotation keys, so the range control is an open question (Q12). Proposed: Up / Down arrows increase / decrease range at 400 u/s, between **100 u** and the **maximum range**.
- **Maximum range: 800 u** (proposed, Q13). The draft said "one screen"; since the camera is centred on the frigate, only half a screen width (800 u) — and half a screen height (450 u) vertically — is visible around it. A range above 450–800 u would put the target off screen. Options: (a) 800 u, accepting the target can leave the screen vertically; (b) 450 u so the target is always visible; (c) 1600 u with the camera shifting towards the target.
- The aim point is shown by a **green target reticle** drawn on the map (see [05-controls-and-hud.md](05-controls-and-hud.md)).

### Firing

- Right Shift fires a **salvo of 2 shells**. Their trajectories are parallel to the bearing, offset by ±15 u perpendicular to it (proposed), so they land 30 u apart, centred on the reticle.
- Shells travel at **500 u/s** horizontal speed (proposed): ≤ 1.6 s flight at max range. The landing point is fixed at the time of firing (shells are not guided). Shells are drawn with a parabolic effect (size grows then shrinks, shadow on the water).
- **Reload: 3 s** after a salvo. Pressing fire while reloading does nothing.
- Shells only interact **at their impact point**: no collision while flying, whatever is underneath.

### Impact

- On landing, each shell explodes. Any frigate whose hull is within **60 u (one boat length)** of the impact point takes damage: **20 HP per shell** (proposed, Q10). A frigate hit by both shells takes 40 HP.
- The firer's own frigate CAN be hit by its own shells (proposed).
- Visuals: splash on water, small explosion on land or on a boat.

## Torpedoes

Underwater weapon: straight-line, fast, blocked by land.

### Aiming

- `[` / `]` rotate the torpedo bearing left / right at 90 °/s (proposed). Full 360° allowed.
- The bearing is shown by a **green arrow around the frigate** (see [05-controls-and-hud.md](05-controls-and-hud.md)).

### Firing

- `\` fires a **spread of 3 torpedoes** simultaneously at bearing −1°, 0°, +1°. They start from the frigate's centre.
- Torpedo speed **240 u/s** (1.5 × max frigate speed) (proposed).
- **Reload: 8 s** (proposed, Q14; not defined in the draft).
- Torpedoes do not collide with the firer's own frigate during the first 0.5 s (arming delay) (proposed); after that they can hit it.

### Lifetime and impact

- A torpedo travels in a straight line until it **touches land, a frigate, or the world edge**, where it explodes. (The draft said "or exit the screen": interpreted as *world* edge, since the screen differs for each player. Q15: should there be a maximum range instead?)
- Torpedo vs torpedo, torpedo vs shell: no interaction.
- Damage: **50 HP per torpedo** on the frigate it touches (no area damage) (proposed, Q10). Because of the 1° spread, at close range several torpedoes of the same spread can hit the same frigate.
