# Pickleball

A Mario Tennis–style pickleball game for two or four players. Vanilla JavaScript,
Three.js for rendering, PeerJS for peer-to-peer multiplayer. No build step, no
backend, no install — every asset and every sound is generated in code at runtime.

A daylight court inside a chain-link fence, under a procedural sky, with grass
and scrub running to the horizon. Players are deliberately anonymous -- a floating body and a head, like
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
| Hold left click | Full power bar. All the pace you can get, but the sweet spot is a long way up. |
| Hold right click | Half-length bar. Sweet spot in half the time — but it is only ever a dink. |
| Release | Swing. Stop the marker in the sweet spot. |
| `Space` | Hold while swinging for a softer, loopier ball. |
| `Shift` | Dash. Costs stamina. |
| `Esc` | Pause. |

## The meters

**Power bar — left click.** A bar fills while you hold the button, with a sweet
band near the top. You want maximum power *and* a release inside the band, so
it is a test of nerve as much as timing — every extra frame you hold is more
pace and more risk. Hold past the end and the swing overcooks into a floater
that the opponent will punish.

**Short bar — right click.** The same bar at half the length, so its sweet spot
arrives in half the time. The catch is a hard ceiling on pace: it only ever
produces a dink. This is the decision the game is actually built around — when
a ball comes back too fast to fill a drive, you can force a mistimed big shot
and get punished for it, or take a clean quick dink and stay in the rally. The
full bar is drawn as a dashed ghost behind the short one so the trade is visible
while you hold it.

**Reaction bar — at the kitchen.** Standing at the kitchen line swaps left click
for a needle that sweeps back and forth, with the sweet spot placed somewhere
new every single swing. Power is fixed there, so there is nothing to weigh up:
you either react in time or you do not.

Timing feeds straight back into the physics. A perfect strike goes where the
reticle says; a mistimed one loses pace, scatters wide, and — the part that
actually decides rallies — *floats*, sitting the ball up for a smash. The
paddle is attached to nothing: it hovers beside the player, drifts toward
wherever you are aiming, and locks to the swing side once you commit.

## Rules

Real pickleball rules, because they are what make the two meters matter:

- **The kitchen** (the teal non-volley zone by the net) — you may stand in it,
  but you may not volley from it. Let the ball bounce first.
- **Two-bounce rule** — the serve and the return must both bounce before anyone
  may volley.
- **Serving** is underhand and cross-court, and must clear the kitchen.
- Rally scoring to 11, win by 2.

## Multiplayer

Host a room, share the five-character code, and your opponent joins. The
connection is browser-to-browser over WebRTC; the only server involved is the
public PeerJS signalling server used to introduce the two peers.

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
- **Gameplay** — CPU difficulty (Easy / Normal / Hard, also pickable straight
  from the pre-match screen), timing-window width (a comfort option that widens
  both sweet spots), camera mode, aim sensitivity, landing marker toggle, and
  colourblind palettes.
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

Two headless harnesses run in CI on every push:

```bash
node tools/importcheck.mjs   # every module parses and its imports resolve
node tools/simtest.mjs       # rules, scoring and AI balance over many matches
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
    characters.js     roster and stat curves
    game.js           ties simulation, rendering, netcode and input together
  net/                PeerJS transport, snapshot interpolation, reconciliation
  render/             procedural court, character rigs, effects, renderer
  ui/                 HUD canvas, menu screens, portraits, aiming reticle
assets/audio/         background music (the repo's only asset file)
tools/                dev server and headless test harnesses
```

## Credits

[Three.js](https://threejs.org) and [PeerJS](https://peerjs.com), both MIT
licensed, vendored under `vendor/`. The music track was supplied by the project
owner. Everything else is original.
