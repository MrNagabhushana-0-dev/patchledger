// PatchLedger review map.
//
// An interactive 3D constellation of the files open in the workbench. Every
// node is a real file from the current workspace: position clusters by
// directory, colour shows the change status (compare mode) or the highest
// candidate level (single mode), size follows line count and the glow marks
// how many candidates the file carries. Drag to orbit, scroll or pinch to
// zoom, click a node to open that file in the review desk. Rendered locally
// from data already in the tab; no source text leaves the browser.

import * as THREE from './three.module.min.js?v=1.3.1';

const COLORS = {
  added: 0x58d68d, modified: 0xe6c15c, removed: 0xe07a5f, unchanged: 0x6f7f74,
  high: 0xe07a5f, review: 0xe6c15c, note: 0x7fa88c, clean: 0x4c6b58,
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function initMap(canvas, tooltip) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null; // WebGL unavailable: the list explorer remains fully usable.
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a100d, 0.045);
  const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 120);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.PointLight(0xbfffd9, 40, 60); key.position.set(6, 9, 7); scene.add(key);

  const world = new THREE.Group();
  scene.add(world);
  const spriteTex = glowTexture();
  const sphere = new THREE.SphereGeometry(1, 24, 18);

  // Ground grid.
  const grid = new THREE.PolarGridHelper(10, 12, 6, 48, 0x3d6b50, 0x26402f);
  grid.position.y = -2.2;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  world.add(grid);

  let nodes = [], nodeData = [], edges = null, halo = null;
  let onSelect = null, activeName = null;

  halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.45, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x9fe8c0, transparent: true, opacity: 0.9 }),
  );
  halo.visible = false;
  world.add(halo);

  function clearData() {
    for (const n of nodes) { world.remove(n.mesh); world.remove(n.glow); world.remove(n.hit); n.mesh.material.dispose(); n.glow.material.dispose(); n.hit.material.dispose(); }
    if (edges) { world.remove(edges); edges.geometry.dispose(); edges.material.dispose(); edges = null; }
    nodes = []; nodeData = []; halo.visible = false;
  }

  // Deterministic layout: one ring sector per top-level directory.
  function setData(files, change) {
    clearData();
    if (!files || !files.length) { fitCamera(4); return; }
    const names = new Set(files.map(f => f.name));
    const entries = change ? change.entries : files.map(f => ({ name: f.name, status: null }));
    const byDir = new Map();
    for (const e of entries) {
      const dir = e.name.includes('/') ? e.name.split('/')[0] : '(root)';
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(e);
    }
    const dirs = [...byDir.keys()];
    const clusterR = Math.min(7.2, 2.6 + entries.length * 0.16);
    const positions = new Map();
    dirs.forEach((dir, di) => {
      const ca = (di / dirs.length) * Math.PI * 2;
      const cx = Math.cos(ca) * clusterR, cz = Math.sin(ca) * clusterR;
      const list = byDir.get(dir);
      list.forEach((e, i) => {
        const a = (i / Math.max(1, list.length)) * Math.PI * 2 + di;
        const r = list.length === 1 ? 0 : 1.15;
        positions.set(e.name, new THREE.Vector3(cx + Math.cos(a) * r, ((i * 5 + di * 3) % 5 - 2) * 0.42, cz + Math.sin(a) * r));
      });
    });

    const linePts = [];
    for (const e of entries) {
      const file = files.find(f => f.name === e.name);
      const p = positions.get(e.name);
      const color = new THREE.Color(e.status ? COLORS[e.status] : COLORS[file && file.findings.length ? (file.findings.some(f => f.severity === 'high') ? 'high' : file.findings.some(f => f.severity === 'review') ? 'review' : 'note') : 'clean']);
      const scale = 0.16 + Math.min(0.3, Math.sqrt(file ? file.lines : 4) * 0.012);
      const mesh = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.35, transparent: true, opacity: names.has(e.name) ? 1 : 0.45 }));
      mesh.scale.setScalar(scale);
      mesh.position.copy(p);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      const glowScale = scale * (3 + Math.min(4, (file ? file.findings.length : 0) * 0.8));
      glow.scale.setScalar(glowScale);
      glow.position.copy(p);
      // Invisible, larger hit target so nodes stay tappable on touch screens.
      const hit = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      hit.scale.setScalar(Math.max(scale * 3.4, 0.6));
      hit.position.copy(p);
      world.add(mesh, glow, hit);
      nodes.push({ mesh, glow, hit });
      nodeData.push({ name: e.name, status: e.status, file, base: p.clone(), phase: (p.x * 13.7 + p.z * 7.3) % 6.28 });
      // edge from cluster centre
      const dir = e.name.includes('/') ? e.name.split('/')[0] : '(root)';
      const di = dirs.indexOf(dir);
      const ca = (di / dirs.length) * Math.PI * 2;
      linePts.push(new THREE.Vector3(Math.cos(ca) * clusterR, -0.1, Math.sin(ca) * clusterR), p);
    }
    const eGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    edges = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: 0x6fae88, transparent: true, opacity: 0.3 }));
    world.add(edges);
    setActive(activeName);
    fitCamera(clusterR);
    renderOnce();
  }

  function setActive(name) {
    activeName = name;
    const i = nodeData.findIndex(d => d.name === name);
    if (i < 0) { halo.visible = false; renderOnce(); return; }
    halo.visible = true;
    halo.position.copy(nodes[i].mesh.position);
    const s = nodes[i].mesh.scale.x;
    halo.scale.setScalar(Math.max(0.28, s * 2.1));
    halo.lookAt(camera.position);
    renderOnce();
  }

  // Camera orbit state.
  let theta = 0.7, phi = 1.05, dist = 14, targetDist = 14;
  function fitCamera(r) { targetDist = dist = Math.max(8.5, r * 1.8); }
  function applyCamera() {
    camera.position.set(
      dist * Math.sin(phi) * Math.cos(theta),
      dist * Math.cos(phi) + 1.2,
      dist * Math.sin(phi) * Math.sin(theta),
    );
    camera.lookAt(0, 0, 0);
  }

  // Pointer interactions.
  const ray = new THREE.Raycaster();
  ray.params.Points.threshold = 0.2;
  const ndc = new THREE.Vector2();
  let dragging = false, moved = 0, lastX = 0, lastY = 0, pinch = 0;
  const pointers = new Map();

  function pick(x, y) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(nodes.map(n => n.hit), false);
    if (!hits.length) return -1;
    return nodes.findIndex(n => n.hit === hits[0].object);
  }

  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or legacy pointers */ }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) targetDist = Math.min(30, Math.max(6, targetDist * (pinch / d)));
      pinch = d; moved += 5;
      return;
    }
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      theta += dx * 0.006;
      phi = Math.min(2.6, Math.max(0.35, phi - dy * 0.004));
      lastX = e.clientX; lastY = e.clientY;
      requestLoop();
      return;
    }
    // hover tooltip
    const i = pick(e.clientX, e.clientY);
    canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
    if (i < 0) { tooltip.hidden = true; return; }
    const d = nodeData[i];
    const status = d.status ? d.status : (d.file && d.file.findings.length ? `${d.file.findings.length} candidate${d.file.findings.length === 1 ? '' : 's'}` : 'no candidates');
    tooltip.textContent = `${d.name} · ${status}`;
    tooltip.hidden = false;
    const rect = canvas.getBoundingClientRect();
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    tooltip.style.left = Math.min(rect.width - tw - 8, Math.max(8, e.clientX - rect.left + 14)) + 'px';
    tooltip.style.top = Math.min(rect.height - th - 8, Math.max(8, e.clientY - rect.top - th - 8)) + 'px';
  });
  canvas.addEventListener('pointerup', e => {
    pointers.delete(e.pointerId);
    dragging = pointers.size > 0;
    if (moved < 6) {
      const i = pick(e.clientX, e.clientY);
      if (i >= 0 && onSelect) onSelect(nodeData[i].name);
    }
  });
  canvas.addEventListener('pointerleave', () => { tooltip.hidden = true; pointers.clear(); dragging = false; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    targetDist = Math.min(30, Math.max(6, targetDist + e.deltaY * 0.02));
    requestLoop();
  }, { passive: false });

  // Render loop: continuous while interacting/animating, otherwise on demand.
  let raf = 0, running = true, visible = true, idleSpin = !reduced;
  const t0 = performance.now();
  function frame() {
    const t = (performance.now() - t0) / 1000;
    if (idleSpin) theta += 0.0012;
    dist += (targetDist - dist) * 0.08;
    for (let i = 0; i < nodes.length; i++) {
      const d = nodeData[i];
      nodes[i].mesh.position.y = d.base.y + Math.sin(t * 0.9 + d.phase) * 0.09;
      nodes[i].glow.position.copy(nodes[i].mesh.position);
      nodes[i].hit.position.copy(nodes[i].mesh.position);
      if (halo.visible && d.name === activeName) halo.position.copy(nodes[i].mesh.position);
    }
    if (halo.visible) { halo.lookAt(camera.position); halo.rotation.z = t * 0.5; }
    applyCamera();
    renderer.render(scene, camera);
  }
  function tick() {
    cancelAnimationFrame(raf);
    if (!running || !visible) return;
    frame();
    raf = requestAnimationFrame(tick);
  }
  function requestLoop() { if (!reduced) tick(); }
  function renderOnce() { if (reduced) { applyCamera(); renderer.render(scene, camera); } else requestLoop(); }

  // Stop idle spinning after 12s of no interaction; wake on any pointer event.
  let idleTimer = 0;
  function wake() { idleSpin = !reduced; clearTimeout(idleTimer); idleTimer = setTimeout(() => { idleSpin = false; }, 12000); requestLoop(); }
  canvas.addEventListener('pointerdown', wake);
  wake();

  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) requestLoop(); });
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) requestLoop(); }, { threshold: 0.02 }).observe(canvas);
  new ResizeObserver(() => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderOnce();
  }).observe(canvas.parentElement);

  return {
    setData,
    setActive,
    set onSelect(fn) { onSelect = fn; },
  };
}
