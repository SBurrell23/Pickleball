# Pickleball

A Mario Tennis–style pickleball game for two or four players. Vanilla JavaScript,
Three.js for rendering, PeerJS for peer-to-peer multiplayer. No build step, no
backend, no install — every asset and every sound is generated in code at runtime.

A daylight court inside a chain-link fence, under a procedural sky, with grass
and scrub running to the horizon. The sun tracks a full circle overhead every
ten minutes, so the shadows swing round and the light warms as it drops. Players are deliberately anonymous -- a floating body and a head, like
the crowd -- that lean into their movement, with a paddle attached to nothing
that hovers beside them and does the acting. The court, the net's sag, the
crowd, the player models, the portraits and every sound effect are built from
primitives and oscillators at load time. The only asset file is the background
music track.

**Play:** https://sburrell23.github.io/Pickleball/

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move. `W` is always toward the net, whichever side you are on. |
| Mouse | Aim. The reticle replaces the system cursor; the marker on the far court is where the ball will actually land. |
| Hold left click | **Drive shot.** Full power bar — all the pace you can get, but the sweet spot is a long way up. |
| Hold right click | **Dink shot.** Half-length bar — sweet spot in half the time, but it can never hit hard. |
| Hover the net | The mesh fades out around the cursor, so you can see the far kitchen through the thing you are trying to drop a ball over. |
| Release | Swing. Stop the marker in the sweet spot. Let the bar fill all the way into the red and you have **choked** — the ball is netted or long, every time. |
| `Space` | Hold during a **drive** to loop it into a lob. Does nothing on a dink — that is already the soft shot. |
| `Shift` | Dash. Costs stamina. |
| `Esc` | Pause. |

## Two shots

**Drive shot — left click.** A bar fills while you hold the button, with a sweet
band near the top. You want maximum power *and* a release inside the band, so
it is a test of nerve as much as timing — every extra frame you hold is more
pace and more risk. Hold past the end and the swing overcooks into a floater
that the opponent will punish.

**Dink shot — right click.** The same bar at half the length, so its sweet spot
arrives in half the time. The catch is a hard ceiling on pace: it can never hit
hard. This is the decision the game is actually built around — when a ball comes
back too fast to fill a drive, you can force a mistimed big shot and get
punished for it, or take a clean quick dink and stay in the rally. The full bar
is drawn as a dashed ghost behind the short one so the trade is visible while
you hold it.

There is no third meter. Two shots and the choice between them carries the game.

Timing feeds straight back into the physics. A perfect strike goes where the
reticle says; a mistimed one loses pace, scatters wide, and — the part that
actually decides rallies — *floats*, sitting the ball up for a smash. The
paddle is attached to nothing: it hovers beside the player, drifts toward
wherever you are aiming, and locks to the swing side once you commit.

## You, and the eleven

There is no character select. The human side of the net is one fixed stat
line — dead average on every axis — and your own stats are not shown anywhere,
because there is nothing in them to read. A match is decided by how you play
it, not by which card you picked on the menu.

What you *do* choose is how you turn up: name, kit colour, paddle colour, skin
tone, a shirt style and headwear, saved locally and carried into every mode
including online. Secondary and trim colours are derived from the kit rather
than picked separately — two free colour choices on one garment is how you get
a kit that looks like a mistake. The body silhouette is deliberately not
customisable: `build.scale` feeds the paddle's reach height in
`sim.stepPlayer`, so letting people choose how tall they are would be a stat
dressed up as a cosmetic.

The stats live on the other side of the net now. Eleven rivals, each good at
one thing and all of them stronger than you on paper:

| Stat | What it actually drives |
| --- | --- |
| Speed | Top running speed and dash distance. Nothing to do with shots. |
| Reach | How far the paddle can meet the ball — out to the side and overhead. |
| Control | How close a mistimed shot still lands to where it was aimed. |
| Drive | Sweet-spot width on the full power bar. |
| Dink | Sweet-spot width on the kitchen needle and the short bar. |

A scouting card before each season match shows what you are walking into.
`tools/roster.mjs` sweeps one stat at a time against the human line and then
plays every rival at full strength against it; that is how the ranges were
set, and how a pure control specialist was caught losing to the baseline
(control measures as the weakest lever in the game, so she had to be rounded
out rather than inflated).

## Season

A ladder of rivals faced one at a time, on each of the four difficulties.
Easy is three matches, Normal five, Hard seven, Extreme the full eleven. Every
ladder opens against the warm-up and finishes against the champion, so a
three-match season is a whole season rather than the first third of one.

You get three lives. Losing costs one and puts you back against the same
rival — the ladder never moves on without you. Two thirds of the way up you
are handed a fourth, which on the full eleven is exactly after the seventh.
Quitting mid-match forfeits it, or the lives would be decorative. Clearing a
difficulty unlocks cosmetics; clearing all four unlocks the lot.

Both the difficulty of the opposition and the size of their stat sheet ramp
across the ladder and across the four difficulties, and the shape of that was
measured rather than guessed. `tools/seasontest.mjs` stands a baseline-stat
bot at three calibres of play against every rung of every ladder:

