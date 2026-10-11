# Garage: realistic P60B40 and Most Wanted radio

Follow-up to `2026-10-10-nfs-garage-design.md`, from the owner's review of Phase 1:
"engine seems dummy can we get more realistic one also sound should be in website I am ride one and most
wanted playlist can be played, i dont want a backend continue to completion".

Read as: (1) replace the primitive-built engine with a realistic one; (2) play the Most Wanted (2005)
soundtrack inside the garage, starting with "I Am Rock" (Rock), with no backend.

## 1. Most Wanted radio

**Source.** The songs are commercial recordings. Hosting copies on indivar.xyz would be redistribution, and
the Phase 1 rule (no EA audio) stands, so the garage streams them through YouTube's embedded player instead.
Nothing is downloaded or re-hosted, and the site stays static.

- Each song is pinned to an artist, label or YouTube Topic upload (checked 2026-10-11 with YouTube oEmbed).
  "I Am Rock" has no official upload, so it uses fan uploads. Each song lists fallback video ids.
- EA's own score (menu, pursuit and "The Mann" cues) is left out, as are songs with no official upload.
- Order: "I Am Rock" first, then the game's track order.

**Rules the embed must keep** (YouTube API Services, Required Minimum Functionality):
- The player is visible whenever it plays, and its viewport is at least 200 × 200 px. The garage uses
  356 × 200 (16:9).
- Nothing overlaps the player.
- The page sends a Referer header (the site sets no no-referrer policy).
- Playback starts only from the visitor's click, after the player is on screen.

**Privacy.** No YouTube request happens until the visitor opens the radio. The player then loads from
`youtube-nocookie.com`.

**Behaviour.**
- A HUD button "Most Wanted radio" opens a dock holding the player, the current artist and song, previous
  and next buttons, and a close button. Closing it stops playback and removes the player.
- A song that ends plays the next one. A song YouTube refuses (error 2, 5, 100, 101, 150 or 153) tries its
  fallback ids, then the next song.
- If every song fails, the dock says so and offers a YouTube link.
- Only one music source plays at a time: opening the radio stops "my own track", and picking a track closes
  the radio.
- Opening the radio turns garage sound on, ducked under the music. Turning sound off pauses the radio.

**Placement.** On desktop the dock sits bottom-left above the hint. On phones it sits at the top, under the
breadcrumbs.

**Testing.**
- Unit tests cover the playlist (advance, wrap, fallback, give up) and the radio controller against a fake
  player factory.
- Playwright stubs `iframe_api` and checks:
  - nothing loads from YouTube before the click;
  - the player is at least 200 × 200;
  - next and previous, and that the radio and "my own track" exclude each other.

## 2. Realistic P60B40

The engine moves from code primitives to a model built by a Blender script (`tools/blender/build_engine.py`).
It is exported as `public/models/p60b40.glb`, so it costs no JavaScript.

**Reference:** BMW Museum photos on Wikimedia Commons (`BMW_P60_B40.jpg`,
`Touring_race_engine_P60_B40_in_BMW-Museum_in_Munich,_Bayern.JPG`). What they show:
- a glossy carbon airbox covering the whole V, with two round inlets with machined lips facing forward;
- glossy carbon cam covers on ribbed, cast-aluminium heads;
- a cast timing case with a ribbed accessory belt over the crank, water-pump, alternator and idler pulleys;
- a dry-sump pump stack along the lower side.

Branding is left off.

**Realism comes from:**
- **Shape:** bevelled edges, ribs, bolts, pulleys, belts, hoses and wiring.
- **Materials** (PBR): cast and machined aluminium, carbon with clearcoat and weave, heat-tinted headers,
  rubber and braided lines.
- **Baked ambient occlusion:** Cycles bakes it into one 2048² atlas over a second UV set, and the engine and
  bay are baked together so each shades the other.

**The bay is rebuilt in the same file:**
- shaped inner fenders and strut towers;
- a firewall with heat shield and brake reservoirs;
- a radiator with a finned core, end tanks and hoses;
- a coolant tank, a dry-sump oil tank (illustrative) and the airbox ducts to the nose.

**Asset contract** (`tools/check-assets.ts`):
- **Nodes:** `Engine` and `Bay` roots, and one `Part_<topic>` node per engine topic.
- **Hotspots:** each `ENGINE_ANCHORS` position must lie within 6 cm of its part's bounds.
- **Textures:** KTX2 only.
- **Budget:** at most 4 MB and 90,000 triangles.

**Runtime:**
- `Engine` is placed at `engineOrigin(bay)`, the same place the code engine used, so camera shots and their
  tests still apply.
- Each part gets its own material clones for the hover highlight.
- `Part_*` meshes take the clicks.

**Facts.** No new claims. Bore, stroke, layout, crank, valvetrain, restrictors and dry sump stay verified.
Headers, oil-tank placement and the bay stay labelled illustrative.

## 3. Out of scope

- Engine start and rev sound, and the animated cutaway (the "engine working" research).
- Spotify, which plays only 30-second previews to most visitors.
