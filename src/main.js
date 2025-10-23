// Client main (multiplayer-capable). Uses three.js, chunked world with InstancedMesh,
// simple AABB collision, save/load, and WebSocket multiplayer.

import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.155.0/examples/jsm/controls/PointerLockControls.js';
import { Chunk, CHUNK_SIZE } from './chunk.js';

const canvasContainer = document.body;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 30, 140);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0, 6, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444d6a, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(100, 200, 100);
scene.add(sun);

// Controls
const controls = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked) controls.lock();
});
controls.addEventListener('lock', () => { document.getElementById('hud').style.opacity = '0.6'; });
controls.addEventListener('unlock', () => { document.getElementById('hud').style.opacity = '1'; });

// Prevent context menu
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Block definitions
const BLOCK_DEFS = {
  1:{name:'Grass', color:0x62b24a, accent:0x4f8a35},
  2:{name:'Dirt', color:0x8e5d34, accent:0x754829},
  3:{name:'Stone', color:0x8a8a8a, accent:0x6f6f6f},
  4:{name:'Wood', color:0x9b6f3e, accent:0x7f5226},
  5:{name:'Sand', color:0xf0e29a, accent:0xe1d57a},
  6:{name:'Brick', color:0xcc4b3a, accent:0xaa3e32}
};

// Procedural pixel texture (16x16)
function makePixelTexture(base, accent, size=16){
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size,size);
  for (let y=0;y<size;y++){
    for (let x=0;x<size;x++){
      let c = base;
      if (((x+y)&1)===0){
        const r=((c>>16)&255)-8, g=((c>>8)&255)-8, b=(c&255)-8;
        c = ((r<0?0:r)<<16)|((g<0?0:g)<<8)|(b<0?0:b);
      }
      if (Math.random() < 0.02) c = accent;
      const idx = (y*size + x)*4;
      img.data[idx] = (c>>16)&255;
      img.data[idx+1] = (c>>8)&255;
      img.data[idx+2] = c&255;
      img.data[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, canvas };
}

// Materials by type (InstancedMesh wants shared material)
const materialByType = {};
const materialUserCanvas = {};
for (const id in BLOCK_DEFS){
  const def = BLOCK_DEFS[id];
  const { tex, canvas } = makePixelTexture(def.color, def.accent);
  materialByType[id] = new THREE.MeshStandardMaterial({ map: tex });
  materialUserCanvas[id] = canvas;
}

// shared geometry
const cubeGeo = new THREE.BoxGeometry(1,1,1);

// World/chunks container
const chunks = new Map(); // key chunkX,chunkZ -> Chunk
function chunkKey(cx, cz){ return `${cx},${cz}`; }

function getOrCreateChunk(cx, cz){
  const k = chunkKey(cx,cz);
  if (chunks.has(k)) return chunks.get(k);
  const c = new Chunk(cx, cz, scene, cubeGeo, materialByType);
  chunks.set(k, c);
  return c;
}

// world data (simple map of block coords to type)
const world = new Map(); // "x,y,z" -> type
function worldKey(x,y,z){ return `${x},${y},${z}`; }
function setBlock(x,y,z,type){
  const k = worldKey(x,y,z);
  if (type === 0) {
    world.delete(k);
  } else {
    world.set(k, type);
  }
  // update chunk
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const chunk = getOrCreateChunk(cx, cz);
  const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  if (type === 0) chunk.setBlock(lx, y, lz, 0);
  else chunk.setBlock(lx, y, lz, type);
  chunk.rebuild(cx, cz);
}
function getBlock(x,y,z){
  return world.get(worldKey(x,y,z)) || 0;
}

// generate simple flat terrain
function generateFlat(radius=24){
  world.clear();
  for (let x=-radius;x<radius;x++){
    for (let z=-radius;z<radius;z++){
      setBlock(x, 0, z, 1);
      for (let y=-3;y<0;y++) setBlock(x,y,z,2);
    }
  }
  // some random features
  for (let i=0;i<160;i++){
    const rx = Math.floor((Math.random()*radius*2)-radius);
    const rz = Math.floor((Math.random()*radius*2)-radius);
    setBlock(rx,1,rz, [3,4,5,6][Math.floor(Math.random()*4)]);
  }
}
generateFlat(24);

// save/load local
function saveToLocal(){
  const arr = [];
  for (const [k,t] of world.entries()) {
    const [x,y,z] = k.split(',').map(Number);
    arr.push({x,y,z,type:t});
  }
  localStorage.setItem('voxel_world_v1', JSON.stringify(arr));
}
function loadFromLocal(){
  const raw = localStorage.getItem('voxel_world_v1');
  if (!raw) return false;
  const arr = JSON.parse(raw);
  // clear
  for (const k of Array.from(world.keys())) {
    const [x,y,z] = k.split(',').map(Number);
    setBlock(Number(x),Number(y),Number(z),0);
  }
  for (const b of arr) setBlock(b.x,b.y,b.z,b.type);
  return true;
}
function exportWorld(){
  const arr = [];
  for (const [k,t] of world.entries()) {
    const [x,y,z] = k.split(',').map(Number);
    arr.push({x,y,z,type:t});
  }
  const blob = new Blob([JSON.stringify(arr)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'world.json'; a.click();
  URL.revokeObjectURL(url);
}
function importWorldFile(file){
  const r = new FileReader();
  r.onload = (ev) => {
    const arr = JSON.parse(ev.target.result);
    for (const k of Array.from(world.keys())) {
      const [x,y,z] = k.split(',').map(Number);
      setBlock(Number(x),Number(y),Number(z),0);
    }
    for (const b of arr) setBlock(b.x,b.y,b.z,b.type);
  };
  r.readAsText(file);
}

// Instanced world already built by setBlock calling chunk.rebuild

// Player collision AABB
const PLAYER_SIZE = { x:0.6, y:1.8, z:0.6 };
function collidesAt(pos){
  // sample points in AABB against blocks
  const minX = Math.floor(pos.x - PLAYER_SIZE.x/2);
  const maxX = Math.floor(pos.x + PLAYER_SIZE.x/2);
  const minY = Math.floor(pos.y - 0.01);
  const maxY = Math.floor(pos.y + PLAYER_SIZE.y);
  const minZ = Math.floor(pos.z - PLAYER_SIZE.z/2);
  const maxZ = Math.floor(pos.z + PLAYER_SIZE.z/2);
  for (let x=minX;x<=maxX;x++){
    for (let y=minY;y<=maxY;y++){
      for (let z=minZ;z<=maxZ;z++){
        if (getBlock(x,y,z) !== 0) return true;
      }
    }
  }
  return false;
}

// Movement
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.replace('Digit',''),10);
    if (n>=1 && n<=9) selectSlot(n-1);
  }
});
window.addEventListener('keyup', (e) => keys[e.code] = false );

