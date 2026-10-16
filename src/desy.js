// Desy mode: the things made for Desy Ika — her name on the flower café, the card in its flowers, DESY on the
// number plates, her slide on the LED screens, her star over the bay, the map's heart and the photo frame — are
// only there when it's switched on. Off (the default), the café is the town's own flower café and the rest is
// ordinary. It's switched with a secret on the title screen (type D E S Y, or tap the AMEYORU logo five times) and
// kept per device; the town is rebuilt with it on the next load.
const KEY = 'ameyoru.desy';
export const DESY = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
// the café's name in neon and on its sign
export const CAFE_NAME = DESY ? 'Desy Ika' : 'Hoshimi';
export const CAFE_FULL = `${CAFE_NAME} · Flowers & Café`;
export function setDesy(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ } }
