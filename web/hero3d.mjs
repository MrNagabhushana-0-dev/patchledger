// PatchLedger hero scene.
//
// A slow, interactive arrangement of translucent source cards drifting around
// a wireframe ledger ring. The visuals are generated procedurally in this
// file (canvas textures, geometry, particles) - nothing is fetched, executed
// or uploaded. Pointer position parallaxes the camera; page scroll dollies
// it. With reduced motion the scene renders one static frame and stops.

import * as THREE from './three.module.min.js?v=1.3.0';

function cardTexture(accent, seed) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 340;
  const g = c.getContext('2d');
  const rand = (() => { let s = seed * 2654435761 % 4294967296; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  g.clearRect(0, 0, 256, 340);
  const r = 18;
  g.beginPath();
  g.roundRect(4, 4, 248, 332, r);
  g.fillStyle = 'rgba(16, 28, 22, 0.72)';
  g.fill();
  g.strokeStyle = 'rgba(150, 220, 180, 0.35)';
  g.lineWidth = 2;
  g.stroke();
  // window dots
  for (let i = 0; i < 3; i++) {
    g.beginPath(); g.arc(28 + i * 18, 30, 4, 0, 7);
    g.fillStyle = i === 0 ? 'rgba(224,122,95,0.85)' : i === 1 ? 'rgba(224,190,95,0.85)' : 'rgba(120,216,160,0.85)';
    g.fill();
  }
  // code lines
  let y = 62;
  while (y < 315) {
    const indent = Math.floor(rand() * 4) * 22;
    const width = 40 + rand() * (170 - indent);
    const flagged = rand() > 0.88;
    g.fillStyle = flagged ? accent : `rgba(190, 226, 200, ${0.16 + rand() * 0.22})`;
    g.beginPath(); g.roundRect(24 + indent, y, width, 7, 3.5); g.fill();
    y += 15 + rand() * 7;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initHero(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null; // WebGL unavailable: the static hero background in CSS takes over.
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a100d, 0.055);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  camera.position.set(0, 0.4, 15);

  scene.add(new THREE.AmbientLight(0x4a6b58, 0.9));
  const key = new THREE.PointLight(0x8fe6b4, 60, 60); key.position.set(6, 7, 8); scene.add(key);
  const warm = new THREE.PointLight(0xe0be5f, 34, 50); warm.position.set(-8, -4, 5); scene.add(warm);
  const rim = new THREE.PointLight(0x5f9fff, 20, 50); rim.position.set(0, 3, -10); scene.add(rim);

  const world = new THREE.Group();
  scene.add(world);

  // Central wireframe ledger ring.
  const ring = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(3.1, 0.05, 12, 90),
    new THREE.MeshBasicMaterial({ color: 0x86e0ae, transparent: true, opacity: 0.55 }),
  );
  const torus2 = new THREE.Mesh(
    new THREE.TorusGeometry(3.55, 0.015, 8, 90),
    new THREE.MeshBasicMaterial({ color: 0xe0be5f, transparent: true, opacity: 0.35 }),
  );
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.05, 0.26, 140, 18, 2, 3),
    new THREE.MeshStandardMaterial({ color: 0x17352a, metalness: 0.7, roughness: 0.25, emissive: 0x1f6b47, emissiveIntensity: 0.55, wireframe: true }),
  );
  ring.add(torus, torus2, knot);
  ring.rotation.x = 0.5;
  world.add(ring);

  // Drifting source cards.
  const accents = ['rgba(224,122,95,0.95)', 'rgba(224,190,95,0.95)', 'rgba(120,216,160,0.95)'];
  const textures = [0, 1, 2, 3].map(i => cardTexture(accents[i % 3], i + 3));
  const cards = [];
  const cardGeo = new THREE.PlaneGeometry(1.75, 2.32);
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: textures[i % textures.length], transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const m = new THREE.Mesh(cardGeo, mat);
    const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.22;
    const radius = 5.1 + (i % 4) * 0.75;
    m.position.set(Math.cos(a) * radius, ((i * 7) % 9 - 4) * 0.62, Math.sin(a) * radius);
    m.rotation.set((Math.random() - 0.5) * 0.35, -a + Math.PI / 2 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.12);
    m.userData = { a, radius, y: m.position.y, speed: 0.14 + (i % 5) * 0.03, bob: Math.random() * 6.28 };
    world.add(m); cards.push(m);
  }

  // Constellation lines linking neighbouring cards; endpoints follow the cards.
  const linePos = new Float32Array(cards.length * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x6fd09c, transparent: true, opacity: 0.10 }));
  world.add(lines);
  function updateLines() {
    for (let i = 0; i < cards.length; i++) {
      const a = cards[i].position, b = cards[(i + 1) % cards.length].position;
      linePos[i * 6] = a.x; linePos[i * 6 + 1] = a.y; linePos[i * 6 + 2] = a.z;
      linePos[i * 6 + 3] = b.x; linePos[i * 6 + 4] = b.y; linePos[i * 6 + 5] = b.z;
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  const pCount = 420;
  const pos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const r = 4 + Math.random() * 13, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = (r * Math.cos(ph)) * 0.55;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x9fe8c0, size: 0.045, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(particles);

  // A dimmer, farther dust layer deepens the parallax.
  const farCount = 260;
  const farPos = new Float32Array(farCount * 3);
  for (let i = 0; i < farCount; i++) {
    const r = 14 + Math.random() * 16, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    farPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    farPos[i * 3 + 1] = (r * Math.cos(ph)) * 0.5;
    farPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const farGeo = new THREE.BufferGeometry();
  farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
  const farDust = new THREE.Points(farGeo, new THREE.PointsMaterial({ color: 0x6fae8b, size: 0.08, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(farDust);

  // Soft halo behind the ledger ring, breathing slowly.
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
  const gg = glowCanvas.getContext('2d');
  const haloGrad = gg.createRadialGradient(64, 64, 2, 64, 64, 62);
  haloGrad.addColorStop(0, 'rgba(160,255,200,0.55)');
  haloGrad.addColorStop(0.4, 'rgba(120,220,170,0.18)');
  haloGrad.addColorStop(1, 'rgba(120,220,170,0)');
  gg.fillStyle = haloGrad; gg.fillRect(0, 0, 128, 128);
  const knotGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  knotGlow.scale.setScalar(9);
  world.add(knotGlow);

  // State.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollT = 0, scrollS = 0, running = true, raf = 0, visible = true;
  const introT0 = performance.now();

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  resize();

  addEventListener('pointermove', e => {
    pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  addEventListener('scroll', () => {
    const hero = canvas.closest('.hero');
    scrollT = Math.min(1, Math.max(0, scrollY / Math.max(1, hero.offsetHeight)));
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running && !reduced) tick(); });
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible && !reduced) tick(); }, { threshold: 0.02 }).observe(canvas);

  const t0 = performance.now();
  function frame() {
    const t = (performance.now() - t0) / 1000;
    // Entrance dolly-in, eased; scroll is smoothed so the camera glides.
    const intro = reduced ? 1 : Math.min(1, (performance.now() - introT0) / 2400);
    const enter = 1 - Math.pow(1 - intro, 3);
    scrollS += (scrollT - scrollS) * 0.07;
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;
    world.rotation.y = t * 0.05 + pointer.x * 0.22;
    world.rotation.x = pointer.y * 0.10;
    knot.rotation.x = t * 0.22; knot.rotation.y = t * 0.3;
    torus.rotation.z = t * 0.08; torus2.rotation.z = -t * 0.06;
    torus.material.opacity = 0.45 + Math.sin(t * 0.9) * 0.12;
    for (const m of cards) {
      const u = m.userData;
      u.a += u.speed * 0.0035;
      m.position.x = Math.cos(u.a) * u.radius;
      m.position.z = Math.sin(u.a) * u.radius;
      m.position.y = u.y + Math.sin(t * 0.6 + u.bob) * 0.22;
      m.rotation.y = -u.a + Math.PI / 2;
    }
    updateLines();
    particles.rotation.y = t * 0.012;
    farDust.rotation.y = -t * 0.006;
    camera.position.z = 26 - 11 * enter - scrollS * 4.5;
    camera.position.y = 0.4 + scrollS * 1.2 - pointer.y * 0.35;
    camera.position.x = pointer.x * 0.9;
    camera.fov = 46 + scrollS * 6;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0.2, 0);
    camera.rotateZ(pointer.x * -0.04);
    knotGlow.material.opacity = 0.65 + Math.sin(t * 0.8) * 0.15;
    canvas.style.opacity = String(1 - scrollS * 0.75);
    renderer.render(scene, camera);
  }
  function tick() {
    cancelAnimationFrame(raf);
    if (!running || !visible) return;
    frame();
    raf = requestAnimationFrame(tick);
  }

  if (reduced) { frame(); } else { tick(); }
  return { resize };
}