```
strong player   easy      100 100 100
                normal    100 100  88  63  50
                hard      100  63  75 100  63  50  38
                extreme   100  75 100  50  38  75  50  50  25  13  13
```

Easy is an on-ramp a weak player clears; Extreme's last rungs sit around 13%
for the strongest bot, which is a wall rather than a brick. The first pass had
the top of every ladder at a flat 0% for every calibre of player, because
stacking a rival's full paper sheet on top of the top of the skill band leaves
nothing to beat — Extreme now stops short of both.

## Achievements

Fifty of them, across season, match, shotmaking, style, online and milestones.
Every one is decided from two things: a summary of the match that just
finished and a tally kept across matches. None of them peek at live game
state, which is what makes `tools/progresstest.mjs` able to check — without a
browser — that an 11-0 flawless win earns six specific achievements, that a
heavy defeat earns none, and that a milestone fires on the match that crosses
it rather than the one after.

## Courts

Five places to play:

| Court | |
| --- | --- |
| Rec Play Courts | Municipal blue behind chain-link. Where everybody starts. |
| Hollow Pines | A clearing somebody paved, dark and close. |
| Dust Bowl | Terracotta hard court under a bleached sky. |
| Tidewater | A boardwalk over the reeds, standing pools out in the grass. |
| Centre Court | Downtown, ringed by towers, every seat sold. |

A venue is pure data in `render/venues.js` — the court paint, the ground, what
grows outside the fence, the stands, the barrier, the sky — and there is one
set of builders in `render/assets.js` that reads it. Five hand-built scenes
would drift apart; a new court should be a table entry.

None of it touches the simulation. A court is the same size with the same
bounce and the same net everywhere, and the barrier a venue draws as
advertising boards still sits exactly where the chain-link does, because
`FENCE` is a simulation constant. Only the paint changes.

All five are played in daylight. There were day, dusk and night modes for a
while and the two dark ones simply were not good enough to be worth choosing
between, so they went, and with them a spotlight rig, a lamp switch and a
settings key. The sun's elevation is a constant again; only its azimuth
drifts, so shadows still swing round over a long match.

Centre Court is two pieces of scenery rather than one, because the play
camera looks down the court and can see nothing above ground level past
about thirty-five metres — measured, after the first attempt put a whole
city where nobody would ever see it. The towers are for the menu backdrop
and the broadcast camera; the bowl wall just behind the stands is what you
actually play inside. The towers carry a matched pair of textures, a facade
and an emissive mask of only the lit windows, because using one for both
made the concrete glow as hard as the glass.

Anything outside the fence has to be placed against what that camera can
actually see, which is a narrow, short cone: the top of its frame is 12.6
degrees *below* horizontal, so the further out something stands the lower it
has to be to be in shot, and a tall prop is governed by the height of its
middle rather than its base. That one line decides everything — a pond lying
flat can be twenty metres out, a pine whose middle is over two metres up has
to be inside about eight. The first pass ignored height and put a whole
forest just above the top of the frame.

Centre Court hangs its honours twice for the same reason: banners at
rafters height round the bowl, which only the wide view sees, and a low
board on the inside of the advertising wall, which is what you read while
playing. There are trophy tables at the apron corners.

Only Centre Court is full. A rec court gets the dozen people who happened to
be passing, which is what a rec court gets.

Online, the host picks the court and it travels with the match. In a season
the ladder picks: every run opens on the rec courts you learned on and
finishes on the championship court, touring more of the list the longer the
ladder is.

## Rules

Real pickleball rules, because they are what make the two meters matter:

- **The kitchen** (the teal non-volley zone by the net) — you may stand in it,
  but you may not volley from it. Let the ball bounce first.
- **A ball that bounces in your kitchen can only be dinked back.** Drive one off
  the floor down there and you bury it in the net, which is what happens in life
  too when you swing hard on a ball at your feet.
- **Two-bounce rule** — the serve and the return must both bounce before anyone
  may volley.
- **Serving** is underhand and cross-court, and must clear the kitchen. You aim
  it with the cursor like any other shot and the target box is drawn on the
  court, so placing it is your job — and the timing bands on a serve are three
  times narrower than in a rally, because you get unlimited time to watch the
  bar.
- Rally scoring to 11, win by 2.

## Multiplayer

Host a room, share the five-character code, and your opponent joins. The
connection is browser-to-browser over WebRTC; the only server involved is the
public PeerJS signalling server used to introduce the two peers.

Both players bring their own look. The whole appearance travels with the
profile rather than an id, because with custom players there is nothing the
other side could look anyone up by. A peer's look is accepted as theirs — we
cannot audit somebody else's unlocks — but it is sanitised down to items this
build can actually draw before anything renders it.

The netcode is host-authoritative:

- Two data channels per link — a reliable one for lobby and swings, an
  unreliable one for input and snapshots, because a dropped snapshot is cheaper
  than waiting for a retransmit.
- Both sides ping continuously and estimate round-trip time, jitter and clock
  offset from the fastest recent samples, so a spike does not drag the estimate.
