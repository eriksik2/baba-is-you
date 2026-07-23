export type ParticleKind = "spark" | "puff" | "win" | "shatter";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: ParticleKind;
  rot: number;
  spin: number;
}

const COLORS: Record<ParticleKind, string> = {
  spark: "#f5d76e",
  puff: "rgba(245, 248, 255, 0.9)",
  win: "#f0c75e",
  shatter: "#ff7eb6",
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class ParticleSystem {
  private particles: Particle[] = [];

  emit(x: number, y: number, kind: ParticleKind, count = 8): void {
    const n = Math.max(1, Math.floor(count));
    for (let i = 0; i < n; i++) {
      const angle = rand(0, Math.PI * 2);
      let speed: number;
      let life: number;
      let size: number;
      let vyBias = 0;

      switch (kind) {
        case "spark":
          speed = rand(40, 120);
          life = rand(0.25, 0.55);
          size = rand(2, 4.5);
          break;
        case "puff":
          speed = rand(10, 40);
          life = rand(0.4, 0.9);
          size = rand(4, 10);
          vyBias = -20;
          break;
        case "win":
          speed = rand(30, 100);
          life = rand(0.5, 1.1);
          size = rand(3, 7);
          vyBias = -40;
          break;
        case "shatter":
          speed = rand(50, 160);
          life = rand(0.3, 0.7);
          size = rand(2, 5);
          break;
      }

      this.particles.push({
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + vyBias,
        life,
        maxLife: life,
        size,
        kind,
        rot: rand(0, Math.PI * 2),
        spin: rand(-8, 8),
      });
    }
  }

  update(dt: number): void {
    const g = 80;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;

      if (p.kind === "puff") {
        p.vx *= Math.pow(0.2, dt);
        p.vy *= Math.pow(0.3, dt);
        p.size += 8 * dt;
      } else if (p.kind === "win") {
        p.vy -= 30 * dt;
        p.vx *= Math.pow(0.55, dt);
      } else if (p.kind === "shatter") {
        p.vy += g * dt;
      } else {
        // spark
        p.vy += g * 0.35 * dt;
        p.vx *= Math.pow(0.4, dt);
      }

      next.push(p);
    }
    this.particles = next;
  }

  /**
   * Particles live in world pixel space (already scaled by cell size).
   * `cam` is a pixel-space scroll offset subtracted when drawing.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    _cellSize: number,
    pad: number,
    cam?: { x: number; y: number },
  ): void {
    if (this.particles.length === 0) return;
    const ox = pad - (cam?.x ?? 0);
    const oy = pad - (cam?.y ?? 0);

    ctx.save();
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const alpha = Math.max(0, Math.min(1, t));
      const x = ox + p.x;
      const y = oy + p.y;
      const r = p.size * (0.5 + 0.5 * t);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS[p.kind];

      if (p.kind === "puff") {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "win") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        // tiny diamond / sparkle
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.45, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.45, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "shatter") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-r * 0.6, -r * 0.35, r * 1.2, r * 0.7);
        ctx.restore();
      } else {
        // spark
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-r * 0.2, -r, r * 0.4, r * 2);
        ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.4);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  get count(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles.length = 0;
  }
}
