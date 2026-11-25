'use strict';
// Stateful decoder for the v0.23 delta snapshots (type 3), shared by the Node tests.
// feed(ArrayBuffer) applies one snapshot; .ents is the client's current copy (id -> {x,y,z,yaw,fl,lk}).
module.exports = function makeDecoder() {
  const ents = new Map(); const d = { ents, n: 0, removed: 0 };
  d.reset = () => ents.clear();
  d.feed = buf => {
    const dv = new DataView(buf); if (dv.getUint8(0) === 4) { d.shots = (d.shots || 0) + dv.getUint16(1, true); return d; }   // binary tracer frame, not a snapshot
    d.type = dv.getUint8(0); d.tick = dv.getUint32(1, true); d.ack = dv.getUint32(5, true);
    d.x = dv.getFloat32(9, true); d.y = dv.getFloat32(13, true); d.z = dv.getFloat32(17, true); d.vy = dv.getFloat32(21, true);
    d.hp = dv.getUint8(25); d.flags = dv.getUint8(26); d.ammo = dv.getUint16(27, true); d.supply = dv.getUint16(29, true); d.n = dv.getUint16(32, true);
    let o = 36;
    for (let i = 0; i < d.n; i++) {
      const id = dv.getUint16(o, true), m = dv.getUint8(o + 2); o += 3; let q = ents.get(id); if (!q) ents.set(id, q = { qx: 0, qy: 0, qz: 0, yaw: 0, fl: 0, lk: 0 });
      if (m & 1) { q.qx = dv.getInt16(o, true); q.qy = dv.getInt16(o + 2, true); q.qz = dv.getInt16(o + 4, true); o += 6; }
      else if (m & 2) { q.qx += dv.getInt8(o); q.qy += dv.getInt8(o + 1); q.qz += dv.getInt8(o + 2); o += 3; }
      if (m & 4) q.yaw = dv.getUint8(o++); if (m & 8) q.fl = dv.getUint8(o++); if (m & 16) q.lk = dv.getUint8(o++);
      q.x = q.qx / 100; q.y = q.qy / 100; q.z = q.qz / 100;
    }
    const nr = dv.getUint16(o, true); o += 2; d.removed = nr; for (let i = 0; i < nr; i++, o += 2) ents.delete(dv.getUint16(o, true));
    d.bytes = buf.byteLength; return d;
  };
  return d;
};