- Clients predict their own movement from the same movement code the host runs,
  then reconcile: on each snapshot they rewind to the authoritative state and
  replay every unacknowledged input. Any residual error is absorbed by a
  decaying offset rather than a teleport.
- Everything else is rendered from an interpolation buffer a little behind the
  host, using cubic Hermite through the ball's position *and* velocity so fast
  shots keep their arc between snapshots.
- Swings are lag-compensated: the host rewinds the ball by that client's
  round-trip-time/2 plus their interpolation delay before testing whether the
  paddle reached it, so you hit what you saw.

If a player disconnects mid-match the CPU takes over their slot rather than
ending the game.

## Settings

Graphics, audio and feel are all adjustable from the menu and persist locally.

- **Graphics** — frame rate cap, anti-aliasing (off / FXAA / MSAA), resolution
  scale, shadow quality, particle density, ball trail, glow, animated crowd,
  screen shake, FPS counter. Field of view is deliberately not a setting: the
  camera framing and the mouse-to-court aim mapping are tuned around one lens.
- **Audio** — master, effects, music and crowd ambience, plus mute-on-blur.
- **Gameplay** — CPU difficulty (Easy / Normal / Hard / Extreme, also pickable
  straight from the exhibition screen), aim sensitivity, landing marker
  toggle, and colourblind palettes. Nothing here changes what the simulation
  does to a shot, or how much of the court you can see: a slider that widened
  the sweet spot used to live in this list and went once it was measured, and
  the camera-mode picker went with it for the same reason -- a framing choice
  is a competitive one. There is one camera and it follows you.
- **Cursor** — the system cursor is hidden during a match and the reticle you
  aim with replaces it, so its shape, colour and size are configurable, with a
  live preview drawn over the four court colours it has to stay readable on.

Anti-aliasing is a WebGL context-creation setting, so changing it rebuilds the
renderer; everything else applies live.

## Running locally

Any static file server works. The repo ships one that disables caching, which
matters when iterating because browsers happily reuse cached ES modules:

```bash
python tools/devserver.py 8124
```

Then open http://localhost:8124.

## Development

There is no build and no dependency install — `vendor/` holds pinned copies of
Three.js and PeerJS so the deployed site is self-contained.

Four headless harnesses run in CI on every push:

```bash
node tools/importcheck.mjs   # every module parses and its imports resolve
node tools/simtest.mjs       # rules, scoring and AI balance over many matches
node tools/seasontest.mjs    # the season ladder still ramps, on all four
node tools/progresstest.mjs  # lives arithmetic and achievement conditions
```

`simtest.mjs` plays full matches bot-versus-bot and reports rally length, why
points ended, shot mix, timing-quality distribution and the serve → return →
third-shot flow, then asserts on all of it. It is the fastest way to see whether
a physics or tuning change broke the balance, and it has caught real regressions
more than once: a healthy build sits around 8–10 shots per rally in singles and
14–20 in doubles, with games reaching a winner and points ending for a spread of
reasons.

Singles and doubles are checked separately and against different bands — four
players cover the court far better than two, so doubles rallies are genuinely
longer and holding both to one number would either mask a broken singles game or
flag a healthy doubles one.

`seasontest.mjs` is the balance guard for the ladder: it plays every rung of
every difficulty against three calibres of baseline player and asserts that
each ladder gets harder along its own length, that Easy stays clearable by a
weak one, that Extreme is not unwinnable from its first rung, and that the four
difficulties are actually ordered. `progresstest.mjs` covers the bookkeeping
that is easy to get subtly wrong and impossible to eyeball — when the fourth
life lands on each of the four ladder lengths, that a loss does not advance the
ladder, that a locked cosmetic sitting in local storage is discarded rather
than honoured, and which achievements a given match should and should not hand
out. Around 350 assertions, and they run in under a second.

## Layout

```
index.html            page shell
styles.css            HUD and menu styling
vendor/               pinned Three.js and PeerJS
src/
  main.js             app shell: menus, lobby, match lifecycle, frame loop
  core/               settings persistence, keyboard and mouse input
  audio/audio.js      every sound effect, synthesized; streams the music track
  game/
    constants.js      court dimensions and physics tuning
    ballistics.js     launch solving, drag correction, landing prediction
    sim.js            authoritative simulation: movement, ball, rules, scoring
    swing.js          the two timing mini-games
    ai.js             CPU opponents
    avatar.js         the player: fixed stats, chosen look, cosmetic unlocks
    enemies.js        the eleven rivals and how they scale up the ladder
    season.js         ladder state, lives, persistence
    achievements.js   definitions and the tally they are judged against
    characters.js     resolves a roster entry into a definition
    game.js           ties simulation, rendering, netcode and input together
  net/                PeerJS transport, snapshot interpolation, reconciliation
  render/             procedural courts, character rigs, effects, renderer
    venues.js         the five courts and the three times of day
  ui/                 HUD canvas, menu screens, portraits, aiming reticle
assets/audio/         background music (the repo's only asset file)
tools/                dev server and headless test harnesses
```

## Credits

[Three.js](https://threejs.org) and [PeerJS](https://peerjs.com), both MIT
licensed, vendored under `vendor/`. The music track was supplied by the project
owner. Everything else is original.
