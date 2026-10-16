# Open questions

Each question lists the **current proposal** used in the spec. Answer "OK" to keep it, or give your choice.

## Game design

- **Q0 — Name.** The draft says "Naval" in the text and "warships" as the project name. Proposal: **Warships**.
- **Q1 — Mode.** Free-for-all only, or also teams (2 vs 2)? Proposal: free-for-all.
- **Q2 — Bots.** Should AI boats fill empty slots (useful when playing alone)? Proposal: no, out of v1.
- **Q3 — Sound.** Proposal: no sound in v1.
- **Q4 — World shape.** 16 000 × 9 000 u (10 × 10 screens of 16:9) or square 16 000 × 16 000 u? Proposal: 16 000 × 9 000.
- **Q5 — Land coverage.** Proposal: 20–30 % land, a dozen large islands + many small ones.
- **Q6 — Camera.** North-up fixed camera centred on the frigate, or rotating with the frigate? Proposal: north-up.
- **Q7 — Minimap.** Show enemies on the minimap? Proposal: minimap with land and own position only.
- **Q8 — Turning.** Can a stationary frigate rotate on the spot, or should turning rate depend on speed (more realistic, harder)? Proposal: constant 45 °/s, even when stopped.
- **Q9 — Collisions.** Land and frigate collisions cause no damage, no ramming. OK?
- **Q10 — Damage model.** The draft does not say how many hits sink a boat. Proposal: 100 HP; shell 20 HP (40 if both shells hit); torpedo 50 HP; no regeneration. Alternatives: one hit = sunk; or slow regeneration.
- **Q11 — Aim reference.** Are weapon bearings relative to the hull (rotate with the boat, like turrets) or absolute (stay fixed on the map when the boat turns)? Proposal: relative to the hull.
- **Q12 — Cannon range control.** The draft only gives rotation keys. How does the player choose the distance? Proposal: Up/Down arrows adjust range (100 u – max). Alternative: always fire at max range.
- **Q13 — Cannon max range vs visible area.** "One screen" (1600 u) exceeds what is visible around a centred frigate (800 u horizontally, 450 u vertically). Proposal: 800 u. See options in [04-weapons.md](04-weapons.md#aiming).
- **Q14 — Torpedo reload.** Not in the draft. Proposal: 8 s.
- **Q15 — Torpedo lifetime.** "Until obstacle or exit the screen" interpreted as world edge. Or a max range (e.g. 3 000 u)? Proposal: world edge, no max range.
- **Q16 — Keyboard layout.** Do you play on a French AZERTY keyboard (Mac or PC)? Keys are proposed by physical position. On AZERTY the `[ ] \` positions are the keys printed `^ $ *` (PC) — is that acceptable, or do you want different torpedo keys?
- **Q17 — Aim indicators.** Visible only to their owner (proposed), or to everyone (makes dodging possible)?

## Rules & multiplayer

- **Q18 — Scoring.** +1 per sink to the killer, −1 for sinking yourself, nothing for damage. OK?
- **Q19 — Score on disconnect.** Proposal: score lost when a player leaves (except reconnection within 10 s).
- **Q20 — Server full.** 5th player waits in the lobby (proposed) or can spectate?
- **Q21 — Host succession.** If the host leaves, the longest-connected player becomes host (proposed). Or should the host role be protected (e.g. by a password set at server start)?
- **Q22 — Kick.** Should the host be able to kick a player?

## Technical

- **Q23 — Stack.** TypeScript + Canvas client, Node.js + WebSocket server (proposed). Any preference?
- **Q24 — Hosting.** Where will the server run: your machine on the local network, your machine exposed to the internet, or a hosted service (to be chosen, prices to be checked)? This affects HTTPS and setup docs.
- **Q25 — Repository visibility.** The repo was created public. Should it be private?
