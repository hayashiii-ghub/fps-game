'use strict';

(function exposeGrenadePhysics(root) {
  const DEFAULTS = Object.freeze({
    radius: 0.09,
    gravity: 16,
    restitution: 0.38,
    tangentDamping: 0.82,
    groundDamping: 0.72,
    rollingDrag: 4.5,
    stopSpeed: 0.12,
    maxStepDistance: 0.11,
    maxSubsteps: 12,
  });

  function sphereVsYawObb(pos, radius, box) {
    if (pos.y + radius < box.cy - box.hy || pos.y - radius > box.cy + box.hy) return null;
    const dx = pos.x - box.cx;
    const dz = pos.z - box.cz;
    const lx = dx * box.cos + dz * box.sin;
    const ly = pos.y - box.cy;
    const lz = -dx * box.sin + dz * box.cos;
    if (Math.abs(lx) > box.hx + radius || Math.abs(ly) > box.hy + radius || Math.abs(lz) > box.hz + radius) return null;

    const qx = Math.max(-box.hx, Math.min(box.hx, lx));
    const qy = Math.max(-box.hy, Math.min(box.hy, ly));
    const qz = Math.max(-box.hz, Math.min(box.hz, lz));
    let nx = lx - qx;
    let ny = ly - qy;
    let nz = lz - qz;
    const distSq = nx * nx + ny * ny + nz * nz;
    if (distSq > radius * radius) return null;

    let penetration;
    if (distSq > 1e-10) {
      const dist = Math.sqrt(distSq);
      nx /= dist;
      ny /= dist;
      nz /= dist;
      penetration = radius - dist;
    } else {
      const faceX = box.hx - Math.abs(lx);
      const faceY = box.hy - Math.abs(ly);
      const faceZ = box.hz - Math.abs(lz);
      if (faceX <= faceY && faceX <= faceZ) {
        nx = lx < 0 ? -1 : 1; ny = 0; nz = 0; penetration = radius + faceX;
      } else if (faceY <= faceZ) {
        nx = 0; ny = ly < 0 ? -1 : 1; nz = 0; penetration = radius + faceY;
      } else {
        nx = 0; ny = 0; nz = lz < 0 ? -1 : 1; penetration = radius + faceZ;
      }
    }

    return {
      nx: nx * box.cos - nz * box.sin,
      ny,
      nz: nx * box.sin + nz * box.cos,
      penetration,
    };
  }

  function bounceVelocity(vel, hit, restitution, tangentDamping, stopSpeed) {
    const incoming = vel.x * hit.nx + vel.y * hit.ny + vel.z * hit.nz;
    if (incoming >= 0) return;
    if (Math.abs(incoming) < stopSpeed) {
      vel.x -= incoming * hit.nx;
      vel.y -= incoming * hit.ny;
      vel.z -= incoming * hit.nz;
      return;
    }
    const tx = vel.x - incoming * hit.nx;
    const ty = vel.y - incoming * hit.ny;
    const tz = vel.z - incoming * hit.nz;
    const outgoing = -incoming * restitution;
    vel.x = tx * tangentDamping + hit.nx * outgoing;
    vel.y = ty * tangentDamping + hit.ny * outgoing;
    vel.z = tz * tangentDamping + hit.nz * outgoing;
  }

  function stepGrenadePhysics(state, colliders, dt, overrides) {
    const cfg = Object.assign({}, DEFAULTS, overrides || {});
    const pos = state.pos;
    const vel = state.vel;
    const travel = Math.hypot(vel.x, vel.y, vel.z) * dt;
    const steps = Math.max(1, Math.min(cfg.maxSubsteps, Math.ceil(travel / cfg.maxStepDistance)));
    const step = dt / steps;
    let hitAny = false;
    let grounded = false;

    for (let n = 0; n < steps; n++) {
      vel.y -= cfg.gravity * step;
      pos.x += vel.x * step;
      pos.y += vel.y * step;
      pos.z += vel.z * step;

      for (let pass = 0; pass < 2; pass++) {
        let best = null;
        for (const box of colliders || []) {
          const hit = sphereVsYawObb(pos, cfg.radius, box);
          if (hit && (!best || hit.penetration > best.penetration)) best = hit;
        }
        if (!best || best.penetration < 1e-7) break;
        pos.x += best.nx * best.penetration;
        pos.y += best.ny * best.penetration;
        pos.z += best.nz * best.penetration;
        const groundLike = best.ny > 0.55;
        bounceVelocity(
          vel,
          best,
          cfg.restitution,
          groundLike ? cfg.groundDamping : cfg.tangentDamping,
          cfg.stopSpeed,
        );
        hitAny = true;
        grounded = grounded || groundLike;
      }

      if (pos.y < cfg.radius) {
        pos.y = cfg.radius;
        const groundHit = { nx: 0, ny: 1, nz: 0 };
        bounceVelocity(vel, groundHit, cfg.restitution, cfg.groundDamping, cfg.stopSpeed);
        hitAny = true;
        grounded = true;
      }

      if (grounded && Math.abs(vel.y) < cfg.stopSpeed) {
        vel.y = 0;
        const drag = Math.exp(-cfg.rollingDrag * step);
        vel.x *= drag;
        vel.z *= drag;
        if (Math.hypot(vel.x, vel.z) < cfg.stopSpeed) {
          vel.x = 0;
          vel.z = 0;
        }
      }
    }

    return { hit: hitAny, grounded, substeps: steps };
  }

  function advanceGrenadeLaunch(state, colliders, distance) {
    const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z);
    if (speed < 1e-6 || distance <= 0) return { hit: false, grounded: false, substeps: 0 };
    return stepGrenadePhysics(state, colliders, distance / speed, { gravity: 0 });
  }

  root.GrenadePhysics = { advanceGrenadeLaunch, stepGrenadePhysics };
})(typeof globalThis !== 'undefined' ? globalThis : this);
