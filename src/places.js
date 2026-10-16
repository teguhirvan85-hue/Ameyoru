// Places to find and the districts they sit in. Walking (or driving) close to a place discovers it: a banner,
// a tick in the map's list, a marker on the map. Crossing into another district announces it. What you've found
// is kept between visits (localStorage 'ameyoru.places').
//   kind: the marker's shape on the map (not only its colour): shop ■, food ●, play ◆, sight ▲, transit ▬, secret ★, love ♥
//   always: shown on the map (and in the list) before you've found it

import { NORTH } from './north.js';
import { DESY, CAFE_FULL } from './desy.js';

export const DISTRICTS = [
  { id: 'main', name: 'Hoshimi Street', jp: '星見通り', in: (x, z) => Math.abs(x) < 13 && z > -148 && z < 37 },
  // the north (north.js)
  { id: 'ginza', name: 'Hoshimi Ginza', jp: '星見銀座', in: (x, z) => Math.abs(x) < 7 && z > 44 && z < 103.5 },
  { id: 'blvd', name: 'Hoshimi-dōri', jp: '星見通り大通り', in: (x, z) => z >= 103.5 && z <= 126.5 && x > -131 && x < 161 },
  { id: 'shin', name: 'Shin-Hoshimi', jp: '新星見', in: (x, z) => z > 126.5 && z < 240 && x > -131 && x < 93.5 },
  { id: 'canal', name: 'Hoshimi Canal', jp: '星見運河', in: (x, z) => x >= 84.5 && x < 117 && z > 44 && z < 240 },
  { id: 'harbour', name: 'Hoshimi Harbour', jp: '星見港', in: (x, z) => x >= 117 && x < 200 && z > 44 && z < 240 },
  { id: 'north', name: 'North Street', jp: '北通り', in: (x, z) => z >= 37 && z <= 44 && Math.abs(x) < 72 },
  { id: 'yoko', name: 'Yokochō', jp: '横丁', in: (x, z) => x < -13 && x > -42 && z > -103 && z < -93 },
  { id: 'park', name: 'Hoshimi Park', jp: '星見公園', in: (x, z) => x > 6 && x < 35 && z > -119 && z < -99 },
  { id: 'station', name: 'Station & Viaduct', jp: '星見駅・高架下', in: (x, z) => z <= -148 && z > -162 && Math.abs(x) < 46 },
  { id: 'east', name: 'East Back Street', jp: '東裏通り', in: (x, z) => x > 40 && x < 62 && z > -196 && z < 103.5 },
  { id: 'west', name: 'West Back Street', jp: '西裏通り', in: (x, z) => x < -40 && x > -62 && z > -196 && z < 103.5 },
  { id: 'south', name: 'South Street', jp: '南通り', in: (x, z) => z <= -190 && z > -212 && Math.abs(x) < 72 },
  { id: 'tsukino', name: 'Tsukino', jp: '月野', in: (x) => x > 900 },
];

