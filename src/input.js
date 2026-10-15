export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  // blocked: the game runs on but ignores the keys (the opening shot)
  down(...codes) { return !this.blocked && codes.some((c) => this.keys.has(c)); }
  hit(code) { return !this.blocked && this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}
