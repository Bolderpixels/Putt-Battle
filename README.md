# Putt Battle

A real-time multiplayer mini-golf game, built as an original take on **Golf Battle** (Miniclip).
Up to 6 players share one room, take turns putting, and watch every ball move live on the same
course. Three themed holes: **Pine Forest**, **Desert Canyon**, and **Snow Valley**, each with
sand, water and ice hazards, walls, and doglegs.

## How it plays

- One player creates a room and gets a 4-letter code; others join with that code (like a Kahoot/
  Jackbox-style lobby).
- Players take turns. On your turn, click-and-drag (or touch-drag) away from your ball to pull
  back a shot like a slingshot, then release to putt. Drag farther for more power.
- The server simulates the physics (friction, wall bounces, sand/ice/water) and broadcasts every
  ball's position live, so everyone watches each shot happen in real time.
- Strokes are tracked per hole and in total; a live rank badge (1st, 2nd, 3rd…) shows next to
  each player's name. Lowest total strokes after 3 holes wins.

## Project structure

```
server.js        Express + Socket.io server: rooms, turns, authoritative physics loop
physics.js        Ball movement, wall collisions, friction, hole-sink logic
courses.js        The three hole layouts (walls, hazards, start/hole position, par)
public/           Client: index.html, css/style.css, js/main.js (canvas rendering + input)
test/sim.js       Automated 2-bot playthrough used to sanity-check the full game loop
```

## Run it locally

```bash
npm install
npm start
```

Then open `http://localhost:3000` in two or more browser tabs (or devices on the same network:
use your machine's LAN IP instead of localhost) to test multiplayer.

## Put it on a public link (for the Handshake submission)

The mission needs a live multiplayer game at a public URL. This is a small Node.js + WebSocket
app, so any free Node host works. **Render** is the easiest:

1. Push this folder to a new GitHub repo.
2. Go to [render.com](https://render.com) → **New** → **Web Service** → connect that repo.
3. Build command: `npm install`; start command: `npm start`.
4. Deploy. Render gives you a public `https://your-app.onrender.com` link. That's what you
   share and submit.

(Railway, Fly.io, or Glitch work the same way: any host that runs a persistent Node process and
allows WebSocket connections. Avoid static-only hosts like plain GitHub Pages or Netlify's free
static tier, since this needs a live server, not just static files.)

## Notes / things to extend further

- Turns are sequential (one ball moves at a time) rather than fully simultaneous, which keeps the
  physics simple and fair across laggy connections, while still showing every player's shot live.
- `test/sim.js` spins up two headless Socket.io clients and plays a full 3-hole game end-to-end,
  useful for checking nothing is broken after a change: `node server.js` in one terminal, then
  `node test/sim.js` in another.
- Easy next steps: more holes/courses, a cosmetic ball-skin picker, a "watch replay" camera pan
  to whoever's about to putt, and a rematch button on the final screen.