// Simple movement with AABB resolution
let velocity = new THREE.Vector3();
const speed = 6;
const gravity = -20;
let onGround = false;

function handleMovement(dt){
  const forward = (keys['KeyW']?1:0) - (keys['KeyS']?1:0);
  const right = (keys['KeyD']?1:0) - (keys['KeyA']?1:0);
  const up = (keys['Space']?1:0);
  const down = (keys['ShiftLeft']||keys['ShiftRight']?1:0);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const rvec = new THREE.Vector3().crossVectors(camera.up, dir).normalize();

  // horizontal velocity from input
  const desire = new THREE.Vector3();
  desire.addScaledVector(dir, forward);
  desire.addScaledVector(rvec, right);
  if (desire.lengthSq() > 0) desire.normalize().multiplyScalar(speed);

  // apply horizontal smoothing
  velocity.x += (desire.x - velocity.x) * Math.min(10*dt, 1);
  velocity.z += (desire.z - velocity.z) * Math.min(10*dt, 1);

  // gravity & jump
  if (onGround && up) {
    velocity.y = 8.0; // jump
    onGround = false;
  } else {
    velocity.y += gravity * dt;
  }

  // attempt movement with AABB collision resolution (simple iterative)
  const newPos = camera.position.clone().addScaledVector(velocity, dt);
  // slide separately on axes
  const testPosX = new THREE.Vector3(newPos.x, camera.position.y, camera.position.z);
  if (!collidesAt(testPosX)) camera.position.x = testPosX.x; else velocity.x = 0;
  const testPosZ = new THREE.Vector3(camera.position.x, camera.position.y, newPos.z);
  if (!collidesAt(testPosZ)) camera.position.z = testPosZ.z; else velocity.z = 0;
  const testPosY = new THREE.Vector3(camera.position.x, newPos.y, camera.position.z);
  if (!collidesAt(testPosY)) {
    camera.position.y = testPosY.y;
    onGround = false;
  } else {
    // landed on ground: zero vertical vel and snap
    if (velocity.y < 0) onGround = true;
    velocity.y = 0;
  }
}

