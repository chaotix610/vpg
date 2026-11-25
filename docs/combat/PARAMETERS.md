# Parameters

This document describes the ten offense and defense parameters each wrestler has, what they change, what they don't, and the other profile fields that sit beside them.

# 1. Overview

Each wrestler has ten parameters:

- **5 offense parameters**: Head, Body, Arms, Legs, Flying
- **5 defense parameters**: Head, Body, Arms, Legs, Flying

Each is **1 (weakest) to 5 (strongest)**. Across No Mercy's 256 roster entries, the ten add up to between **10 and 30**. **[Data]**

## 1.1 Point Budget (VPG design rule)

- Each parameter is between **1 and 5**.
- The ten together can't exceed **30**.
- Points can be left unspent to give a wrestler clear weaknesses.
- Created wrestlers start with **every value at 1**, leaving **20 points** to assign.

## 1.2 Example: The Rock [Data]

|Part|Offense|Defense|
|---|---|---|
|Head|2|2|
|Body|3|3|
|Arms|4|2|
|Legs|2|2|
|Flying|2|2|
|**Total**|**13**|**11**|

**Grand total 24** (6 points unspent): a strong upper-body attacker with solid body durability and little aerial ability.

# 2. What Parameters Do [Confirmed]

Parameters feed exactly one term of the damage formula: **Factor 2, the parameter bonus** (DAMAGE-SYSTEM.md §4.3).

$$
\text{Factor2} = \left\lfloor \max(0,\ A - B) \cdot D \cdot 0.1 \right\rfloor
$$

- **A** is the attacker's **offense** for the **part used**: the part of his body that delivers the move.
- **B** is the defender's **defense** for the **part hit**: the part of the opponent the move lands on.
- **D** is the move's base damage.

So:

- Equal values cancel out.
- Each point of advantage adds 10% of `D`, up to **+40%** (5 vs 1).
- A disadvantage does **nothing**. Defense can cancel the attacker's bonus but never lowers damage below Factor 1.

## 2.1 Part Used and Part Hit

Every move record names both parts (`part_used` and `part_hit` in nm-move-data.csv). **[Data]**

|Example|Part used → offense|Part hit → defense|
|---|---|---|
|Big Boot, Wheel Kick|Legs|Head|
|Clothesline|Arms|Head|
|Headbutt|Head|Head|
|Splash|Body|Body|

# 3. What Parameters Don't Affect

|Mechanic|Affected?|Why|
|---|---|---|
|**Holding a body part** (hurt animations)|No **[Confirmed]**|Joint damage comes from the move record alone (DAMAGE-SYSTEM.md §6), so the hurt animations start after the same number of hits whatever the parameters.|
|**Reversals and counters**|No **[Confirmed]**|The rolls use Spirit, weight and health; strike counters use timing (REVERSALS.md).|
|**A move's listed power grade**|No|The grade comes from the move's base damage.|
|**Pins and submissions directly**|No |Parameters only change health damage. Health then feeds the pin and submission timers (§4, §5).|

# 4. Pins

Pins don't depend on parameters directly. The kick-out timer depends on **[Confirmed]**:

- the **last** hit's damage
- the pinned wrestler's current **health** and **Spirit**
- the pinner's **Spirit**
- how many times he has been pinned before
- the average damage per hit over the last 30 seconds

The formula is in MOVE-SYSTEM.md. Parameters matter only because higher offense and lower defense mean more health damage per hit, so a pin sticks sooner. That matches the tests: higher offense takes fewer hits to pin; higher defense takes more.

# 5. Submissions

The rules **[Confirmed]**:

- **Tap-out:** at a wrench, the held wrestler submits when the targeted joint's stamina is at **0** and his Spirit is **90 or less**.
- **Joint damage per wrench** = the record's value + the **submission skill** matrix (attacker's skill vs defender's). Parameters play no part.
- **Escape:** a timer based on the attacker's Spirit and the held wrestler's Spirit and health.
- **Offense** only adds health damage per wrench, which lowers the held wrestler's health and so shortens his escape timer.

**Unresolved contradiction:** the escape formula in DAMAGE-SYSTEM.md §7
subtracts health, so lower health gives a **longer initial countdown**, contrary
to the sentence above. It also initializes on hold entry; repeated health damage
does not by itself specify a timer recalculation. Retain the formula and flag
the wording rather than changing either behavior by assumption.

So the order of influence the tests found still holds:

1. **Submission skill** (Novice / Normal / Expert): drives the joint damage that causes the tap-out.
2. **Offense** of the part used: a little, through health.
3. **Defense** of the part hit: barely, through health.

The rules are in DAMAGE-SYSTEM.md §6–7.

# 6. Other Profile Fields

No Mercy's wrestler profile has 49 fields. These are the ones whose use is known. **[Confirmed]** unless marked.

