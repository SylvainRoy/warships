# 04 — Weapons

Each frigate has two independent weapon systems with their own aim and reload. Both aims are **relative to the hull**: when the frigate turns, the aim turns with it (like a turret).

## Cannons

Ballistic weapon: shells fly in the air, over water and land, and land on the aimed point.

### Aiming

- **Bearing**: Left / Right arrow rotate the cannon bearing at 90 °/s. Full 360° allowed.
- **Range**: Up / Down arrows increase / decrease range at 400 u/s, between **100 u** and the **maximum range**.
- **Maximum range: 800 u** (half a screen width). With the camera centred on the frigate the target is always visible horizontally; vertically (450 u visible) it can leave the screen when aiming far north or south, which is accepted.
- The aim point is shown by a **green target reticle** drawn on the map (see [05-controls-and-hud.md](05-controls-and-hud.md)).

### Firing

- Right Shift fires a **salvo of 2 shells**. Their trajectories are parallel to the bearing, offset by ±15 u perpendicular to it, so they land 30 u apart, centred on the reticle.
- Shells travel at **500 u/s** horizontal speed: ≤ 1.6 s flight at max range. The landing point is fixed at the time of firing (shells are not guided). Shells are drawn with a parabolic effect (size grows then shrinks, shadow on the water).
- **Reload: 3 s** after a salvo. Pressing fire while reloading does nothing.
- Shells only interact **at their impact point**: no collision while flying, whatever is underneath.

### Impact

- On landing, each shell explodes. Any frigate whose hull is within **60 u (one boat length)** of the impact point takes damage: **20 HP per shell**. A frigate hit by both shells takes 40 HP.
- The firer's own frigate CAN be hit by its own shells.
- Visuals: splash on water, small explosion on land or on a boat.

## Torpedoes

Underwater weapon: straight-line, fast, blocked by land.

### Aiming

- `[` / `]` rotate the torpedo bearing left / right at 90 °/s. Full 360° allowed.
- The bearing is shown by a **green arrow around the frigate** (see [05-controls-and-hud.md](05-controls-and-hud.md)).

### Firing

- `\` fires a **spread of 3 torpedoes** simultaneously at bearing −2°, 0°, +2°. They start from the frigate's centre.
- Torpedo speed **240 u/s** (3 × max frigate speed).
- **Reload: 8 s**.
- Torpedoes do not collide with the firer's own frigate during the first 0.5 s (arming delay); after that they can hit it.

### Lifetime and impact

- A torpedo travels in a straight line until it **touches land, a frigate, or the world edge**, where it explodes. There is no maximum range ("exit the screen" in the original draft means the world edge).
- Torpedo vs torpedo, torpedo vs shell: no interaction.
- Damage: **50 HP per torpedo** on the frigate it touches (no area damage). Because of the 2° spread, at close range several torpedoes of the same spread can hit the same frigate.
