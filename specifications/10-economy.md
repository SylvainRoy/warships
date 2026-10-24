# 10 — Economy

## Wallet and rewards

Each player has a private wallet, separate from score, which starts at $0. A wallet survives sinking and team switches, but resets on a new round, Reset scores, or leaving. Base income continues to award score points only.

With Treasures & upgrades enabled, the server awards $100 to the final-damage player for a sink, $50 for a neutral or enemy base capture, $100 for an enemy-home capture, and $25 for collecting a treasure. A credited turret member receives sink money when their turret sinks a boat. Own money events appear as gold `+$N` and play the coin sound. The end screen reports `$ earned` for information only; money does not change winners (Q238–Q239, Q249).

## Treasures

Small, Standard, and Big maps have 10, 20, and 40 treasures. Each is placed in water at least 40 u from land, 200 u from boats, and 200 u from harbours. A roughly 12 u gold chest has a subtle sparkle. Any alive hull touch collects it, including during spawn protection; an immediate replacement is attempted. If placement attempts fail, the simulation retries on a later tick. The radar paints small gold dots as its sweep passes (Q240–Q241).

Placement is deterministic from simulation tick, next projectile ID, and a placement counter; it adds no random field to `GameState`.

## Boat upgrades

A rebindable U opens the upgrade panel only while the whole living own hull is inside an active harbour owned by its team. The panel sits bottom-left above the hull dial; digits 1–6 purchase in menu order. U, Esc, or leaving the harbour closes it. Other gameplay controls continue. A repair lock blocks purchases and displays `Under fire — leave the harbour and come back`; unaffordable rows are dimmed (Q242–Q243).

Each track has three levels costing $100, $200, then $400:

| Key | Track | Effect per level |
|---|---|---|
| 1 | Speed | +10% forward and reverse speed |
| 2 | Cannon range | +100 u maximum range |
| 3 | Hull | +25 max HP and current HP immediately |
| 4 | Cannon damage | +3 damage against frigates only |
| 5 | Torpedo speed | +20%; fixed when launched |
| 6 | Torpedo damage | +5 damage |

Upgrades persist through sinking and team switches; hull repair fills to max HP. A new round or Reset scores clears wallet and upgrades. Enemy health bars scale to upgraded maximum HP, and Tab shows compact upgrade levels (Q244–Q246).

Normal and Hard bots seek the nearest treasure within 500 u when no enemy is visible and they are not resupplying; Easy bots do not detour. At resupply, bots buy at most one affordable upgrade per think tick, in this order: hull, cannon damage, cannon range, speed, torpedo damage, torpedo speed (Q247).

## Host setting

The host setting **Treasures & upgrades** defaults On. Off clears treasures, disables money awards, purchases, and upgrade effects; it resets all wallets and upgrade levels and hides economy UI. Turning it On fills the current map with treasures (Q248).
