# Putt Battle

A real-time multiplayer mini-golf game, built as an original take on **Golf Battle** (Miniclip).
Up to 6 players share one room, take turns putting, and watch every ball move live on the same
course. The game is rendered in 3D (three.js) with low-poly themed scenery, checkered turf, wooden
walls, glossy skinned balls, trails and a phone-friendly layout. Six courses: **Pine Forest**,
**Desert Canyon**, **Snow Valley**, **Meadow Zigzag**, **Mesa Maze** and **Frozen Lake**, with
sand, water and ice hazards, walls, and doglegs.

## How it plays

- One player creates a room and gets a 4-letter code (or shares the invite link); others join
  with that code.
- In the lobby everyone picks a ball colour and pattern, and the host picks which courses make
  up the game.
- Players take turns. On your turn, touch anywhere and drag to pull back a shot like a
  slingshot, then release to putt. The dotted line shows the shot; drag farther for more power.
  A tap with no pull does nothing.
- The camera button switches between a whole-course view and a follow camera behind the ball.
- The pause button opens the game menu. Anyone can **Quit Game**. The host can also **Restart
  Hole**, **Change Course** (swap the current hole for any course) and **End Game for Everyone**.
  If the host leaves, the next player becomes host, and if the shooter leaves mid-turn the game
  moves on.
- The server simulates the physics (friction, wall bounces, sand/ice/water) and broadcasts every
  ball's position live, so everyone watches each shot happen in real time.
- Strokes are tracked per hole and in total; a live rank badge (1st, 2nd, 3rd…) shows next to
  each player's name. Lowest total strokes after the last hole wins.

## Project structure

```
server.js         Express + Socket.io server: rooms, turns, host controls, physics loop
physics.js        Ball movement, wall collisions, friction, hole-sink logic
courses.js        The six hole layouts (walls, hazards, start/hole position, par)
public/index.html Screens and overlays (home, lobby, game HUD, pause menu, results)
public/css/       Glossy 3D-style UI: buttons, panels, ribbons
public/js/scene.js  three.js scene: course, scenery, balls, trails, aim line, camera
public/js/skins.js  Ball skin textures and lobby icons
public/js/main.js   Networking, screens, menu actions and pull-back input
test/sim.js       2-bot playthrough of a full game
test/controls.js  Lobby setup, host controls and leaving mid-game
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
- With `node server.js` running, `node test/sim.js` plays a full game end-to-end and
  `node test/controls.js` checks the lobby and host controls.
- Easy next steps: a follow camera that sits behind the ball, a turn timer so an idle player
  cannot stall the room, and kicking players from the lobby.