// Raycasting for block targeting
const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0,0);
function getTarget(){
  ray.setFromCamera(center, camera);
  // build candidate meshes from chunk instances (we can't raycast InstancedMesh per instance easily),
  // so we raycast against a temporary list of block bounding boxes: use world entries near camera.
  // For simplicity, raycast against a small set of block cubes near camera.
  const near = [];
  const px = Math.floor(camera.position.x);
  const pz = Math.floor(camera.position.z);
  for (let dx=-10;dx<=10;dx++){
    for (let dz=-10;dz<=10;dz++){
      for (let dy=-3;dy<=6;dy++){
        const x = px + dx, y = Math.floor(camera.position.y) + dy, z = pz + dz;
        const t = getBlock(x,y,z);
        if (t) {
          // create a bounding box mesh for ray intersection test
          const box = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial());
          box.position.set(x+0.5, y+0.5, z+0.5);
          box.updateMatrixWorld();
          near.push({mesh:box, x,y,z});
        }
      }
    }
  }
  const meshes = near.map(n=>n.mesh);
  const ints = ray.intersectObjects(meshes, false);
  if (!ints.length) return null;
  const it = ints[0];
  const idx = meshes.indexOf(it.object);
  const found = near[idx];
  const normal = it.face.normal.clone().applyQuaternion(it.object.quaternion);
  return { coords:{x:found.x,y:found.y,z:found.z}, normal };
}

// Mouse handlers
renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (!controls.isLocked) return;
  ev.preventDefault();
  if (ev.button === 0) { // left -> remove
    const target = getTarget();
    if (target) {
      const { x,y,z } = target.coords;
      setBlock(x,y,z,0);
      broadcastBlockChange(x,y,z,0);
    }
  } else if (ev.button === 2) { // right -> place adjacent
    const target = getTarget();
    if (target) {
      const nx = target.coords.x + Math.round(target.normal.x);
      const ny = target.coords.y + Math.round(target.normal.y);
      const nz = target.coords.z + Math.round(target.normal.z);
      if (getBlock(nx,ny,nz) === 0) {
        setBlock(nx,ny,nz, selectedBlockId);
        broadcastBlockChange(nx,ny,nz, selectedBlockId);
      }
    }
  }
});

// Hotbar UI (like before)
const hotbarEl = document.getElementById('hotbar');
const HOTBAR_SIZE = 9;
const slots = [];
let selectedSlot = 0;
let selectedBlockId = 1;
function buildHotbar(){
  hotbarEl.innerHTML = '';
  for (let i=0;i<HOTBAR_SIZE;i++){
    const el = document.createElement('div');
    el.className = 'slot' + (i===selectedSlot ? ' sel' : '');
    const tex = document.createElement('canvas');
    tex.width = 44; tex.height = 44;
    tex.className = 'tex';
    el.appendChild(tex);
    const num = document.createElement('div');
    num.style.position='absolute'; num.style.bottom='6px'; num.style.left='6px'; num.style.fontSize='12px'; num.style.opacity='0.9';
    num.textContent = (i+1);
    el.appendChild(num);
    hotbarEl.appendChild(el);
    slots.push({ el, tex });
  }
  updateHotbar();
}
function drawTexToCanvas(canvasEl, srcCanvas) {
  const ctx = canvasEl.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0,0, canvasEl.width, canvasEl.height);
  ctx.drawImage(srcCanvas, 0,0, canvasEl.width, canvasEl.height);
}
function updateHotbar(){
  for (let i=0;i<slots.length;i++){
    const slot = slots[i];
    slot.el.classList.toggle('sel', i===selectedSlot);
  }
  const ids = Object.keys(BLOCK_DEFS).map(n=>parseInt(n,10));
  selectedBlockId = ids[selectedSlot % ids.length] || 1;
  document.getElementById('info').textContent = `Selected: ${BLOCK_DEFS[selectedBlockId].name} (Slot ${selectedSlot+1})`;
  for (let i=0;i<slots.length;i++){
    const id = ids[i % ids.length];
    drawTexToCanvas(slots[i].tex, materialUserCanvas[id]);
  }
}
function selectSlot(idx){
  selectedSlot = (idx + HOTBAR_SIZE) % HOTBAR_SIZE;
  updateHotbar();
}
buildHotbar();
hotbarEl.addEventListener('pointerdown', (e) => {
  const rect = hotbarEl.getBoundingClientRect();
  const slotWidth = rect.width / HOTBAR_SIZE;
  const idx = Math.floor((e.clientX - rect.left) / slotWidth);
  if (idx>=0 && idx<HOTBAR_SIZE) selectSlot(idx);
});

// Save/load UI buttons
document.getElementById('saveBtn').addEventListener('click', () => { saveToLocal(); alert('Saved locally'); });
document.getElementById('loadBtn').addEventListener('click', () => { loadFromLocal(); alert('Loaded'); });
document.getElementById('exportBtn').addEventListener('click', exportWorld);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e) => {
  if (e.target.files.length) importWorldFile(e.target.files[0]);
});

// --- Multiplayer networking (WebSocket) ---

let ws = null;
let clientId = null;
let otherPlayers = new Map(); // id -> {pos,rot, lastUpdate, mesh}
const connStatus = document.getElementById('connStatus');
const serverUrlInput = document.getElementById('serverUrl');
const roomInput = document.getElementById('roomId');
document.getElementById('connectBtn').addEventListener('click', connectToServer);

