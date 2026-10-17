# 04 — Weapons

Each frigate has two independent weapon systems with their own aim and reload. Both aims are **relative to the hull**: when the frigate turns, the aim turns with it (like a turret).

## Cannons

Ballistic weapon: shells fly in the air, over water and land, and land on the aimed point.

### Aiming

- **Bearing**: Left / Right arrow rotate the cannon bearing at 54 °/s at the default setting, scaled by the host's cannon rotation setting. Full 360° allowed.
- **Range**: Up / Down arrows increase / decrease range at 400 u/s, between **100 u** and the **maximum range**.
- **Maximum range: 800 u** (half a screen width); a cannon arrow next to the frigate shows the bearing (see [05-controls-and-hud.md](05-controls-and-hud.md)).
- The aim point is shown by a **green target reticle** drawn on the map (see [05-controls-and-hud.md](05-controls-and-hud.md)).

### Firing

- Right Shift fires a **salvo of 2 shells**. Their trajectories are parallel to the bearing, offset by ±15 u perpendicular to it, so they land 30 u apart, centred on the reticle.
- Shells travel at **400 u/s** horizontal speed: ≤ 2.0 s flight at max range. The landing point is fixed at the time of firing (shells are not guided). Shells are drawn as pointed black shells with a thin pale outline, nose oriented along the flight path, with the parabolic size effect (grows then shrinks) and shadow on the water.
- **Reload: 1.5 s** after a salvo. Pressing fire while reloading does nothing.
- The host can adjust shell speed and cannon reload; shell range remains unchanged (Q47).
- Shells only interact **at their impact point**: no collision while flying, whatever is underneath.

### Impact

- On landing, each shell explodes. Any frigate whose hull is within **60 u** of the impact point takes damage: **10 HP per shell**. A frigate hit by both shells takes 20 HP.
- The firer's own frigate CAN be hit by its own shells.
- Visuals: splash on water, small explosion on land or on a boat.

## Torpedoes

Underwater weapon: straight-line, fast, blocked by land.

### Aiming

- `[` / `]` rotate the torpedo bearing left / right at 54 °/s at the default setting, scaled by the host's torpedo rotation setting. Full 360° allowed.
- The bearing is shown by a **green arrow around the frigate** (see [05-controls-and-hud.md](05-controls-and-hud.md)).

### Firing

- `\` fires a **spread of 3 torpedoes** simultaneously at bearing −2°, 0°, +2°. They start from the frigate's centre.
- Torpedo speed **120 u/s** (2.5 × max frigate speed).
- **Reload: 4 s**.
- The host can adjust torpedo speed and reload; the 0.5 s arming delay remains unchanged (Q47).
- Torpedoes do not collide with the firer's own frigate during the first 0.5 s (arming delay); after that they can hit it.

### Lifetime and impact

- A torpedo travels in a straight line until it **touches land, a frigate, or the world edge**, where it explodes. There is no maximum range ("exit the screen" in the original draft means the world edge).
- Torpedo vs torpedo, torpedo vs shell: no interaction.
- Damage: **25 HP per torpedo** on the frigate it touches (no area damage). Because of the 2° spread, at close range several torpedoes of the same spread can hit the same frigate.
