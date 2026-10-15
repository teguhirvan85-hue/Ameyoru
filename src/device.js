// Which kind of device this is. Phones (a touch screen without a mouse, small screen) get the phone profile: the
// town and its look are the same, but textures are held at a size a phone screen can show (512 px), the paintings
// on canvases are kept at half size, fewer townsfolk are drawn at once and the render resolution follows the
// screen — so the whole town fits in the memory iOS gives a browser tab (about 1–1.5 GB).
// ?mobile=1 / ?mobile=0 in the address forces it either way (for testing on a desktop).
const q = new URLSearchParams(location.search).get('mobile');
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
const small = Math.min(screen.width, screen.height) <= 900;
const phoneUA = /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent);
export const MOBILE = q === '1' ? true : q === '0' ? false : (phoneUA || (coarse && small));
// the largest texture side kept on a phone (larger mip levels are dropped before they reach the GPU)
export const TEX_MAX = MOBILE ? 512 : Infinity;
