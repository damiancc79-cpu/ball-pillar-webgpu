# PILLARBALL // ZERO GRAVITY

PILLARBALL is a WebGPU-first, third-person physics puzzle campaign. Roll a heavy metallic sphere through elevated industrial routes of pillars, broad training decks, moving machinery, counterweights, friction surfaces, and a final tower portal. Its visual language is intentionally low-poly and late-1990s: warm worn structures suspended over a cold blue void, aerial follow framing, fog, low internal resolutions, colour quantization, and restrained CRT finish.

## Technology

- Vite + strict TypeScript
- Three.js `WebGPURenderer` as the production renderer
- Three Shading Language (TSL) node materials for quantized retro base materials
- Rapier 3D (`@dimforge/rapier3d-compat`) for deterministic fixed-step simulation
- Native Web Audio API for effects, a procedural fallback score, and a CC0 music loop
- Plain semantic HTML/CSS interface overlays
- Native Keyboard, pointer-input, and Gamepad APIs
- Vitest, Playwright, ESLint, and Prettier

There is no React, WebGL gameplay fallback, UI framework, or third-party game engine.

## WebGPU requirement

This demo deliberately targets WebGPU. Use a current Chromium-family browser with hardware acceleration enabled. If WebGPU is not exposed by the browser/device, the app presents a compatibility screen instead of silently switching to another renderer. On managed machines, graphics policies or remote-desktop sessions may disable WebGPU.

## Installation and commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

`npm run preview` serves the production bundle. `npm run format` applies the repository formatting style.

## Controls

| Action            | Keyboard / mouse                    | Gamepad                   |
| ----------------- | ----------------------------------- | ------------------------- |
| Roll              | WASD or arrow keys                  | Left stick                |
| Look              | Pointer movement, Q/E, Page Up/Down | Right stick               |
| Jump              | Space or on-screen JUMP             | South face button         |
| Brake / stabilize | X                                   | Left trigger              |
| Boost             | Shift                               | Right trigger             |
| Recenter camera   | C                                   | Right stick click         |
| Reset checkpoint  | R                                   | View / Select             |
| Pause / confirm   | Escape / Enter                      | Start / South face button |
| Menu navigation   | Arrow keys / WASD                   | D-pad                     |
| Developer panel   | Backquote                           | —                         |

## Campaign progression

1. **ROLL TRAINING // SECTOR 00** — A forgiving tutorial for camera-relative rolling, jumping, braking, and reaching the exit.
2. **RAMP GARDENS // SECTOR 01** — Broad, low-risk terraces for steering and camera practice.
3. **MOMENTUM PLAZA // SECTOR 02** — Wide run-ups, soft landings, and gentle turns.
4. **TURBINE SPINE // SECTOR 03** — A long advanced gauntlet with timed lifts, a rotor arena, swing gate, boost vault, and signal spire.
5. **PILLAR WORKS // FINAL ASCENT** — The original machinery-heavy tower is the locked finale.

Course clears unlock the next route and are saved locally in the browser. The Level Select screen always shows the intended order and marks cleared/locked courses.

## PILLAR WORKS // Final ascent

The level is intentionally dense rather than open-world:

1. Safe start deck with a view of the amber final portal.
2. Narrow pillar bridge and low-risk early recovery.
3. Momentum ramp, gap, and longer safe route.
4. Moving platforms, rotating arm, pendulum, and machinery crossing.
5. Counterweight bay with pushable objects, pressure plate, seesaw, and a raised bridge.
6. Concrete, ice, rubber, and polished-metal friction chamber.
7. Optional high-risk elevated shortcut.
8. Ascending final tower, last checkpoint, and exit portal.

## Architecture

