# Asset credits

All models in this folder come from Poly Haven (https://polyhaven.com) under CC0 (public domain, free for commercial use, no attribution required). Downloaded 2026-10-12, glTF 1k:

- exterior_aircon_unit
- utility_box_01
- rollershutter_door
- modular_metal_gutter
- security_light
- metal_trash_can
- water_manhole_cover

Everything else (cars, buildings, signs, textures, sound) is generated in code under src/.

## Cars (assets/cars)

- porsche_911.glb: "(FREE) Porsche 911 Carrera 4S" by Karol Miklas (https://sketchfab.com/karolmiklas), https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf. License CC BY-SA 4.0: credit required, and a modified version that is shared must use the same license.
- crown_comfort.glb: "2001 Toyota Crown Comfort [S10]" by Kucing Garage (https://sketchfab.com/kucinggarage), https://sketchfab.com/3d-models/3ef4527459f5406fb4599864800ab1fa. License CC BY 4.0.
- prius_2012.glb: "Toyota Prius 2012" by Doz3 (https://sketchfab.com/Doz3), https://sketchfab.com/3d-models/04eaf6b288cc466785365b7d985e3b29. License CC BY 4.0.
- corolla_mk7.glb: "Toyota Corolla MK7 DX" by BHP3D (https://sketchfab.com/BHP3D), https://sketchfab.com/3d-models/43a413ae205a4ea6b29700cb8cf4ea95. License CC BY 4.0.

Each car is scaled uniformly to its real length (Porsche 4.49 m, Crown Comfort 4.695 m, Prius 4.48 m, Corolla 4.37 m), so the cars stay in proportion with each other and with the street.

## Characters (assets/characters)

- hero.vrm (in game: Ren): "AvatarSample_C" by VRoid Project (pixiv), an official VRoid Studio sample. VRoid Hub license: anyone may use it, commercial use allowed, modification allowed, redistribution allowed, credit not required. Animated with the Mixamo clips below (src/mixamo.js).
- char2.vrm (in game: Mio): "fantasy1" by 6 (VRoid Hub). Same VRoid Hub license: anyone may use it, commercial use allowed, modification allowed, credit not required.
- savi_china.vrm / savi_dress.vrm / savi_space.vrm (in game: Savi, three outfits shown as skins): "Savi China", "Savi dress", "Savi space suit" by siroihakumai (VRoid Hub). VRoid Hub license: anyone may use it, commercial use allowed (personal and corporate), modification and redistribution allowed, credit not required.
- Menu thumbnails (hero.jpg, char2.jpg, savi_*.jpg) are the thumbnails embedded in each VRM file.

## Animations (assets/anims)

The game ships these as its own baked clip data (assets/anims/*.json, made by tools/bake-anims.mjs: per-bone rotations already retargeted to the game's humanoid rig), not as the Mixamo FBX files; the FBX downloads stay on Teguh's machine and are kept out of the repository (.gitignore).

- idle.fbx (Breathing Idle), idle_look.fbx (Look Around), walk.fbx (Walking), walk_female.fbx, walk_female_start.fbx, walk_female_stop.fbx, turn180_female.fbx (female walk, start walking, stop walking, 180 turn with briefcase; used by Mio), run.fbx (Running), car_enter.fbx / car_exit.fbx (Entering Car / Exiting Car, mirrored), stairs_up.fbx / stairs_down.fbx (Ascending / Descending Stairs), sit_down.fbx (Sitting), sit_idle.fbx (Sitting Idle), stand_up.fbx (Stand Up), driving.fbx (Driving), walk_start.fbx / walk_stop.fbx / turn180.fbx (Start Walking, Stop Walking, Walking Turn 180; used by Ren), button_push.fbx (Button Pushing), pick_up.fbx (Picking Up Object), talking.fbx (Talking), open_door.fbx (Opening), texting.fbx (Texting While Standing), singing.fbx (Singing), lie_down.fbx (Lying Down), drinking.fbx (Drinking): from Adobe Mixamo (https://www.mixamo.com), downloaded by Teguh with his own Adobe account. Mixamo's terms allow using these animations in games and other projects, including commercial ones, but not redistributing the raw files as a standalone asset pack, so keep this folder out of any public asset dump. They are retargeted onto the VRM at runtime by src/mixamo.js.

## Surfaces and lighting (assets/textures)

Poly Haven (https://polyhaven.com), CC0. 1k PBR sets (diffuse, normal GL, AO/roughness/metal) downloaded 2026-10-12: asphalt_02, large_grey_tiles, concrete_floor_02, tiled_floor_001, concrete_wall_003, beige_wall_001, white_plaster_02, painted_plaster_wall, corrugated_iron, metal_plate. HDRI: cobblestone_street_night (1k), used as the reflection environment. Loaded by src/surfaces.js.

## Sound recordings (assets/audio)
All from Freesound (https://freesound.org), CC0 1.0 (public domain, no credit required), downloaded by Teguh. Trimmed, loop-crossfaded and loudness-matched with ffmpeg; the list of what loads is assets/audio/files.json.
- rain_street.mp3: "rain_night_city_ambience.mp3" by thoefler (205956)
- rain_roof.mp3: "Medium rain on a tin roof" by Sassaby (771981)
- step_wet.mp3: "Walking on wet asphalt" by SpinOpel (835102)
- train_pass.mp3: "Train passing on the bridge overhead" by macdaddyno1 (396983)
- station.mp3: "at_Kichijoji_station_platform_220815" by kousuke (647259)
- izakaya.mp3: "Japanese_Restaurant_Atmosphere" by ivoliYT (723834)
- konbini.mp3: "AMB_Int_ConvenienceStore_001.wav" by conleec (149444)
- ramen.mp3: "Restaurant ambience chatter" by mycompasstv (474740)
- kissa.mp3: "Osaka City centre cafe - Calm" by artsnbytes (785167)
- laundry.mp3: "laundromat ambience steamy machines rattle" by kyles (637648)
- pachinko.mp3: "Japan_Tokyo_Shinjuku_Pachinko_Noise_Doors_Opening" by RutgerMuller (364898)
- arcade.mp3: "Tokyo - arcade center floor 1_CsG.wav" by csaszi (481770)
- step_tile.mp3: "Footsteps on Tiles.wav" by RutgerMuller (50725)
- step_wood.mp3: "Footsteps on wooden floor.wav" by PanosA (546362)
- step_metal.mp3: "footsteps shoes metal stairs up down resonate" by kyles (451863)
- city_far.mp3: "Ambience City Quiet Night Air Tone" by leonelmail (427841)
- insects.mp3: "Kingston NY late summer midnight crickets" by samwd (402734)
- birds.mp3: "CITY - 1" by SamuelGremaud (460438)
- chair_creak.mp3: "Chair Creak.MP3" by 4Cairnz (680571)
- bed_creak.mp3: "Bed creak.wav" by MootMcnoodles (444389)
- wiper.mp3: "Windscreen wipers.wav" by lyndseymel (241369)
- car_door_open.mp3 / car_door_close.mp3: "Classic Car Porsche 911 Car Door Open And Close.wav" by mincedbeats (630562)
- can_open.mp3: "Opening Can with fizz - Soda / Beer / Pop" by MutilatorBCB (689705)
Everything else (music included) is synthesized at runtime by src/audio.js and src/music.js.

## Interior models and surfaces (Poly Haven, CC0)
From https://polyhaven.com (CC0, no credit required), 1k versions, downloaded 2026-10-13 with Teguh's approval.
- Models (assets/<name>/): BarberShopChair_01, CashRegister_01, metal_stool_02, Sofa_01, dining_chair_02, potted_plant_02, wall_clock, fire_alarm, korean_fire_extinguisher_01, security_camera_02, WetFloorSign_01, tea_set_01, wine_bottles_01, ceramic_pot, wooden_bowl_01, cardboard_box_01, plastic_crate_01, office_notepads, binder_notebook, ceiling_fan.
- Surfaces (assets/textures/): wood_floor, laminate_floor_02, floor_tiles_06, interior_tiles, dirty_carpet, tatami_mat, ceiling_interior, dark_wood, wood_table, plastered_wall, long_white_tiles, linoleum_brown, fabric_leather_02.

## People (assets/npc)
VRoid Studio sample characters released by VRoid (pixiv) under CC0, from the OpenGameArt collection "VRoid Studio CC0 models" (https://opengameart.org/content/vroid-studio-cc0-models), downloaded by Teguh: AvatarSample_D (npc_d.vrm), AvatarSample_E (npc_e.vrm), AvatarSample_F (npc_f.vrm), AvatarSample_G (npc_g.vrm), Sakurada Fumiriya (npc_fumiriya.vrm), Sendagaya Shino (npc_shino.vrm). Animated with the Mixamo clips above.

## Upgrade assets, downloaded 2026-10-13 from Sketchfab (glTF), all CC BY 4.0 (credit required)

Vehicles (assets/cars/<name>/):
- isuzu_elf: "Isuzu Elf series" by Romanov_13, https://sketchfab.com/3d-models/070bc8b65a224ca89a03bb6d67e22edc
- hiace_2013: "Low Poly 2013 Toyota HiAce" by Alvin.Woodly, https://sketchfab.com/3d-models/f83b4ed4d8534efb81def77b6c1b642d
- jpn_taxi: "Toyota JPN Taxi" by Nieve5677 (niev), https://sketchfab.com/3d-models/4868854a744042bca248c38bfddd6441
- daihatsu_cast: "2015 Daihatsu Cast Sport SAII LA250S" by SIU Car Garage (Game_mode), https://sketchfab.com/3d-models/e78038090e494821904f7aeb6767d722
- wagonr: "2013 Suzuki WagonR" by BHP3D, https://sketchfab.com/3d-models/71112627f42342099ff95b59e7532663
- carry_pickup: "Carry Pickup | Suzuki | Game ready" by by__Rx, https://sketchfab.com/3d-models/e1654a399b9d448a9a7ce200410ac91d
- carry_minivan: "Suzuki Carry Minivan" by ProPolyModels, https://sketchfab.com/3d-models/5c0007c0c6ed4d298b8c80646efa09d2

Street props (assets/props/<name>/; the other downloads were not used and were removed):
- vending_machine: "Japanese Vending Machine" by filadog, https://sketchfab.com/3d-models/4768555100004c75b5167d1aa02c683b
- vending_red: "Red Japanese Vending Machine" by Watanuki_San (tokyo45otaku), https://sketchfab.com/3d-models/a8a6874f62da478f8572554959d3c62e
- cat: "Somali Cat Animated ver 1.2" by DreamNoms, https://sketchfab.com/3d-models/e185c3fd92b64c32b4515a32b29252fc
- cones: "Barrier & Traffic Cone Pack" by Sabri Ayeş (https://sketchfab.com/sabriayes), https://sketchfab.com/3d-models/barrier-traffic-cone-pack-23c4dfca76a24bf0b21894847867af2a. Only the cone, the delineator post and the barricade are used (other meshes unlinked in scene.gltf, textures cut to 1K).
- jp_street: "Japanese Traffic Assets" by Erik Kinč (https://sketchfab.com/erikkinc), https://sketchfab.com/3d-models/japanese-traffic-assets-1a4833770ace4df6aecfdabb76e36d60. Only the metal street bin, the blue can bin and the roadworks sign are used (other meshes unlinked in scene.gltf, textures cut to 1K).

## Street life (Poly Haven, CC0, glTF 1k, downloaded 2026-10-14)

planter_pot_clay, potted_plant_04, trashbag (re-coloured to the half-clear white Japanese bag in code), utility_box_02, plastic_crate_02; with potted_plant_02 and plastic_crate_01 from the interiors set. Placed by src/streetlife.js.

## Desy Ika · Flowers & Café (Poly Pizza, CC BY 3.0, downloaded 2026-10-14)

- props/rose/rose.glb: "Rose" by Erbay ÇELIK, https://poly.pizza/m/4UQ29NSK0ir
- props/roses/roses.glb: "Roses" by Christopher F, https://poly.pizza/m/1SUvEuQWCD2

Both re-coloured pink/white per bloom in code (src/interiors.js placeRoses).
