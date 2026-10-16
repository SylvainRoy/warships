# Open questions

Each question lists the **current proposal** used in the spec. Answer "OK" to keep it, or give your choice.

## Game design

- **Q1 — Mode.** Free-for-all only, or also teams (2 vs 2)? Proposal: free-for-all.
- **Q2 — Bots.** Should AI boats fill empty slots (useful when playing alone)? Proposal: no, out of v1.
- **Q3 — Sound.** Proposal: no sound in v1.
- **Q4 — World shape.** 16 000 × 9 000 u (10 × 10 screens of 16:9) or square 16 000 × 16 000 u? Proposal: 16 000 × 9 000.
- **Q5 — Land coverage.** Proposal: 20–30 % land, a dozen large islands + many small ones.
- **Q6 — Camera.** North-up fixed camera centred on the frigate, or rotating with the frigate? Proposal: north-up.
- **Q7 — Minimap.** Show enemies on the minimap? Proposal: minimap with land and own position only.
- **Q9 — Collisions.** Land and frigate collisions cause no damage, no ramming. OK?
- **Q14 — Torpedo reload.** Not in the draft. Proposal: 8 s.
- **Q17 — Aim indicators.** Visible only to their owner (proposed), or to everyone (makes dodging possible)?

## Rules & multiplayer

- **Q18 — Scoring.** +1 per sink to the killer, −1 for sinking yourself, nothing for damage. OK?
- **Q19 — Score on disconnect.** Proposal: score lost when a player leaves (except reconnection within 10 s).
- **Q20 — Server full.** 5th player waits in the lobby (proposed) or can spectate?
- **Q21 — Host succession.** If the host leaves, the longest-connected player becomes host (proposed). Or should the host role be protected (e.g. by a password set at server start)?
- **Q22 — Kick.** Should the host be able to kick a player?

## Technical

- **Q23 — Stack.** TypeScript + Canvas client, Node.js + WebSocket server (proposed). Any preference?

## Resolved

- **Q0 — Name:** **Warships**.
- **Q8 — Turning:** a frigate can turn on the spot (constant rate).
- **Q10 — Damage model:** 100 HP; shell 20 HP; torpedo 50 HP; no regeneration.
- **Q11 — Aim reference:** aims are relative to the hull (turn with the boat).
- **Q12 — Cannon range control:** Up/Down arrows adjust range.
- **Q13 — Cannon max range vs visible area:** 800 u.
- **Q15 — Torpedo lifetime:** torpedoes run until land, a frigate or the world edge; no max range.
- **Q16 — Keyboard layout:** physical key positions; must work on Mac and PC.
- **Q24 — Hosting:** local network first; GCP in a later phase.
- **Q25 — Repository visibility:** public.
