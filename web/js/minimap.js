// A small round map for the ground-level view: plots, builds, Charlie, and
// which way you're looking.
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.last = 0;
  }

  setVisible(v) {
    this.canvas.hidden = !v;
  }

  draw(now, { charlie, world, camera }) {
    if (this.canvas.hidden || now - this.last < 120 || !world) return;
    this.last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = this.canvas.clientWidth;
    if (this.canvas.width !== size * dpr) {
      this.canvas.width = size * dpr;
      this.canvas.height = size * dpr;
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = size / 2;
    const scale = r / 30; // 30 ft from center to edge
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(r, r, r - 1, 0, Math.PI * 2);
    c.fillStyle = 'rgba(18, 16, 14, 0.78)';
    c.fill();
    c.clip();
    const toMap = (x, z) => [r + (x - charlie.pos.x) * scale, r + (z - charlie.pos.z) * scale];
    const P = world.plotSize;
    const dot = (x, y, rad, color) => {
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    };
    // plots
    for (const obj of world.objects.values()) {
      const [x, y] = toMap(obj.meta.plot[0] * P, obj.meta.plot[1] * P);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) dot(x + i * 4, y + j * 4, 1.1, 'rgba(232, 220, 198, 0.55)');
    }
    const [hx, hy] = toMap(0, 0);
    c.strokeStyle = 'rgba(214, 131, 74, 0.8)';
    c.setLineDash([2, 3]);
    c.strokeRect(hx - 6 * scale, hy - 6 * scale, 12 * scale, 12 * scale);
    c.setLineDash([]);
    // where the camera looks
    const dx = charlie.pos.x - camera.position.x;
    const dz = charlie.pos.z - camera.position.z;
    const a = Math.atan2(dz, dx);
    c.beginPath();
    c.moveTo(r, r);
    c.arc(r, r, r * 0.55, a - 0.45, a + 0.45);
    c.closePath();
    c.fillStyle = 'rgba(147, 182, 216, 0.12)';
    c.fill();
    // Charlie
    const h = charlie.heading;
    c.beginPath();
    c.moveTo(r + Math.cos(h) * 7, r + Math.sin(h) * 7);
    c.lineTo(r + Math.cos(h + 2.5) * 5, r + Math.sin(h + 2.5) * 5);
    c.lineTo(r + Math.cos(h - 2.5) * 5, r + Math.sin(h - 2.5) * 5);
    c.closePath();
    c.fillStyle = '#d6834a';
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(r, r, r - 1, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(239, 230, 216, 0.15)';
    c.stroke();
  }
}
