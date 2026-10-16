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
- **Q9 — Collisions:** touching land costs 20 HP (one cannon shell), at most once per second while in contact; frigate-vs-frigate contact causes no damage.
- **Q10 — Damage model:** 100 HP; shell 20 HP; torpedo 50 HP; no regeneration.
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
