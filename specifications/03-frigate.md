# 03 — Frigate

## Dimensions and appearance

- Length **30 u**, beam (width) **10 u**. Collision shape: a rotated rectangle (or capsule) of that size.
- Each player has a distinct colour (slot 1–4: e.g. blue, red, yellow, purple). The colour is used for the hull, the name label and the scoreboard.
- The player's name is displayed above their frigate. A health bar is displayed under it.
- Visual style: simple flat vector graphics; a wake trail behind moving boats.

## Movement model

The frigate has inertia: the throttle sets a target speed, and acceleration moves the frigate toward it.

| Parameter | Value |
|---|---|
| Maximum forward speed | **48 u/s** — crosses a screen (1600 u) in about 33.3 s |
| Maximum reverse speed | **15 u/s** |
| Acceleration and braking | **24 u/s²** in either direction; from rest, full speed takes 2 s |
| Throttle levels | −1 full astern; 0 stop; 1 one-third ahead; 2 two-thirds ahead; 3 full ahead |
| Drag | None; at throttle 0, the frigate decelerates toward a stop at 24 u/s² |
| Rotation (A / D) | 36 °/s, independent of speed: a stopped frigate can turn on the spot |

- Velocity is always along the hull heading (no sideways drift).
- W and S each step the throttle setting by one level; key auto-repeat is ignored. The simulation clamps throttle levels to −1 through 3.
- A and D together cancel.
- Host settings can scale forward/reverse top speed, acceleration, and rotation by percentage; land damage remains relative to the scaled top speed while the 20 u/s graze threshold stays fixed (Q47).

## Collisions

- **Frigate vs land / world edge**: the frigate stops at the shore (velocity component into the land is cancelled, it can slide along the coast).
  - Impact speed is the velocity component into the coast. Damage is 0 below 20 u/s; otherwise it is `round(10 × min(1, impact speed / 48))` HP.
  - Damage is applied on new contact, then at most once per second while contact continues. Spawn protection prevents land damage.
  - A frigate sunk by land damage counts as sinking itself ([06-game-rules.md](06-game-rules.md#scoring)).
- **Frigate vs frigate**: frigates cannot overlap; they are pushed apart and both lose their speed. No damage, i.e. no ramming.

## Hull points

- Each frigate has **100 hull points (HP)**.
- Damage values are defined in [04-weapons.md](04-weapons.md). At 0 HP the frigate sinks ([06-game-rules.md](06-game-rules.md)).
- No regeneration of HP while alive.
