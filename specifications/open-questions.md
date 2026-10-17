# Decisions

All questions raised during the specification phase are resolved. Each line gives the decision, which is already reflected in the specification documents.

## Game design

- **Q0 — Name:** Warships.
- **Q1 — Mode:** free-for-all only, no teams.
- **Q2 — Bots:** none in v1.
- **Q3 — Sound:** none in v1.
- **Q4 — World shape:** 16 000 × 9 000 u (10 × 10 reference screens).
- **Q5 — Land coverage:** 20–30 %, a dozen large islands plus many small ones.
- **Q6 — Camera:** north-up, centred on own frigate.
- **Q7 — Minimap:** none.
- **Q8 — Turning:** a frigate can turn on the spot (constant rate).
- **Q9 — Collisions:** land damage is speed-scaled up to 10 HP, at most once per second while in contact; frigate-vs-frigate contact causes no damage.
- **Q10 — Damage model:** 100 HP; shell 10 HP; torpedo 25 HP; no regeneration.
- **Q11 — Aim reference:** aims are relative to the hull (turn with the boat).
- **Q12 — Cannon range control:** Up/Down arrows adjust range.
- **Q13 — Cannon max range:** 800 u.
- **Q14 — Torpedo reload:** 8 s.
- **Q15 — Torpedo lifetime:** until land, a frigate or the world edge; no max range.
- **Q16 — Keyboard layout:** physical key positions; must work on Mac and PC.
- **Q17 — Aim indicators:** visible only to their owner.

## Rules & multiplayer

- **Q18 — Scoring:** +1 per sink to the killer; −1 for sinking yourself (own weapons or land); nothing for damage.
- **Q19 — Score on disconnect:** lost, except reconnection within 10 s.
- **Q20 — Server full:** extra players wait in the lobby (no spectating).
- **Q21 — Host succession:** longest-connected player becomes host; no password.
- **Q22 — Kick:** the host can kick a player.

## Technical

- **Q23 — Stack:** TypeScript + Canvas client, Node.js + WebSocket server.
- **Q24 — Hosting:** local network first; GCP in a later phase.
- **Q25 — Repository visibility:** public.

## Playtest decisions — 2026-10-16

- **Q26 — Throttle telegraph:** W/S step the throttle levels −1 full astern, 0 stop, 1 one-third ahead, 2 two-thirds ahead, and 3 full ahead; show all levels and highlight the selected setting in the HUD. Decided 2026-10-16 after playtest.
- **Q27 — Speed-scaled land damage:** damage is zero below 20 u/s impact speed; otherwise round `10 × min(1, impact speed / 80)`, limited to once per second and disabled during spawn protection. Decided 2026-10-16 after playtest.
- **Q28 — Channel width:** every water tile belongs to an all-water 8 × 8 tile square, giving channels a minimum width of 160 u. Decided 2026-10-16 after playtest.
- **Q29 — Frigate speeds:** maximum forward speed 80 u/s, reverse speed 25 u/s, acceleration 40 u/s², with no drag. Decided 2026-10-16 after playtest.
- **Q30 — Torpedo spread:** fire the three torpedoes at −2°, 0°, and +2°. Decided 2026-10-16 after playtest.

## Playtest decisions — 2026-10-17

- **Q31 — Own frigate HP bar:** show the small HP bar below enemy frigates only; own hull integrity remains in the HUD. Decided 2026-10-17 after playtest.
- **Q32 — Torpedo indicator:** use a five-dash radar-style arrow with an open chevron and base tick; show reload by filling completed dashes, dimming the rest, and no reload arc. Decided 2026-10-17 after playtest.
- **Q33 — Cannon sight orientation:** orient the four reticle ticks along the line of fire from the frigate to the aim point and start the reload arc at that bearing. Decided 2026-10-17 after playtest.
- **Q34 — Camera framing:** keep the frigate and the cannon reticle (including its 60 u radius) on screen by shifting the world-clamped camera as needed; show boundary land when the view extends beyond the world. Decided 2026-10-17 after playtest.
- **Q35 — HUD corner margin:** the hull-integrity/throttle panel and the captains panel sit 8 px from their screen corners. Decided 2026-10-17 after playtest.
- **Q36 — Damage halved:** cannon shell 10 HP, torpedo 25 HP, and land collision up to 10 HP, with no change to the graze threshold or interval; a frigate now takes 10 shells or 4 torpedoes to sink. Decided 2026-10-17 after playtest.
