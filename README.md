# Edge Racer — Realms of Light

A full rebuild of Edge Racer with the look and feel of *Sky: Children of the Light*.
You pilot a glowing light-craft along a luminous ribbon of road suspended above an
endless cloud sea. The road winds, narrows, and shifts — and the edge is death.

## The game

Everything from the original Edge Racer is here, re-imagined:

| Original | Realms of Light |
| --- | --- |
| Car | Winged light-craft with flowing trail |
| Off-road = crash | Off the edge = the long fall into the cloud sea |
| Bump / Shield / Saw pickups | **Gust** / **Aura** / **Shard** charms |
| Rocks, oil, barrels, puddles | Dark crystals, void pools, storm cores, mist pools |
| Rain / fog weather | Rain of light / the veil thickens |
| Grassland → desert → glacier | Aurora Meadow → Golden Wastes → Frost Veil → Eden Storm |
| Taunts | Spirit whispers |
| Median-line penalty | The silver thread takes its toll |
| Firebase leaderboard + Google sign-in | Retained, restyled |

## Tech

- React 19 + TypeScript + Vite
- Three.js WebGL: gradient sky-dome shader, procedural cloud-sea shader,
  dynamic road-ribbon mesh, particle bursts, ambient motes, rain,
  floating islands, UnrealBloom postprocessing, banking chase camera
- Pure WebAudio ambient soundscape (no audio files): evolving pad, wind that
  rises near the edge, pentatonic chimes, soft impacts, a falling sigh
- Firebase (Firestore + Google auth) for the global/country leaderboard
  and cloud progress

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # typecheck
```

## Controls

- **← → / A D** — glide left and right
- **↑ ↓ / W S** — surge forward and ease back
- **Space** — release your charm (weapon)
- **P / Esc** — stillness (pause) · **M** — mute
- **Touch** — drag anywhere to steer, tap the charm ring to release it

## Notes

- The title screen runs a live attract-mode flight behind the menu.
- Realm palettes cross-fade slowly as you ascend (every 2 levels).
- Firestore rules are in `firestore.rules`; the country leaderboard needs a
  composite index (`countryCode` asc, `distance` desc) in Firebase Console.