function connectToServer(){
  const url = serverUrlInput.value.trim();
  const room = roomInput.value.trim() || 'default';
  try {
    ws = new WebSocket(url + `?room=${encodeURIComponent(room)}`);
  } catch (e) {
    alert('Invalid server URL');
    return;
  }
  ws.addEventListener('open', () => { connStatus.textContent = 'Connected'; });
  ws.addEventListener('close', () => { connStatus.textContent = 'Disconnected'; clientId = null; });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleServerMessage(msg);
    } catch(e) { console.error('Bad msg', e); }
  });
  ws.addEventListener('error', (e) => { connStatus.textContent = 'Error'; console.error(e); });
}

function send(msg){
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

// Broadcast helpers
let lastSentPosTime = 0;
function broadcastPlayerState(){
  if (!ws || ws.readyState !== WebSocket.OPEN || !clientId) return;
  const now = performance.now();
  if (now - lastSentPosTime < 50) return; // ~20Hz
  lastSentPosTime = now;
  send({ type:'player_update', id: clientId, pos: {x:camera.position.x,y:camera.position.y,z:camera.position.z}, rot: {x:camera.rotation.x,y:camera.rotation.y} });
}

function broadcastBlockChange(x,y,z,type){
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  send({ type:'block_change', x,y,z, block:type });
}

// server message handler
function handleServerMessage(msg){
  switch(msg.type){
    case 'welcome':
      clientId = msg.id;
      // apply world snapshot if provided
      if (msg.world) {
        // clear existing
        for (const k of Array.from(world.keys())) {
          const [x,y,z] = k.split(',').map(Number);
          setBlock(Number(x),Number(y),Number(z),0);
        }
        for (const b of msg.world) setBlock(b.x,b.y,b.z,b.type);
      }
      break;
    case 'player_state':
      handleRemotePlayer(msg);
      break;
    case 'player_disconnect':
      removeRemotePlayer(msg.id);
      break;
    case 'block_change':
      // apply authoritative block change
      setBlock(msg.x,msg.y,msg.z,msg.block);
      break;
    default:
      console.warn('unknown msg', msg);
  }
}

// other players visual (boxes)
function handleRemotePlayer(msg){
  if (msg.id === clientId) return;
  let ent = otherPlayers.get(msg.id);
  if (!ent) {
    const geom = new THREE.BoxGeometry(0.6,1.8,0.6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const m = new THREE.Mesh(geom, mat);
    scene.add(m);
    ent = { mesh: m, lastUpdate: performance.now() };
    otherPlayers.set(msg.id, ent);
  }
  ent.targetPos = new THREE.Vector3(msg.pos.x, msg.pos.y, msg.pos.z);
  ent.lastUpdate = performance.now();
}

function removeRemotePlayer(id){
  const ent = otherPlayers.get(id);
  if (!ent) return;
  scene.remove(ent.mesh);
  otherPlayers.delete(id);
}

// networking: send join immediately after connection opened
if (window.location.search.includes('autoconnect')) {
  setTimeout(connectToServer, 300);
}
if (ws && ws.readyState === WebSocket.OPEN && clientId == null) {
  send({ type:'join' });
}

// world snapshot sending is server responsibility (server sends welcome with snapshot)

// Animation loop
const clock = new THREE.Clock();
let dayTime = 0;
function animate(){
  const dt = clock.getDelta();
  handleMovement(dt);

  dayTime += dt * 0.02;
  if (dayTime > 1) dayTime -= 1;
  const angle = dayTime * Math.PI * 2;
  sun.position.set(Math.cos(angle)*100, Math.sin(angle)*200, 100);
  const intensity = Math.max(0.12, Math.sin(angle)*0.8 + 0.5);
  sun.intensity = intensity;
  const skyDay = new THREE.Color(0x87ceeb);
  const skyNight = new THREE.Color(0x081028);
  const bg = skyDay.clone().lerp(skyNight, Math.max(0, 1 - intensity));
  scene.background = bg;
  scene.fog.color = bg.clone();

  // move other players toward target
  for (const [id, ent] of otherPlayers.entries()){
    if (ent.targetPos) {
      ent.mesh.position.lerp(ent.targetPos, 0.2);
    }
  }

  broadcastPlayerState();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// periodic hotbar refresh (texture canvas)
setInterval(() => {
  for (let i=0;i<slots.length;i++){
    const ids = Object.keys(BLOCK_DEFS).map(n=>parseInt(n,10));
    const id = ids[i % ids.length];
    drawTexToCanvas(slots[i].tex, materialUserCanvas[id]);
  }
}, 500);

// export helper: when a world chunk changes heavily, consider serializing to server (optional)