// r: how close counts as having found it; at: a test of its own (the rooftops)
export const PLACES = [
  { id: 'mart', name: 'Hoshi Mart', jp: 'ほしマート', kind: 'shop', d: 'main', x: 11, z: 0, r: 6.5 },
  { id: 'arcade', name: 'Game Center Lumina', jp: 'ゲームセンター', kind: 'play', d: 'main', x: -11, z: -17, r: 6 },
  { id: 'kissa', name: 'Kissaten', jp: '喫茶', kind: 'food', d: 'main', x: -9, z: -6, r: 4 },
  { id: 'laundry', name: 'Coin laundry', jp: 'コインランドリー', kind: 'shop', d: 'main', x: -9, z: 32, r: 4 },
  { id: 'barber', name: 'Barber', jp: '理容', kind: 'shop', d: 'main', x: -9, z: 14, r: 4 },
  { id: 'karaoke', name: 'Karaoke', jp: 'カラオケ', kind: 'play', d: 'main', x: 9, z: 25, r: 4 },
  { id: 'gacha', name: 'Capsule toy shop', jp: 'ガチャガチャ', kind: 'play', d: 'main', x: 9, z: 17, r: 4 },
  { id: 'estate', name: 'Estate agent', jp: '不動産', kind: 'shop', d: 'main', x: -9, z: -38, r: 4 },
  { id: 'shrine', name: 'Hoshimi Inari Shrine', jp: '星見稲荷', kind: 'sight', d: 'main', x: -11, z: -44, r: 6 },
  { id: 'ramen', name: 'Ramen shop', jp: 'ラーメン', kind: 'food', d: 'main', x: 9, z: -58, r: 4 },
  { id: 'crossing', name: 'Railway crossing', jp: '踏切', kind: 'sight', d: 'main', x: 0, z: -66, r: 7 },
  { id: 'izakaya', name: 'Izakaya', jp: '居酒屋', kind: 'food', d: 'main', x: -9, z: -107, r: 4 },
  { id: 'yoko', name: 'Yokochō alley', jp: '横丁', kind: 'food', d: 'yoko', x: -26, z: -98, r: 7 },
  { id: 'park', name: 'Hoshimi Park', jp: '星見公園', kind: 'sight', d: 'park', x: 20, z: -109, r: 9 },
  { id: 'station', name: 'Hoshimi Station', jp: '星見駅', kind: 'transit', d: 'station', x: -19, z: -154, r: 7 },
  { id: 'underpass', name: 'Under the viaduct', jp: '高架下', kind: 'sight', d: 'station', x: 0, z: -154, r: 6 },
  { id: 'north', name: 'North Street', jp: '北通り', kind: 'sight', d: 'north', x: 0, z: 40, r: 9 },
  { id: 'east', name: 'East Back Street', jp: '東裏通り', kind: 'sight', d: 'east', x: 51, z: -60, r: 12 },
  { id: 'west', name: 'West Back Street', jp: '西裏通り', kind: 'sight', d: 'west', x: -51, z: -60, r: 12 },
  { id: 'south', name: 'South Street', jp: '南通り', kind: 'sight', d: 'south', x: 0, z: -200, r: 10 },
  { id: 'ginza', name: 'Hoshimi Ginza', jp: '星見銀座', kind: 'shop', d: 'ginza', x: 0, z: 50, r: 7 },
  // where it stands is settled when the arcade is built (north.js NORTH.desy)
  { id: 'desy', name: CAFE_FULL, jp: '花とカフェ', kind: DESY ? 'love' : 'food', always: DESY, d: 'ginza', get x() { return (NORTH.desy?.x ?? 7) - 2; }, get z() { return NORTH.desy?.z ?? 70; }, r: 4.5 },
  { id: 'plaza', name: 'Shin-Hoshimi Plaza', jp: '新星見広場', kind: 'sight', d: 'shin', x: 0, z: 140, r: 10 },
  { id: 'skytower', name: 'Hoshimi Sky Tower', jp: '星見スカイタワー', kind: 'sight', d: 'shin', x: 0, z: 158, r: 7 },
  { id: 'promenade', name: 'Canal promenade', jp: '運河プロムナード', kind: 'sight', d: 'canal', x: 90, z: 70, r: 8 },
  { id: 'footbridge', name: 'Canal footbridge', jp: '運河橋', kind: 'sight', d: 'canal', x: 106, z: 72, r: 6 },
  { id: 'yakatabune', name: 'Yakatabune', jp: '屋形船', kind: 'food', d: 'canal', x: 95, z: 152, r: 7 },
  { id: 'warehouses', name: 'Warehouse row', jp: '倉庫街', kind: 'sight', d: 'harbour', x: 124, z: 60, r: 10 },
  { id: 'cranes', name: 'Harbour cranes', jp: 'ガントリークレーン', kind: 'sight', d: 'harbour', x: 166, z: 118, r: 14 },
  { id: 'roof', name: 'A rooftop', jp: '屋上', kind: 'secret', d: 'main', x: null, z: null, at: (p) => p.y > 7.5 && !(p.z < -152 && p.z > -159) },
  { id: 'tsukino', name: 'Tsukino Station', jp: '月野駅', kind: 'transit', d: 'tsukino', x: null, z: null, at: (p) => p.x > 900 },
  { id: 'ginza', name: 'Tsukino Ginza', jp: '月野銀座', kind: 'shop', d: 'tsukino', x: null, z: null, at: (p) => p.x > 1180 && p.x < 1220 && p.z > -12 && p.z < 14 },
  { id: 'pachinko', name: 'Pachinko Moon', jp: 'パチンコ ムーン', kind: 'play', d: 'tsukino', x: null, z: null, at: (p) => p.x > 1182 && p.x < 1200 && p.z > -4 && p.z < 12 && p.y < 1 },
];

const KEY = 'ameyoru.places';

export function makePlaces({ banner }) {
  let found;
  try { found = new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { found = new Set(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...found])); } catch { /* storage unavailable */ } };
  let district = null, t = 0, settle = 0;
  return {
    PLACES, DISTRICTS,
    has: (id) => found.has(id),
    get count() { return found.size; },
    get total() { return PLACES.length; },
    get district() { return district; },
    // every few frames: anything new nearby, and which district you're in
    update(dt, p) {
      if ((t -= dt) > 0) return; t = 0.25;
      for (const pl of PLACES) {
        if (found.has(pl.id)) continue;
        const near = pl.at ? pl.at(p) : Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r && p.y < 4;
        if (!near) continue;
        found.add(pl.id); save();
        banner('DISCOVERED', `${pl.name}`, pl.jp, `${found.size} / ${PLACES.length}`);
        return;   // one banner at a time
      }
      const d = DISTRICTS.find((q) => q.in(p.x, p.z)) || null;
      // announce a district once you've been in it a moment (not when you graze its edge)
      if (d !== district) { settle += 0.25; if (settle >= 0.75) { settle = 0; const first = district === null; district = d; if (d && !first) banner('ENTERING', d.name, d.jp); } }
      else settle = 0;
    },
  };
}
