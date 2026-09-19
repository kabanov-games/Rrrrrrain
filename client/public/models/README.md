# Rrrrrrain — 3D model assets

All models below are **CC0 / Public Domain** (Creative Commons Zero v1.0). Free to use, modify, and redistribute for any purpose, including commercial, no attribution required.

## `monsters/`

Origin: the three files map to the game's in-engine enemy types. All are from Quaternius's *Ultimate Animated Character Pack / Ultimate Monsters* (CC0), re-hosted in the CC0 companion repo [`511action/descent-3d-assets`](https://github.com/511action/descent-3d-assets) (README: "CC0 monster models (Quaternius Ultimate Monsters pack, public domain)"). They were converted from `.gltf` (base64-embedded buffers) to single-file `.glb` with `@gltf-transform/cli`.

Each monster file ships with the same 14-clip animation set: `Idle`, `Walk`, `Run`, `Punch`, `Weapon`, `HitReact`, `Death`, `Duck`, `Jump`, `Jump_Idle`, `Jump_Land`, `No`, `Yes`, `Wave`.

| In-game type | File | Source model | Size | Look |
|---|---|---|---|---|
| IMP | `monsters/imp.glb` | `Demon.gltf` → glb | 621 KB | Small red horned demon with wings + pitchfork |
| PINKY | `monsters/pinky.glb` | `Orc.gltf` → glb | 632 KB | Chunky green ork/goblin (closest low-poly stand-in for a fat pig-demon) |
| CACO | `monsters/caco.glb` | `BlueDemon.gltf` → glb | 566 KB | Blue puffy creature (matches classic Cacodemon blue) |

- Raw sources: `https://raw.githubusercontent.com/511action/descent-3d-assets/main/models/{Demon,Orc,BlueDemon}.gltf`
- Author: Quaternius — https://quaternius.com/
- License: CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/

## `hub/`

| File | Size | Source |
|---|---|---|
| `hub/chest.glb` | 34 KB | Kenney *Mini Dungeon* pack, `Models/GLB format/chest.glb`. Downloaded from https://kenney.nl/assets/mini-dungeon (zip: `kenney_mini-dungeon.zip`). |

- Author: Kenney — https://kenney.nl/
- License: CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/

## Notes

- All files are self-contained single `.glb` (geometry + textures + animations embedded), safe to drop into three.js `GLTFLoader.load()`.
- All files are under 1 MB — well below the 5 MB budget.
- Bounding boxes for monsters are roughly `~4.6 m wide × ~2.8–3.2 m tall` (Quaternius character rig scale); rescale on load in-engine as needed.
- If you later want a truer Caco (floating sphere/eye) or Pinky (pig-demon), the full Quaternius *Ultimate Monsters* pack is at https://quaternius.com/packs/ultimatemonsters.html — download requires clicking through a Google Drive folder, which cannot be done non-interactively.
