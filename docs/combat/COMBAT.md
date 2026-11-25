# Combat Guide

How fighting works in Virtual Pro Grappler (VPG), explained in plain terms.

VPG is a modern professional wrestling game built on the gameplay of the AKI
engine from the classic N64 wrestling games. This guide explains how the system works and why. The [combat specs](#13-further-reading) hold the exact rules and numbers; where this guide and a spec disagree, the spec is right.


## Contents

1. [The core idea: everyone has the same slots](#1-the-core-idea-everyone-has-the-same-slots)
2. [Time and controls](#2-time-and-controls)
3. [Moving around](#3-moving-around)
4. [Strikes](#4-strikes)
5. [Guarding and countering strikes](#5-guarding-and-countering-strikes)
6. [Grappling](#6-grappling)
7. [On the mat](#7-on-the-mat)
8. [Spirit and Special!](#8-spirit-and-special)
9. [The turnbuckle and dives](#9-the-turnbuckle-and-dives)
10. [Damage and condition](#10-damage-and-condition)
11. [Where it lives in the data](#11-where-it-lives-in-the-data)
12. [Open questions](#12-open-questions)
13. [Further reading](#13-further-reading)

---

## 1. The core idea: everyone has the same slots

Every wrestler has the same set of **move slots**, numbered 1–291. A slot is a
situation plus an input, such as "front lock-up, strong grab, Up + A". Each
wrestler's **moveset** puts one move (or nothing) in each slot. AKI-MAN and
Steve Austin press the same buttons in the same situation and get different
moves.

When a button is pressed, the game works out which slot to play from:

- the buttons pressed, and any D-pad direction;
- whether each button was tapped or held;
- what both wrestlers are doing (standing, running, locked up, lying face up…);
- where they are relative to each other: how far apart, in front or behind, at
  the head or at the feet;
- where they are in the arena: ring, apron, floor, corner, top turnbuckle;
- Spirit, and whether the wrestler is in Special!.

The code never names a move. Each state picks a **slot number**, and the
moveset supplies the move in that slot.

**Example: a downed opponent.** The opponent is lying face up and you stand
near their head. Pressing A plays your slot **236**
(`upper_body_submission_facing_up`, "Ground Grapple: Head, Face Up"). If they
were lying face down, the same press would play slot **238**. Near their feet,
it would be **240** (face up) or **242** (face down).

**Example: both standing.** You stand close to your opponent and press A. You
try to grab them. If the grab connects, the two of you are in a **lock-up**,
and your next A or B press picks a move from the lock-up slots (§6).

### Words used in this guide

|Term|Meaning|
|---|---|
|**actor**|the wrestler performing a move|
|**target**|the wrestler receiving it (the code also calls this the **receiver**)|
|**attacker / defender**|the two roles in a lock-up. They swap when the defender reverses.|
|**state**|what a wrestler is doing right now: standing, running, locked up, lying… States keep No Mercy's numbers, e.g. state 1 (standing) or state 81 (lock-up attacker).|
|**slot** / `slot_id`|a numbered moveset position, and its readable name|
|**moveset**|which move a wrestler has in each slot|
|**engagement**|two wrestlers put into matching states at the same moment, such as a lock-up or a move being played|
|**update**|one step of the game logic. 30 updates = 1 second.|
|**reversal**|a grapple whose roles swap, so the defender ends up performing a move|
|**counter**|a strike stopped by a well-timed guard, usually followed by the defender's own move|
|**Special!**|a powered-up state, reached by taunting with full Spirit (§8)|

---

## 2. Time and controls

### Time

The game logic runs at a fixed **30 updates per second**, and every timer
counts updates. Drawing the screen is separate and smooths between updates.
Useful conversions: 8 updates ≈ 0.27 s, 30 updates = 1 s, 150 updates = 5 s.

Each update, every wrestler takes one turn. The wrestler who goes first moves
along by one each update, so over a match nobody wins every tie. If two
strikes would both land on the same update, the striker whose turn comes first
connects, and that hit interrupts the other strike.

### Buttons

Combat reads a virtual **N64 pad**. The control mapper binds it to a keyboard,
mouse or gamepad. The computer opponent presses the same virtual pad, so it
faces the same timing windows, rolls and timers as a human.

|Button|Nickname|Main jobs|
|---|---|---|
|**A**|Grapple|grab; ground grapple near a downed opponent; with B, pick a move in a lock-up; dives|
|**B**|Strike|strikes; with A, pick a move in a lock-up|
|**R**|Block|hold to guard against strikes; as the attacker, break off a lock-up; while running, Roll or Cartwheel; cancel a turnbuckle climb; also picks up a downed opponent or pulls one out of a corner|
|**L**|Evade|a timed press blocks an incoming grab; in a front lock-up, the corner hang; while running, duck around behind the opponent (agreed, not built yet)|
|**C-Down**|Run|run; Irish whip in a lock-up|
|**C-Up**|Transit|get in and out of the ring (tap = apron, hold = all the way); in a lock-up, tag/partner options, or a shoulder carry from behind|
|**C-Left**|—|roll a downed opponent over; spin a dazed one; act on one stuck in the corner; hold it in a ground grapple to drag|
|**C-Right**|Focus|switch which opponent you face|
|**D-pad**|—|move; adds a direction to a move choice|
|**Control Stick**|—|taunts; specials (finishers) in Special!|

Every reversal and counter press accepts **A, B, L or R**.

**Directions are fixed to the world**, not to the camera or the wrestler. Up
is always north and Right is always east. Inside the ring, a diagonal heads
straight for its corner (Up+Right goes to the north-east corner). Outside the
ring, diagonals are ordinary NE / SE / SW / NW.

### Tap or hold

A button held for **8 updates** (about a quarter of a second) is a **hold**;
released sooner, it is a **tap**.

- **A**: tap = weak grab, hold = strong grab.
- **B**: tap = weak strike, hold = strong strike.
- **C-Up**: tap stops on the apron, hold goes all the way.

### Mashing

Get-up, stun and submission-escape timers can be shortened by mashing A, B, L
or R. Only one press every 3 updates counts, and every 4th counted press takes
one extra update off. Pins use a separate, stronger table (§7).

### Focus

Each wrestler always has a **focused opponent**. Standing or walking, they turn
to face that opponent by up to 30° per update. **C-Right** cycles through
opponents from nearest to farthest. Dives aim at the focused opponent.

---

## 3. Moving around

This section is a short summary. [MOVEMENT.md](MOVEMENT.md) has the full rules.

- **Walking.** The D-pad moves at full speed at once, with no acceleration.
  Walking toward the focused opponent is faster than walking away. Speed comes
  from the wrestler's speed rating and leg stamina: worn-down legs (below 30,
  then below 10) drop the speed by a level. Walking into the ropes just stops.
- **Pushing a dazed opponent.** Walk straight into a dazed opponent to push
  them along at half speed.
- **Running.** Press C-Down. Running is twice the forward walking speed. With a side
  direction held, the run goes straight at that side's ropes; with a diagonal
  held in the ring, it goes to that corner; with no direction, it heads for
  the focused opponent. The run keeps going after you let go. A fresh D-pad
  or C-Down press stops it at once.
- **Rebounds.** A runner who hits the ropes nearly head-on bounces straight
  back across the ring, whatever angle they came in at.
- **Corners.** A diagonal run stops in the corner. Keep C-Down held to climb
  the turnbuckle instead (§9).
- **Running defenses.** R plays the wrestler's Roll or Cartwheel (slot 208).
  L ducks around behind the opponent; this is agreed but not yet mapped to an
  animation.
- **In and out of the ring.** Touch the ropes or apron edge with the D-pad
  pointing into it and press C-Up. Tap to stop on the apron; hold to go all
  the way to the floor (or from the floor into the ring). Pressing C-Up while
  running into the ropes takes you out to the apron. Running into the ring
  skirt from the floor with C-Down held slides you into the ring.
- **Bodies.** Wrestlers push each other apart a little each update. Nothing
  snaps a wrestler into position.

---

## 4. Strikes

### Standing strikes

|Input|Situation|Slot|
|---|---|---|
|tap B|opponent closer than 1 m|**172** weak arm strike (173 with the D-pad)|
|tap B|opponent 1 m or farther away|**174** weak leg strike (175 with the D-pad)|
|hold B|standing opponent|**186** strong strike (188 with the D-pad; 190 holding A+B)|
|tap B|opponent running at you|**205** strike at a runner (hold B for a strong strike instead)|
|B|opponent lying in front of you, within 1.2 m|**209** face up, **210** face down, **213** sitting, **214** sitting face-down|
|B|opponent pinning or holding someone, within 1.2 m|**222** stomp|
|tap B|opponent stuck in the corner|**176** (177 with the D-pad)|
|tap B|opponent in the tree of woe|**178** (179 with the D-pad)|
|hold R, press B|while getting up|**217** recovering attack|
|B|on the apron|**218** into the ring or **219** outside; **220 / 221** if the opponent is on the apron too|

For weak strikes, **distance** decides between the arm and leg strike, not a
separate button.

### Running strikes

|Input|Situation|Slot|
|---|---|---|
|B|default|**192** on the first leg of a run started without the D-pad; **196** after a rebound or on any D-pad run. With A also held: **194 / 198**|
|B|opponent whipped into, or stuck in, a corner|**200** (202 with A)|
|B|opponent in the tree of woe|**204**|
|B|opponent lying within 1.3 m|**211** face up, **212** face down, **215** sitting, **216** sitting face-down|
|B|opponent pinning or holding someone|**223** running stomp|

The `slot_id`s call 192/194 "weak" and 196/198 "strong", but the real
difference is whether the run was aimed or had rebounded, not how hard the
strike is.

### How a strike hits

- A strike can only connect during its animation's **hit window**. The first
  hit ends the search.
- The game checks the striking body parts named by the move (for a right punch,
  usually the right forearm, hand and fingers) against the target's **head and
  pelvis**. Hit sizes come from each character model, so bigger models reach,
  and are reached, from slightly farther away.
- Standing and running strikes can't hit a lying wrestler. Ground strikes only
  hit lying wrestlers.
- If the target is facing away, the hit counts as **from behind**: it plays a
  different reaction, and a guard can't stop it.

### How the target reacts

A connecting strike produces one of three reactions:

|Reaction|What happens|
|---|---|
|**light**|a flinch; the target stays standing|
|**stagger**|the target stumbles and ends doubled over|
|**heavy**|always a knockdown|

A roll picks the reaction from the target's health, how many hits they have
taken in a row (counted up to 4) and the type of strike:

- A **weak strike never knocks down** a standing opponent. It staggers more
  often as health drops and as hits stack up.
- A **strong strike never gives a light reaction** on a standing opponent. It
  knocks them down 10%, 30%, 50% or 65% of the time as their health falls
  below 128, 64 and 32.
- Dazed, doubled-over and running targets react worse, and a strike at a runner
  usually lands big.

Damage lands when the reaction starts, not at the moment of contact. There is
no hit pause. A heavy reaction right at the ropes can send the target **over
the top rope** to the floor.

### Strikes don't chain

Pressing B during a strike doesn't queue another one. B is read again only
once the striker is back to standing. A move can still **link** into a strike
automatically (§6.6).

---

## 5. Guarding and countering strikes

**Guard.** Hold R. The guard lasts at least 5 updates and keeps turning to face
the opponent. It blocks any strike from the front, weak or strong. A blocked
strike does no damage and gives the blocker +1 Spirit. After releasing R, the
wrestler is back to standing 6 updates later.

A guard can't stop hits from behind, weapon strikes or a few specially flagged
strikes. A runner who runs into a guarding wrestler bounces off instead of
striking.

**Counter.** Start guarding **at most 2 updates before** a strike lands. There
is no roll; timing is everything.

|Incoming strike|Counter|
|---|---|
|weak punch (172 / 173)|your slot **180** counter punch (**181** if you are in Special! at Spirit 100)|
|weak kick (174 / 175)|you catch the leg, then press A for **183** or B for **184** within 90 updates (30 if the kicker is in Special!). Press nothing and the kicker escapes with their own **182**. If you are in Special!, **185** plays at once.|
|strong or running strike|you play the striker's counter slot (their slot + 1: 187, 189 … 203), taken from the **striker's** moveset|

The strike at a runner (205) and the recovering attack (217) **can't be
countered**; a fresh guard just blocks them.

**Example.** In No Mercy, Austin guards Rock's weak punch at the right moment,
deflects it, and automatically follows with his Austin Punch: his counter
(slot 180) links to his own slot 188. Countering Rock's clothesline instead
catches the arm and takes him down into a ground submission.

A dazed, doubled-over or staggering wrestler who presses R, L or A at the
right moment can roll for a **dazed counter**. What each success plays hasn't
been traced yet.

---

## 6. Grappling

### 6.1 The grab

1. Press **A** next to a standing opponent to start a **grapple attempt**.
   (Next to a lying opponent, A starts a ground grapple instead; see §7.)
   Pressing B as well turns it into a strike.
2. **Tap** A for a **weak** grab; **hold** it for 8 updates for a **strong**
   grab. The strength is fixed when the attempt starts. It decides which
   lock-up slots you get, how long you have to pick a move, and how easily the
   opponent can reverse it.
3. The grab can only connect at one moment of its animation:

|Grab|Animation|Can connect on|
|---|---|---|
|weak|22 updates|updates 13–14|
|strong|34 updates, starting once A has been held for 8 updates|updates 20–21|

   A strong grab is slower and easier to see coming.
4. If nobody is in reach at that moment, the wrestler grabs air and returns to
   stance.

When the grab connects, the first matching rule wins:

|Situation|Result|
|---|---|
|the target pressed L in the last 5 updates (grapple block)|the grab is countered|
|the target is dazed, doubled over or staggering, pressed L under 3 updates ago and wins a roll|the grab is countered|
|the target had just started their own grab (within its first 3 updates)|a lock-up with roles flipped: the **target** becomes the attacker|
|the grabber is behind the target|**back** lock-up|
|otherwise|**front** lock-up|

**Running grapple.** Holding A while running plays slot **104**, or **105**
from behind. It goes straight into the move: there's no lock-up and no
reversal roll. Only a grapple block stops it.

### 6.2 The lock-up

Once locked up, the grabber is the **attacker** and the other wrestler the
**defender**. After 6 updates of getting into position, the attacker has a
clock to choose what to do:

|Grab|Time to pick|
|---|---|
|weak|150 updates (5 s)|
|strong|210 updates (7 s)|
|defender in Special!|90 updates (3 s)|

The attacker's options:

|Input|What happens|
|---|---|
|**A or B**, with or without a D-pad direction|a grapple move from the tables in §6.3|
|**Control Stick**|a special (finisher): slot **70** from the front, **81** from behind. Needs Special! when the grab started, and a strong grab.|
|**A+B together**|steal the defender's finisher: plays the **defender's** own 70 or 81. Same requirements as a special.|
|**C-Down**|Irish whip (§6.5); a strong grab makes a strong whip. From behind, C-Down starts a separate back-hold option instead.|
|**L** (front only)|the **corner hang**: hangs the opponent upside down in the corner, leaving them in the tree of woe|
|**C-Up**|tag/partner options in tag matches; from behind, a **shoulder carry**. A carried wrestler can mash to escape.|
|**C-Right**|a lock-up option whose effect hasn't been traced yet|
|**R** alone|break off the hold; no move|
|**D-pad held 7+ updates**|walk the opponent around the ring together (a stand-in until the original code is found)|
|nothing before the clock runs out|both let go and return to neutral|

A quick D-pad press is part of a move choice; holding it for 7 updates or
more walks the pair instead.

If several inputs arrive together, the order is: finisher steal, then C-Down,
L, C-Up, C-Right, A, B. So C-Down still whips while A is held down from the
grab.

The pick reads a press from this update or the one before, so it is almost
instant. The defender's reversal press must come before the pick (§6.4).

### 6.3 Lock-up move tables

**Front lock-up.** On a diagonal, Up or Down wins over Left or Right.

|D-pad|Weak A|Weak B|Strong A|Strong B|
|---|---|---|---|---|
|none|1|5|25|45|
|Left or Right|2|10|30|50|
|Up|3|15|35|55|
|Down|4|20|40|60|

The Control Stick in Special! plays slot **70** (`front_finisher`).

The readable names follow the table, reading down each column: weak A is
`front_weak_grapple_1`–`4`, weak B is `front_weak_grapple_5`–`8`, strong A is
`front_strong_grapple_1`–`4` and strong B is `front_strong_grapple_5`–`8`.

Why the numbers jump by 5: each of slots 5–60 is followed by four slots that
hold its **reversal variants** (6–9 reverse slot 5, 11–14 reverse slot 10, and
so on). The game fills these automatically. Weak A moves (1–4) have no
reversal slots, and none of the roster's weak A moves are reversible.

**Back lock-up.** Any D-pad direction counts the same.

|D-pad|Weak A|Weak B|Strong A|Strong B|
|---|---|---|---|---|
|none|73|75|77|79|
|any direction|74|76|78|80|

The Control Stick in Special! plays slot **81** (`back_finisher`).

**Corner and apron lock-ups.**

|Lock-up|Weak A|Weak B|Strong A|Strong B|Special|
|---|---|---|---|---|---|
|in a corner, from the front|108|113|118|123|128|
|in a corner, from behind|130|132|134|136|138|
|you in the ring, opponent on the apron|145|145|146|146|147|
|you on the apron, opponent in the ring|149|149|150|150|151|

Two more grabs skip the lock-up entirely: grabbing an opponent on the apron
from the floor plays slot **154** (the same move for everyone), and grabbing
an opponent who is climbing or perched on the turnbuckle plays **141** (front)
or **142** (from behind).

### 6.4 Reversals

How the defender reverses a lock-up:

1. Press **A, B, L or R** once before the attacker picks. That press makes
   **one** roll. Extra presses don't help.
2. A win is stored. It only matters if the move the attacker then picks is
   **reversible** (350 of No Mercy's 2,095 move records are). Otherwise the
   stored win is thrown away and the move plays normally. Special moves are
   never reversible.
3. If the attacker is in Special! and the defender isn't, no reversal is
   possible.

The chance starts from the **defender's Spirit**:

|Defender's Spirit|Chance|
|---|---|
|100|50%|
|81–99|33%|
|61–80|25%|
|31–60|13%|
|11–30|6%|
|0–10|3%|

Then:

- **× 2** if the defender is in a heavier weight bracket than the attacker
  ([REVERSALS.md §2.5](REVERSALS.md#25-weight-confirmed) lists the brackets);
- for a **strong grab** only: **× 4** if the defender's health is 192 or more,
  **× 2** if it is 128–191 (a defender in Special! uses Max Health instead);
- capped at 100%.

So strong grabs are risky early in a match. **Example:** Jeff Hardy grabs
Undertaker, who has 61–80 Spirit. The base chance is 25%, doubled to 50%
because Undertaker is heavier. If it was a strong grab and Undertaker still
has 192+ health, it is multiplied by 4 again: 100%.

What a reversal looks like:

|Lock-up|What happens|
|---|---|
|front, and front in a corner|the attacker's move starts, then the roles swap at the move's **reversal frame** (almost always its first frame). The reversal comes from the **attacker's** moveset: one of the slots just after the chosen move (6–9 for slot 5). The **defender's reversal style** picks which one, so the same move can be reversed in up to four ways depending on who reverses it.|
|behind, in a corner|the attacker's slot + 1 (131, 133, 135 or 137)|
|behind|the defender plays their own slot **84** (weak grab) or **85** (strong grab)|
|apron|the defender plays their own **148** (defender on the apron) or **152** (defender in the ring)|
|Irish whip|the whip starts, then whipper and whipped swap at the reversal frame. Every whip can be reversed.|

A reversal is an ordinary move: it deals normal damage and gives its own
Spirit. The cancelled move gives nothing.

**Giants** are wrestlers listed at 400 lb or more (in the No Mercy roster:
Rikishi, Mark Henry, Viscera and Andre the Giant). Against a giant:

- the giant rolls as soon as the lock-up starts, with no button press needed;
- the chance is 50%, minus 1% for every point the attacker's Spirit is above
  the giant's; weight and health don't count;
- a move that can't lift a giant is replaced by slot **159** (front) or
  **161** (back), the same fallback move for everyone;
- a giant reversing from behind plays slot **162**.

**Grapple block.** Pressing L while standing, just before a grab connects
(within 5 updates), counters the grab. It is a timed press, not a hold. It
also stops running grapples, which can't be reversed any other way.

### 6.5 Irish whips

Pressing **C-Down** in a lock-up whips the opponent into a forced run. A strong
grab makes a **strong whip**. Which direction the whip sends them is not
specified yet ([§12](#12-open-questions)).

A whipped runner can't stop or steer. Instead, they get **whip counters**,
rolled on the runner's Spirit:

|Runner's Spirit|100|81–99|61–80|31–60|11–30|0–10|
|---|---|---|---|---|---|---|
|Chance|100%|50%|33%|25%|20%|12.5%|

- **Into a corner**, between 0.75 m and 1.75 m from it: A plays the corner
  counter (slot **207**); B, L or R stops and turns round.
- **Off the first rope**, in the first 3 updates of the rebound: B, L or R
  grabs the ropes and stops; A rebounds normally.
- **Into a solid outside wall** (barricade, steps, ring skirt, announce table):
  the runner crashes. One press of A, B, L or R rolls to recover; failing
  leaves them dazed for a long time.
- **Into a ring post**: they fall and end up lying. No counter.

There are no whip counters if the whipper is in Special! and the runner isn't.

Meeting the runner as they come back:

|Input|Slot|
|---|---|
|tap B|**205** strike at a runner|
|tap A|**86** after a normal whip, **90** after a strong whip|
|hold A|**88** after a normal whip, **92** after a strong whip|
|Control Stick, in Special!|**94**|

A catch flows straight into its throw, the next slot (87, 89, 91, 93 or 95).
Slots 86 and 88 also work on a runner who wasn't whipped but is coming at you.

### 6.6 What happens when a move plays

The actor and the target each play their half of a **paired animation**; the
target is placed against the actor using the move's placement data. The
move's animation data decides:

- how long the move lasts;
- when a grab can connect, or when a strike can hit;
- the **reversal frame**, where a front reversal swaps roles;
- where the target ends up: the animation's **end code** names their next
  state (standing, dazed, doubled over, lying face up, face down or sitting,
  stuck in the corner, or in the tree of woe);
- which area each wrestler ends in (ring, apron or floor). This is how a move
  can leave someone outside the ring;
- how far each wrestler turns by the end.

When the move ends:

- its damage is applied **once**, however many impacts the animation shows;
- the actor returns to stance;
- the target enters the state their end code names, with a short **stun**:
  `100 − (Spirit/2 + Health/4)` updates, or none in Special!. A fresh
  wrestler shakes it off in about a third of a second; a worn-down one takes
  much longer;
- nothing snaps the two wrestlers apart. Any overlap is pushed out over the
  next few updates.

**Links.** A move can name another slot to play next, automatically:

- a strike, such as Austin's counter flowing into the Austin Punch;
- back into the lock-up;
- a random back grapple from 73–76 (weak) or 77–80 (strong). This is how moves
  that end behind the opponent continue from behind;
- a hold: a submission or a pin-type hold (§7).

---

## 7. On the mat

### Lying and getting up

A lying wrestler is face up, face down, sitting up, or sitting face-down
(kneeling on all fours). The posture comes from the end code of the animation
that put them there.

Their **get-up timer** starts at:

```text
3 × LastDamage + 180 − (Health + Spirit) / 2 − 80 × KnockdownsInARow
```

- Bigger hits and lower health and Spirit keep a wrestler down longer.
- Each knockdown in a row (without standing up in between) takes 80 updates
  off, so a wrestler knocked down again and again gets up quicker each time.
- After being knocked flat or released from a submission, `LastDamage` counts
  as 180.
- The timer is zero in Special!, and mashing shortens it.
- When it runs out, the wrestler gets up or rolls away. They stay down while
  tilting the stick, while something blocks them, or while the opponent is
  taunting at them or running at them.
- Climbing the turnbuckle while the opponent is down adds the climb's length
  to their get-up timer, so climbing never lets them up sooner.

Dazed, doubled-over, cornered and tree-of-woe wrestlers have similar **stun
timers**, also shortened by mashing.

### Ground grapples

Press **A** near a lying opponent (within 1 m). The slot depends on their
posture and which end you are at:

|Opponent|At the head|At the feet|
|---|---|---|
|face up|236|240|
|face down|238|242|
|sitting|244|248|
|sitting face-down|246|250|

- In Special!, a lying (not sitting) opponent gets the **ground specials**
  155–158 instead, if filled. A+B together in Special! uses the
  **opponent's** ground special.
- Holding **C-Left** drags the opponent instead of picking a move.
- These `slot_id`s say "submission", but the slots can hold any ground move.

**Ground reversal.** The wrestler on the mat presses A, B, L or R once to make
one roll on **Spirit alone** (the lock-up Spirit table, with no weight or
health bonus). Success plays the reversal for that posture: slot 237, 239 …
251, one after each ground grapple slot. These are the same eight moves for
every wrestler. No ground reversal is possible if the actor is in Special! and
the wrestler on the mat isn't.

Other ways to work on a downed opponent: **B** for a ground strike, **C-Left**
to roll them over (face up ↔ face down), **R** to pick them up, or a dive (§9).

### Submissions

A move can link into a **submission hold**. Its opening hit lands once; then
every 31 updates the hold **wrenches**, applying its repeating part.

- **Submission skill** (Novice, Normal or Expert, for both wrestlers) adds or
  removes joint damage on each wrench.
- **Tap-out:** at a wrench, the held wrestler submits if their Spirit is 90 or
  less and the targeted body part's stamina is at 0.
- **Escape:** mashing runs down an escape timer of
  `(300 + AttackerSpirit/2 − Spirit/4 − Health) / 2` updates (60 in Special!).
- **Rope break:** with the rope-break rule on, a hold that allows it breaks at
  the ropes. Pressing buttons also crawls the held wrestler toward the ropes.

Some submission details are still open questions in the
[decision log](IMPLEMENTATION-DECISIONS.md#4-questions-still-open).

### Pins

A pin comes from a move whose record ends in a pin, such as some dives. A
**pin-type hold** pins and also deals damage every 31 updates. How a plain
cover is chosen isn't settled yet (§12).

The pinned wrestler gets a **kick-out timer**:

```text
PinnerSpirit/5 + LastHitBonus + 95 + 2 × TimesPinnedBefore
  − (Spirit/3 + Health/2) + max(0, AverageDamage − 15)
```

`LastHitBonus` is 10–25 depending on the last hit's damage, and
`AverageDamage` is the average damage per hit over the last 30 seconds. The
timer never starts below 15.

- The timer drops 1 per update. Mashing takes more off as the referee's count
  rises.
- When it goes below 0, the wrestler kicks out, unless they are tilting the
  stick that update.
- The referee counts once every 30 updates. At 3, the pin wins.
- With the rope-break rule on, a pinned wrestler touching the ropes breaks the
  pin.

In practice: **Spirit 90 or more always kicks out**, and fresh wrestlers kick
out almost at once, since half their health comes off the timer. Late in a
match, a big last hit, a high-Spirit pinner and a run of heavy damage all keep
the shoulders down.

---

## 8. Spirit and Special!

**Spirit** is the momentum meter. It runs from 0 to 100 and starts at 50.

- **Up:** landing moves (each move sets its own gain, +3 extra when the
  attacker's health is 48 or less), blocking (+1) and reversals.
- **Down:** taking moves, and being hit while taunting (−10).
- **Drift**, every 4 seconds while standing: above 50, −1; 31–49, +2; 30 or
  less, +3. Standing in the ring while the opponent is outside costs 8 instead.

Spirit has three special states, during which it doesn't move:

|State|Starts|Lasts|Then Spirit is|
|---|---|---|---|
|**Empty**|Spirit reaches 0|10 s (300 updates)|40|
|**Full**|Spirit reaches 100|20 s (600 updates)|70|
|**Special!**|a taunt while Full|20 s (600 updates), minus 2 s (60 updates) for every hit taken|60|

Performing a special or finisher doesn't end Special!.

**What Special! gives:**

- specials and finishers become available (Control Stick in a lock-up, ground
  specials, special dives and catches);
- damage × 1.2, and your own body-part stamina counts as fresh for damage and
  speed;
- the opponent can't reverse your lock-ups unless they are in Special! too;
- an opponent who grabs you gets only 90 updates to pick a move;
- instant get-up and no stun; the submission escape timer starts at 60;
- no KO roll.

**Taunts** use the Control Stick:

|Input|Slot|
|---|---|
|stick up / left / right|**227 / 228 / 229**, when Spirit isn't Full and you're not in Special!|
|stick down|kneel|
|stick when Full, or already in Special!|**230** special taunt; starts Special! if Full|
|stick on the apron / getting up / in a corner with the D-pad toward it / on the top turnbuckle|**234 / 231 / 232 / 233**|
|after winning|**235**|
|**mock taunt:** within 7 updates of a stick taunt, swing the stick at least 135° the other way|plays one of the **opponent's** taunts|

---

## 9. The turnbuckle and dives

**Climbing.** Run diagonally to a corner and keep C-Down held, or hold toward
the corner and press C-Down while already there. This also works from the
apron. A wrestler with no flying moves in their moveset can't climb.

**Perched.** Hold A, B or C-Down to wait, for up to 5 seconds. Release all of
them to jump. R pressed any time before the jump cancels the dive and climbs
back down. The Control Stick plays the top-rope taunt (233).

**The dive** is picked at the jump, from the focused opponent's situation:

|Opponent|Slot|
|---|---|
|standing in the ring|**256** (257 in Special!)|
|lying, pinning, pinned or held in the ring|**261** (262 in Special!)|
|standing outside or on the apron|**263**|
|down outside|**264**|

**Other aerial moves:**

|Input|Situation|Slot|
|---|---|---|
|A at the ropes|opponent outside|**268**|
|A at the ropes, D-pad toward them|opponent lying in the ring|**269** springboard|
|A in a corner, D-pad into it|opponent lying in the ring|**270** second-rope attack|
|A while running in the ring|opponent outside|**265** on the first leg of a no-D-pad run, **266** otherwise; **267** diving taunt if the wrestler has neither|
|A while running in the ring after a rebound|—|**278** rebound flying attack|
|A on the apron, D-pad toward the edge|opponent outside|**271**|
|A while running along the apron|opponent outside|**272**|
|A on the apron, D-pad toward the ring|opponent in the ring|**273** standing, **274** down, **275** in Special!|

**Flight.** A dive aims at the focused opponent. Its reach depends on the move
and the wrestler's dive-reach rating; an opponent out of reach makes the diver
land short.

- **Hit:** the target goes down. A dive whose move ends in a pin goes straight
  into the pin. Landing on someone who is pinning or holding breaks the hold.
- **Miss:** the diver loses Spirit (set per move) and can hurt themselves on
  landing.

---

## 10. Damage and condition

### Health

- **Health** starts at 255. It regenerates every 2 seconds while standing (on
  a different schedule while bleeding), and never above Max Health.
- **Max Health** starts at 255 and **never regenerates**. Every hit takes a
  quarter of its damage off Max Health (at least 1), down to a floor of 64. A
  long match wears a wrestler down for good.

### Body parts

Each wrestler has five stamina pools: **head, body, arms, legs** and
**flying**. Each starts at 50 and **never recovers** during a match. Every
move damages specific parts.

- The attacker's own stamina in the part they attack with scales their damage,
  so a worn-out arm hits more softly.
- Leg stamina below 30, then below 10, slows walking and running.
- Below 15, a limb looks hurt: the wrestler switches to hurt standing and
  walking animations.
- Submissions tap out when the targeted part reaches 0 (§7).

### The damage formula

A move's damage is built in four steps from its **base damage** (0–45):

1. Base damage × (attacker's stamina in the part used + 50) / 100.
2. Plus 10% of base damage for each point the attacker's **offense** exceeds
   the defender's **defense** for the parts involved (up to +40%; never
   negative).
3. Plus 1 for every 20 points of Spirit lead (up to +5).
4. × 1.2 if the attacker is in Special!.

**Technical** moves deal joint damage only, with no health loss.

**Parameters** are five offense and five defense values (head, body, arms,
legs, flying), each 1–5. They only affect step 2. Created wrestlers get up to
30 points in total. See [PARAMETERS.md](PARAMETERS.md).

### KO and bleeding

- **KO:** once a wrestler's health is below 25, each hit with a KO chance
  rolls for a knockout. With the KO rule on, that ends the match. There is no
  KO roll on the apron or in Special!.
- **Bleeding:** some moves can open a cut. A bleeding wrestler regenerates
  differently and gains or loses Spirit a little differently.

---

## 11. Where it lives in the data

|File|Holds|
|---|---|
|[`data/combat/move-slots.json`](../../data/combat/move-slots.json)|all 291 slots: name, input, conditions, and where each slot's move comes from|
|[`data/combat/moves.json`](../../data/combat/moves.json)|the move catalog: names, eligible slots, power grades, animation files|
|`data/reference/no-mercy/_all-wrestlers.json`|the 64 No Mercy movesets and profiles, used as reference input|
|`data/animations/animations.json`|animation clips and paired-move placement|

Where each slot's move comes from (the `fill` field):

|Fill|Count|Meaning|
|---|---|---|
|`stored`|157|chosen in the wrestler's moveset|
|`derived`|95|worked out at load from a stored move's family: reversal variants, whip-catch throws, strike-counter versions|
|`fixed`|13|the same move for everyone: giant fallbacks 159 / 161, the apron grab 154, apron strikes 220 / 221 and the eight ground reversals|
|`combo_only`|2|used only by a moveset style no roster wrestler has|
|`unused`|24|never filled|

Holds also get an extra **continuation** slot (numbered from 292 up) for their
repeating part. A VPG moveset only stores the 157 stored slots; everything
else is built when the match loads.

---

## 12. Open questions

These behaviors are not decided yet. Settle each one in the owning spec before
it is implemented.

- **Which way an Irish whip goes.** The specs say C-Down whips, but not which
  direction. *Proposed:* with no D-pad, whip in the most likely direction;
  with a D-pad direction, whip that way (a side direction toward those ropes,
  a diagonal toward that corner).
- **Switching between front and back holds.** *Proposed:* L in a lock-up
  swaps between a front and a back hold. *Current spec:* L from the front is
  the corner hang, and there is no swap button. A wrestler gets behind the
  opponent through moves that link into a back grapple (§6.6).
- **Throwing the opponent out of the ring.** *Proposed:* C-Up in a front
  lock-up near the ropes throws the opponent outside, landing face up.
  *Current spec:* C-Up in a lock-up is tag/partner options, or a shoulder
  carry from behind. Opponents end up outside through moves whose animation
  ends on the floor, or by going over the top rope after a heavy strike, a
  stagger into the ropes, or a hit while leaning on them.
- **The L running evade** is agreed, but it has no animation or slot mapping
  yet.
- **C-Right in a lock-up** starts an option whose effect hasn't been traced.
- **When a whipped runner regains control** after rebounding.
- **How a plain pin cover is chosen**, and the referee count's integration.

The [decision log](IMPLEMENTATION-DECISIONS.md#4-questions-still-open) tracks
the full list, including data gaps.

---

## 13. Further reading

|Document|Covers|
|---|---|
|[MOVE-SYSTEM.md](MOVE-SYSTEM.md)|time, input, slots and movesets, the move lifecycle, strikes, Spirit, pins|
|[HFSM-BLUEPRINT.md](HFSM-BLUEPRINT.md)|the state machine: every state, engagements, slot choosers, timers|
|[MOVEMENT.md](MOVEMENT.md)|ring geometry, walking, running, collision, ring transit, the turnbuckle and dives|
|[REVERSALS.md](REVERSALS.md)|every reversal and counter, and the guard|
|[DAMAGE-SYSTEM.md](DAMAGE-SYSTEM.md)|health, joints, the damage formula, submissions, KO, bleeding|
|[PARAMETERS.md](PARAMETERS.md)|the offense/defense values and other profile fields|
|[IMPLEMENTATION-DECISIONS.md](IMPLEMENTATION-DECISIONS.md)|agreed VPG changes and open questions|
|[HANDOFF.md](../HANDOFF.md)|what is built today, and what comes next|