|Field|Use|
|---|---|
|0|**speed**: 1–3 in the roster (40 / 140 / 76 entries). With the leg joint it sets the walk and run **speed level** 0–3 (MOVEMENT.md §3.2): level 3 walks 6.75 units per update toward the opponent and runs 13.5; level 0 walks 4.5 and runs 9.0. It's the only profile field that affects speed|
|1|**reversal style**: picks which front reversal variant plays (REVERSALS.md)|
|2|**bleed tendency**: can he bleed, and how easily|
|3|health regained every 60 updates while standing|
|4|health regained every 90 updates while bleeding|
|5|Spirit bonus while bleeding (−1 / 0 / +1)|
|6|one check type's chance, and the AI|
|7|quick-recovery chance when knocked flat|
|8, 9|weapons|
|10–14|**offense**: head, body, arms, legs, flying|
|15–19|**defense**: head, body, arms, legs, flying|
|20|**dive reach factor** T: a dive's maximum reach is 2 × the record's dive reach × T, with T = 0.70 / 0.85 / 1.00 / 1.15 / 1.30 for values 0–4 (MOVEMENT.md §7.3). Roster: 0 (64), 1 (44), 2 (104), 3 (8), 4 (36). **[Confirmed]**|
|21|**weight factor**: the file value is **overwritten at match setup** with `(listed weight in lb − 100) / 42` (REVERSALS.md)|
|22|**submission skill**. Values in the roster: 0 (24 entries), 1 (72), 2 (160). **[Inferred]** 0 = Expert, 1 = Normal, 2 = Novice, matching the matrix's order.|
|24–26|AI|
|27, 30|finisher slots (marks a slot as the wrestler's finisher)|
|37–44|rivals and partner|
|45|flags: style bits, Combo style `0x2`, weight class `0x400` / `0x800` / `0x1000` (giant, set at setup from weight), `0x2000` (needed for most counters; every roster wrestler has it)|

- **Bleeding isn't cosmetic.** While bleeding, health regenerates at field 4 every 90 updates instead of field 3 every 60, and every Spirit gain or drain gets the field-5 bonus. **[Confirmed]**
- At load, the moveset loader also sets **capability bits** in the profile: one per special or flying slot the wrestler has a move for. The game only offers those moves when the bit is set (MOVE-SYSTEM.md).
- The legacy capability bit positions are not documented. The approved milestone-3 API uses numeric slot availability rather than inventing packed bits. Field 7 names a quick-recovery chance, but its complete lookup/formula is missing; temporarily use type 7's existing probability as approved in REVERSALS.md §8.
- **What the profile doesn't change** **[Confirmed]**: weight, height and movement style don't affect walking or running speed, and every standing wrestler pushes others away as a circle of the same radius (0.33 m). Strike reach does scale with the **model**: each joint's hit radius comes from the size of that bone (MOVE-SYSTEM.md §10.1).
- Fields 23, 28, 29, 31–36 and 46–48 have no known use here. The CPU pass names several of them; they'll be added with the CPU document.

# 7. Designing Wrestlers (VPG design rules)

## 7.1 Baseline

- **3 is average.** A wrestler with average abilities everywhere has all 3s, which uses the full 30 points.

## 7.2 Offense

Set offense by the parts the wrestler **attacks with**:

- High-flyers → high **Flying**
- Clothesline and lariat users → high **Arms**
- Big boots and kicks → high **Legs**
- Headbutt users → high **Head**

## 7.3 Defense

Set defense by durability: raise the parts a wrestler is known for taking punishment on, and lower them for a fragile one.

## 7.4 Archetypes

|Archetype|Offense|Defense|
|---|---|---|
|Powerhouse|high Body, Arms|high Body|
|Technician|high Arms, Legs|balanced|
|High-flyer|high Flying|low Body|
|Brawler|high Head, Arms|moderate|

## 7.5 Guidelines

- **Match stats to movesets.** A wrestler with many kicks should have good Leg offense, unless he's meant to be a weak kicker.
- **Avoid symmetrical builds** unless the wrestler is meant to be generic.
- **Use low stats deliberately** to create weaknesses and matchup variety.

## 7.6 Part Used and Part Hit for New Moves

No Mercy's moves already carry both parts. For a new move, set part used to the body part that delivers it and part hit to where it lands.

To check a move in game, hit an opponent with it until he starts holding a body part: that's the part hit. If nothing is held after about 20 hits, the move hits **Flying**. This works because joint damage, unlike health damage, isn't changed by parameters.

# 8. Summary

|Mechanic|Parameters affect it?|Notes|
|---|---|---|
|Health damage|**Yes**|Factor 2: +10% of `D` per point of advantage, up to +40%; never negative|
|Pin difficulty|Indirectly|Through health and last damage|
|Submissions|Indirectly, slightly|Submission skill dominates|
|Hurt animations / held limb|No|Joint damage comes from the move|
|Reversals and counters|No|Spirit, weight, health, timing|
|Listed move power|No|From base damage|
|Bleeding|Field 2, not offense or defense|Not cosmetic|
|Walk and run speed|Field 0 only|With the leg joint (MOVEMENT.md §3.2)|
|Dive reach|Field 20 only|MOVEMENT.md §7.3|
