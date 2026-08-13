// 复现渲染级检查仍残留的交叉配置，找出是哪对连接在交叉、为什么检查没拦住。
// 用法: node residual-debug.mjs <A模板> <A旋转> <B模板> <B旋转> <bx> <by> <镜X> <镜Y>
import { createServer } from "vite";
const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const logic = await server.ssrLoadModule("/app/wiring/connectionLogic.ts");
const types = await server.ssrLoadModule("/app/wiring/types.ts");
const tpls = await server.ssrLoadModule("/app/wiring/templates.ts");
await server.close();
const templateMap = new Map(tpls.MODULE_TEMPLATES.map((t) => [t.id, t]));
const PORT_SNAP = 72;
function module(id, template, x, y, rotation = 0, mirrorX, mirrorY) {
  return { id, templateId: template.id, name: id, x, y, rotation, mirrorX, mirrorY, lineIds: [], sourceStationIds: [], locked: false, layerId: "l", zIndex: 0, pageId: "p1", visible: true, createdOrder: 0, customParams: {} };
}
function makeConn(id, from, to) {
  return { id, fromModuleId: from.moduleId, fromPortId: from.portId, toModuleId: to.moduleId, toPortId: to.portId, tracks: [], crossingType: "plain", crossingPoints: [], controlPoints: [], autoCurve: true, lineStyle: "solid", layerId: "l", zIndex: 0, pageId: "p1", createdOrder: 0 };
}
function portsFaceEachOther(fromPos, toPos) {
  const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
  const chordLength = Math.hypot(dx, dy);
  if (chordLength < 1e-6) return true;
  const chordX = dx / chordLength, chordY = dy / chordLength;
  const unit = (angle) => { const r = (angle * Math.PI) / 180; return { x: Math.cos(r), y: Math.sin(r) }; };
  const fromUnit = unit(fromPos.direction), toUnit = unit(toPos.direction);
  const forward = fromUnit.x * chordX + fromUnit.y * chordY;
  const backward = toUnit.x * -chordX + toUnit.y * -chordY;
  return forward > -0.6 && backward > -0.6;
}
function crossAxisOffset(a, b) {
  const axisOf = (d) => { const n = ((d % 360) + 360) % 360; return n === 90 || n === 270 ? "vertical" : "horizontal"; };
  const axis = axisOf(a.direction);
  if (axisOf(b.direction) !== axis) return null;
  return axis === "vertical" ? b.x - a.x : b.y - a.y;
}
function segmentsCross(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSeg = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  if ((o1 === 0 && onSeg(a, c, b)) || (o2 === 0 && onSeg(a, d, b)) || (o3 === 0 && onSeg(c, a, d)) || (o4 === 0 && onSeg(c, b, d))) return true;
  return false;
}
function findCompletingPort(fromMod, fromTemplate, toMod, toTemplate, toPort, fromPortId, mods, templates, selected) {
  const toWorld = types.worldPortPosition(toMod, toTemplate, toPort.id);
  let best = null; let bestDistance = Infinity;
  for (const port of fromTemplate.ports) {
    if (port.id === fromPortId) continue;
    const portWorld = types.worldPortPosition(fromMod, fromTemplate, port.id);
    const distance = Math.hypot(portWorld.x - toWorld.x, portWorld.y - toWorld.y);
    if (distance >= PORT_SNAP) continue;
    if (!portsFaceEachOther(portWorld, toWorld)) continue;
    const fromEndpoint = logic.getConnectionEndpoint(fromMod.id, port.id, mods, templates);
    const toEndpoint = logic.getConnectionEndpoint(toMod.id, toPort.id, mods, templates);
    if (!fromEndpoint || !toEndpoint) continue;
    if (!logic.validateConnection(fromEndpoint, toEndpoint, [...selected]).valid) continue;
    if (distance < bestDistance) { bestDistance = distance; best = port; }
  }
  return best;
}
function tryAutoConnect(newMod, other, templates, trace) {
  const out = [];
  const newTemplate = templates.get(newMod.templateId);
  const otherTemplate = templates.get(other.templateId);
  const candidates = [];
  for (const np of newTemplate.ports) {
    const npWorld = types.worldPortPosition(newMod, newTemplate, np.id);
    for (const op of otherTemplate.ports) {
      const opWorld = types.worldPortPosition(other, otherTemplate, op.id);
      const distance = Math.hypot(npWorld.x - opWorld.x, npWorld.y - opWorld.y);
      if (distance >= PORT_SNAP) continue;
      if (!portsFaceEachOther(npWorld, opWorld)) continue;
      const from = logic.getConnectionEndpoint(newMod.id, np.id, [newMod, other], templates);
      const to = logic.getConnectionEndpoint(other.id, op.id, [newMod, other], templates);
      if (!from || !to) continue;
      if (!logic.validateConnection(from, to, [...out]).valid) continue;
      const npPartner = logic.findDoubleTrackPartner(newTemplate, np);
      const opPartner = logic.findDoubleTrackPartner(otherTemplate, op);
      let goodDouble = false;
      let braided = false;
      const npPW = npPartner ? types.worldPortPosition(newMod, newTemplate, npPartner.id) : null;
      const opPW = opPartner ? types.worldPortPosition(other, otherTemplate, opPartner.id) : null;
      if (npPartner && opPartner) {
        const npPE = logic.getConnectionEndpoint(newMod.id, npPartner.id, [newMod, other], templates);
        const opPE = logic.getConnectionEndpoint(other.id, opPartner.id, [newMod, other], templates);
        if (npPE && opPE
          && Math.hypot(npPW.x - opPW.x, npPW.y - opPW.y) < PORT_SNAP
          && portsFaceEachOther(npPW, opPW)
          && logic.validateConnection(npPE, opPE, [...out]).valid) {
          const o1 = crossAxisOffset(npWorld, opWorld);
          const o2 = crossAxisOffset(npPW, opPW);
          goodDouble = o1 === null || o2 === null || Math.sign(o1) === Math.sign(o2) || Math.abs(o1) < 4 || Math.abs(o2) < 4;
          braided = segmentsCross(npWorld, opWorld, npPW, opPW);
        }
      } else if (npPartner || opPartner) {
        const completing = npPartner
          ? findCompletingPort(other, otherTemplate, newMod, newTemplate, npPartner, op.id, [newMod, other], templates, out)
          : findCompletingPort(newMod, newTemplate, other, otherTemplate, opPartner, np.id, [newMod, other], templates, out);
        if (completing) {
          const completingWorld = npPartner
            ? types.worldPortPosition(other, otherTemplate, completing.id)
            : types.worldPortPosition(newMod, newTemplate, completing.id);
          braided = segmentsCross(npWorld, opWorld, completingWorld, (npPartner ? npPW : opPW));
        }
      }
      candidates.push({ from, to, distance, goodDouble, braided, npWorld, opWorld });
    }
  }
  candidates.sort((a, b) => {
    if (a.braided !== b.braided) return a.braided ? 1 : -1;
    if (a.goodDouble !== b.goodDouble) return a.goodDouble ? -1 : 1;
    return a.distance - b.distance;
  });
  const createdPaths = [];
  for (const c of candidates) {
    if (!logic.validateConnection(c.from, c.to, [...out]).valid) continue;
    const conn = makeConn(`c${out.length}`, c.from, c.to);
    const fromPartner = logic.findDoubleTrackPartner(newTemplate, c.from.port);
    const toPartner = logic.findDoubleTrackPartner(otherTemplate, c.to.port);
    let partnerConn = null;
    if (fromPartner && toPartner) {
      const fromP = logic.getConnectionEndpoint(newMod.id, fromPartner.id, [newMod, other], templates);
      const toP = logic.getConnectionEndpoint(other.id, toPartner.id, [newMod, other], templates);
      const fromPW = types.worldPortPosition(newMod, newTemplate, fromPartner.id);
      const toPW = types.worldPortPosition(other, otherTemplate, toPartner.id);
      if (fromP && toP
        && Math.hypot(fromPW.x - toPW.x, fromPW.y - toPW.y) < PORT_SNAP
        && portsFaceEachOther(fromPW, toPW)
        && logic.validateConnection(fromP, toP, [...out]).valid) {
        partnerConn = makeConn(`c${out.length}p`, fromP, toP);
      }
    }
    const tentative = [...out, conn];
    if (partnerConn) tentative.push(partnerConn);
    const path = render(conn, tentative, [newMod, other], templates)?.path ?? null;
    const partnerPath = partnerConn ? (render(partnerConn, tentative, [newMod, other], templates)?.path ?? null) : null;
    if (trace) {
      console.log(`候选 ${c.from.portId}->${c.to.portId} (dist=${c.distance.toFixed(1)}, goodDouble=${c.goodDouble}, braided=${c.braided}) partner=${partnerConn ? partnerConn.fromPortId + '->' + partnerConn.toPortId : '无'}`);
      if (path) console.log(`  路径: ${path}`);
    }
    if ((path && createdPaths.some((existing) => existing && logic.pathsCross(existing, path)))
      || (partnerPath && createdPaths.some((existing) => existing && logic.pathsCross(existing, partnerPath)))
      || (path && partnerPath && logic.pathsCross(path, partnerPath))) {
      if (trace) console.log(`  → 与已保留轨道交叉/配对自相交，跳过`);
      continue;
    }
    out.push(conn);
    createdPaths.push(path);
    if (trace) console.log(`  → 接受`);
    if (partnerConn) {
      out.push(partnerConn);
      createdPaths.push(partnerPath);
      if (trace) console.log(`  → 配对一起接受`);
    }
  }
  return out;
}
function render(conn, conns, modules, templates) {
  const e = logic.endpointsForConnection(conn, modules, templates);
  const partner = logic.findPairedConnection(conn, conns, modules, templates);
  const pe = partner ? logic.endpointsForConnection(partner, modules, templates) : undefined;
  if (!e) return null;
  const paired = e && pe ? logic.buildPairedOffsetPathD(e, pe) : null;
  if (paired) return { path: paired, chord: Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) };
  const geometry = logic.getConnectionGeometry(conn, modules, templates, pe ?? undefined);
  const p = geometry ? types.buildControlPointPathD(geometry.from, geometry.to, geometry.controlPoints, geometry.fromDir, geometry.toDir) : null;
  return { path: p, chord: Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) };
}
function samplePath(pathD, stepsPerCurve = 40) {
  const commands = pathD.match(/[MLCQ][^MLCQ]*/g) || [];
  const pts = []; let current = null;
  for (const command of commands) {
    const values = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (command[0] === "M") { current = { x: values[0], y: values[1] }; pts.push(current); continue; }
    if (!current) continue;
    if (command[0] === "L") { const e = { x: values[0], y: values[1] }; pts.push(e); current = e; continue; }
    if (command[0] === "C") { const [x1, y1, x2, y2, x3, y3] = values; const s = current; for (let i = 1; i <= stepsPerCurve; i++) { const t = i / stepsPerCurve, mt = 1 - t; pts.push({ x: mt * mt * mt * s.x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3, y: mt * mt * mt * s.y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3 }); } current = { x: x3, y: y3 }; }
  }
  return pts;
}
function crossInfo(d1, d2) {
  const p1 = samplePath(d1), p2 = samplePath(d2);
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSeg = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  let n = 0;
  for (let i = 0; i < p1.length - 1; i++) for (let j = 0; j < p2.length - 1; j++) {
    const a = p1[i], b = p1[i + 1], c = p2[j], d = p2[j + 1];
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    const touch = (o1 === 0 && onSeg(a, c, b)) || (o2 === 0 && onSeg(a, d, b)) || (o3 === 0 && onSeg(c, a, d)) || (o4 === 0 && onSeg(c, b, d));
    if (touch) continue;
    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) n++;
  }
  return n;
}
const nameA = process.argv[2], rotA = Number(process.argv[3] || 0);
const nameB = process.argv[4], rotB = Number(process.argv[5] || 0);
const bx = Number(process.argv[6]), by = Number(process.argv[7]);
const mx = process.argv[8] === "1", my = process.argv[9] === "1";
const A = templateMap.get(nameA), B = templateMap.get(nameB);
const a = module("a", A, 200, 300, rotA);
const b = module("b", B, bx, by, rotB, mx, my);
const templates = new Map([[A.id, A], [B.id, B]]);
console.log(`配置: ${A.id}${rotA}° @200,300 + ${B.id}${rotB}°镜${mx ? 'X' : ''}${my ? 'Y' : ''} @${bx},${by}`);
const conns = tryAutoConnect(b, a, templates, true);
console.log(`\n最终连接数=${conns.length}`);
for (const cn of conns) {
  const r = render(cn, conns, [a, b], templates);
  console.log(`  ${cn.id}: ${cn.fromModuleId}:${cn.fromPortId} -> ${cn.toModuleId}:${cn.toPortId}  chord=${r?.chord?.toFixed(1)}`);
  console.log(`    path: ${r?.path}`);
}
for (let i = 0; i < conns.length; i++) for (let j = i + 1; j < conns.length; j++) {
  const ri = render(conns[i], conns, [a, b], templates);
  const rj = render(conns[j], conns, [a, b], templates);
  if (ri?.path && rj?.path) {
    const cc = crossInfo(ri.path, rj.path);
    if (cc > 0) console.log(`交叉: ${conns[i].id}(${conns[i].fromPortId}->${conns[i].toPortId}) × ${conns[j].id}(${conns[j].fromPortId}->${conns[j].toPortId}) = ${cc}`);
  }
}