```text
src/
  app/        fixed-step loop, state, and application composition
  renderer/   WebGPU capability gate, renderer manager, retro resolution pass
  scene/      real-time menu and playable game scene
  physics/    Rapier world, colliders, surface material metadata
  player/     torque-driven ball controller, visual, respawn logic
  camera/     collision-aware third-person camera
  input/      semantic keyboard, pointer, and Gamepad controls
  level/      typed level layout and procedural geometry builder
  gameplay/   moving platforms, rotating beams, seesaw, launch pad, switches
  audio/      Web Audio buses, looped music, procedural fallback, and effects
  ui/         DOM menus, HUD, settings, and developer panel
  shaders/    small TSL retro material helpers
  tests/      unit and browser smoke tests
```

## Rendering pipeline

Startup checks `navigator.gpu` before a `WebGPURenderer` is created. A low internal 640×480 default preserves the period-inspired silhouette clarity; 320×240 and native responsive rendering are available in Options. The renderer uses a capped device pixel ratio, fog, low-poly geometry, instanced distant pillars, shared materials, selected shadows, and optional CSS CRT/dither finish. `src/shaders/retroNodes.ts` contains a TSL colour quantizer used by the WebGPU material path.

## Physics and camera

Rapier runs through a bounded 1/60 accumulator. The ball is a dynamic CCD sphere and movement is camera-relative torque, with low-air-control, braking, boost, speed caps, grounded surface probes, friction modifiers, checkpoint reset, and fall recovery. The custom camera uses a high aerial three-quarter follow view so upcoming beams and landings stay readable, while retaining pointer/gamepad look input, speed-based distance, precision tightening, and raycast collision recovery.

## Audio

Audio starts only after Start Demo or a menu interaction. The Web Audio mixer has master, music, effects, interface, and ambient buses. Its primary score is a 20-second, 120 BPM jungle/DnB MP3 loop derived from bainmack's CC0 `drum_bass_loop_EGED.wav`; it is decoded and repeated through the music bus, so the master/music sliders and pause filter apply normally. Original oscillator/noise voices provide effects, checkpoint stings, menu feedback, and a procedural fallback if an asset request or decode fails.

## Level data and surfaces

`src/level/LevelDefinition.ts` keeps route transforms, materials, checkpoints, and goal data separate from runtime code. Surface metadata in `src/physics/SurfaceMaterial.ts` is shared by Rapier, visuals, audio labels, and effect styling. Included materials are concrete, rusted metal, polished metal, rubber, ice, sand-coated metal, and energy.

## Settings and developer panel

Options are device-local and cover render scale, aspect ratio, internal resolution, post-process toggles, volume, and camera sensitivity. The backquote panel exposes ball/physics/camera/fog/audio tuning, current frame data, surface readout, physics debug switches, spawn tests, level reset, and JSON tuning export.

## Asset pipeline and attribution

The shipped campaign uses original procedural geometry and materials, Web Audio synthesis, and one documented CC0 music loop. `src/assets/AssetManifest.ts` is the centralized extension point for any future GLB, texture, font, or audio asset. Every external asset must be recorded in `ASSET_LICENSES.md` before shipping.

## Performance notes

The route uses shared geometry/materials, instanced background pillars, a limited dynamic-body count, capped pixel ratio, bounded physics steps, and no temporary per-frame gameplay allocations in hot paths. The intended target is 60 FPS on current desktop WebGPU hardware; Options offers lower internal resolution and effects toggles for integrated GPUs.

## Tests

Vitest covers input mapping, physics configuration, surface lookup, level validation, and settings persistence. Playwright is limited to startup/capability/menu smoke coverage because headless browser WebGPU support varies by CI image. The test documents the capability screen rather than pretending a WebGPU device exists where it does not.

## Known limitations

- The campaign is an original procedural environment; the only imported runtime asset is its documented CC0 music loop.
- In browser automation without a real WebGPU device, only the compatibility path can be asserted end-to-end.
- Kinematic machinery intentionally favours readable, stable collision over fully simulated articulated joints.
- Browser gamepad vibration availability depends on the platform and connected controller.

## Next steps

1. Add authored GLB set dressing and licensed texture atlases to deepen the industrial districts.
2. Expand level state serialization so long-form campaigns can restore mechanisms precisely.
3. Add WebGPU-capable CI runners and visual regression captures for the full renderer path.
