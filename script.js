/* Shadow Clone Escape — Polished Mobile + Desktop build
   - Random solvable mazes (recursive backtracker)
   - Smooth movement, clones, power-ups, mini-map, mobile controls, local leaderboard
   - Drop into repo as script.js (replace prior file)
*/

/* ------------------- DOM & audio ------------------- */
const gameCanvas = document.getElementById('gameCanvas');
const miniMap = document.getElementById('miniMap');
const ctx = gameCanvas.getContext('2d');
const miniCtx = miniMap.getContext('2d');

const startBtn = document.getElementById('startBtn');
const tutorialBtn = document.getElementById('tutorialBtn');
const settingsBtn = document.getElementById('settingsBtn');
const restartBtn = document.getElementById('restartBtn');
const menuBtnHeader = document.getElementById('menuBtnHeader');
const menuBtn = document.querySelector('#menuBtn') || document.getElementById('menuBtnHeader');
const tutorialBox = document.getElementById('tutorial');
const settingsBox = document.getElementById('settings');
const musicToggleEl = document.getElementById('musicToggle');
const sfxToggleEl = document.getElementById('sfxToggle');
const difficultyEl = document.getElementById('difficulty');
const bestRecordText = document.getElementById('bestRecordText');
const statusText = document.getElementById('status');
const timerText = document.getElementById('timer');
const powerupBox = document.getElementById('powerupBox');
const mobileControls = document.getElementById('mobileControls');
const dpad = document.getElementById('dpad');
const leaderboardList = document.getElementById('leaderboardList');
const clearLeaderboardBtn = document.getElementById('clearLeaderboard');

const bgMusic = document.getElementById('bgMusic');
const spawnSfx = document.getElementById('spawnSfx');
const deathSfx = document.getElementById('deathSfx');
const pickupSfx = document.getElementById('pickupSfx');
const newRecordSfx = document.getElementById('newRecordSfx');

/* ------------------- Responsive canvas sizing ------------------- */
function resizeCanvasToContainer() {
  // maintain aspect ratio close to 4:3; maximum width 960
  const maxW = Math.min(window.innerWidth - 40, 960);
  const maxH = Math.min(window.innerHeight - 160, 720);
  const width = Math.min(maxW, maxH * (4/3));
  gameCanvas.style.width = width + 'px';
  // set real drawing buffer to device pixels for clarity
  const ratio = window.devicePixelRatio || 1;
  const logicalW = Math.floor(width);
  const logicalH = Math.floor(logicalW * (3/4));
  gameCanvas.width = Math.floor(logicalW * ratio);
  gameCanvas.height = Math.floor(logicalH * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);

  // mini-map size
  miniMap.width = 280 * (window.devicePixelRatio || 1);
  miniMap.height = 180 * (window.devicePixelRatio || 1);
  miniMap.style.width = '140px';
  miniMap.style.height = '90px';
  miniCtx.setTransform(window.devicePixelRatio || 1,0,0,window.devicePixelRatio || 1,0,0);
}
window.addEventListener('resize', resizeCanvasToContainer);

/* ------------------- Game grid parameters (tile size dynamic) ------------------- */
let tileSize = 28; // in CSS pixels for drawing grid
let cols, rows;

// compute grid size from canvas pixel size
function recomputeGrid(){
  const cssW = gameCanvas.clientWidth;
  const cssH = gameCanvas.clientHeight;
  // target tile so grid fits nicely: prefer 20-28 tiles wide depending on device
  const preferredTile = window.innerWidth < 720 ? 28 : 30;
  cols = Math.floor(cssW / preferredTile);
  rows = Math.floor(cssH / preferredTile);
  if(cols % 2 === 0) cols--;
  if(rows % 2 === 0) rows--;
  tileSize = Math.floor(Math.min(cssW/cols, cssH/rows));
}
function resetCanvasAndGrid(){
  resizeCanvasToContainer();
  recomputeGrid();
  // adjust drawing scale transforms (we set earlier)
}

/* ------------------- Storage keys ------------------- */
const STORAGE_KEY = 'shadow_clone_best';
const LEADER_KEY = 'shadow_clone_leaderboard';
const SETTINGS_KEY = 'shadow_clone_settings';

/* ------------------- Game State ------------------- */
let maze = [];
let player, movesHistory, clones, powerups, particles;
let frameCount = 0, cloneInterval = 300, running = false, startTime = 0;
let SETTINGS = { music: true, sfx: true, difficulty: 1 };
let bestTime = 0;

/* ------------------- Helpers ------------------- */
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function nowSec(){ return Math.floor((Date.now() - startTime)/1000); }

/* ------------------- Maze generation (recursive backtracker) ------------------- */
function generateMaze(c, r){
  // initialize full walls
  const grid = Array.from({length:r}, ()=> Array(c).fill(1));
  function carve(x,y){
    grid[y][x] = 0;
    const dirs = shuffle([[2,0],[-2,0],[0,2],[0,-2]]);
    for(const [dx,dy] of dirs){
      const nx = x+dx, ny = y+dy;
      if(nx>0 && nx<c-1 && ny>0 && ny<r-1 && grid[ny][nx]===1){
        grid[y+dy/2][x+dx/2] = 0;
        carve(nx,ny);
      }
    }
  }
  carve(1,1);
  // ensure tiny safe area
  if(grid[1]){ grid[1][1]=0; if(grid[1][2]!==undefined) grid[1][2]=0; }
  if(grid[2]) grid[2][1]=0;
  return grid;
}

/* ------------------- Game initialization & reset ------------------- */
function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if(s){ SETTINGS = {...SETTINGS, ...s}; }
  }catch(e){}
  if(musicToggleEl) musicToggleEl.checked = SETTINGS.music;
  if(sfxToggleEl) sfxToggleEl.checked = SETTINGS.sfx;
  if(difficultyEl) difficultyEl.value = SETTINGS.difficulty;
}
function saveSettings(){
  if(musicToggleEl) SETTINGS.music = musicToggleEl.checked;
  if(sfxToggleEl) SETTINGS.sfx = sfxToggleEl.checked;
  if(difficultyEl) SETTINGS.difficulty = Number(difficultyEl.value);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
}

function resetGame(){
  saveSettings();
  resetCanvasAndGrid();
  maze = generateMaze(cols, rows);
  // ensure player placed at 1,1 or nearest open tile
  player = { x:1, y:1, rx:1, ry:1, radius: tileSize*0.36, color:'lime', speedBase: (6 + SETTINGS.difficulty*2) };
  movesHistory = [];
  clones = [];
  powerups = [];
  particles = [];
  frameCount = 0;
  // clone interval lower on harder difficulty
  cloneInterval = 280 - SETTINGS.difficulty*80;
  if(cloneInterval < 60) cloneInterval = 60;
  running = true;
  startTime = Date.now();
  bestTime = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  bestRecordText.textContent = bestTime ? `Best: ${bestTime}s` : 'Best: —';
  statusText.textContent = 'Survive as long as you can';
  timerText.textContent = 'Time: 0s';
  restartBtn.style.display = 'none';
  menuBtn.style.display = 'none';
  // adjust mini-map buffers if needed
}

/* ------------------- Leaderboard (local) ------------------- */
function getLeaderboard(){ return JSON.parse(localStorage.getItem(LEADER_KEY) || '[]'); }
function setLeaderboard(arr){ localStorage.setItem(LEADER_KEY, JSON.stringify(arr)); }
function updateLeaderboardUI(){
  const list = getLeaderboard();
  leaderboardList.innerHTML = '';
  list.slice(0,10).forEach(item=>{
    const li = document.createElement('li');
    li.textContent = `${item.name} — ${item.time}s`;
    leaderboardList.appendChild(li);
  });
}
function tryAddToLeaderboard(time){
  const list = getLeaderboard();
  // ask for name
  let name = prompt('NEW TOP SCORE! Enter your name (max 12 chars):', 'Player') || 'Player';
  name = name.slice(0,12);
  list.push({ name, time });
  list.sort((a,b)=> b.time - a.time);
  setLeaderboard(list.slice(0,50));
  updateLeaderboardUI();
}

/* ------------------- Powerups ------------------- */
const POWER_TYPES = ['speed','cloak','freeze'];
function spawnPowerup(){
  let attempts = 0;
  while(attempts++ < 200){
    const x = randInt(1, cols-2), y = randInt(1, rows-2);
    if(maze[y][x] === 0 && !(x===player.x && y===player.y) && !powerups.some(p=>p.x===x&&p.y===y)){
      powerups.push({ x, y, type: POWER_TYPES[randInt(0, POWER_TYPES.length-1)], spawnedAt: Date.now()});
      break;
    }
  }
}
let activePower = null;
function applyPowerup(type){
  if(type === 'speed'){
    activePower = { type:'speed', until: Date.now() + 6000 };
  } else if(type === 'cloak'){
    activePower = { type:'cloak', until: Date.now() + 6000 };
  } else if(type === 'freeze'){
    activePower = { type:'freeze', until: Date.now() + 4000 };
    clones.forEach(c => c.frozen = true);
    setTimeout(()=> clones.forEach(c=>c.frozen=false), 4000);
  }
  if(SETTINGS.sfx) try{ pickupSfx.currentTime = 0; pickupSfx.play(); }catch(e){}
}

/* ------------------- Clone class ------------------- */
class Clone {
  constructor(path, type='basic'){
    this.path = path.slice();
    this.index = 0;
    this.type = type;
    this.x = this.path[0]?.x ?? 1;
    this.y = this.path[0]?.y ?? 1;
    this.color = (type === 'wraith') ? 'magenta' : 'crimson';
    this.spawnFrame = frameCount;
    this.frozen = false;
  }
  update(){
    if(this.frozen) return;
    if(this.type === 'wraith'){
      // occasional teleport forward
      if(Math.random() < 0.006 + Math.min(0.05, frameCount/40000)){
        const jump = Math.min(40, Math.floor(Math.random() * Math.min(200, this.path.length)));
        this.index = Math.min(this.path.length - 1, this.index + jump);
      }
    }
    if(this.index < this.path.length){
      this.x = this.path[this.index].x;
      this.y = this.path[this.index].y;
      this.index++;
    }
  }
  draw(ctx){
    const age = frameCount - this.spawnFrame;
    const pulse = 0.6 + Math.sin(age/12) * 0.2;
    ctx.globalAlpha = Math.max(0.35, Math.min(1, pulse));
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x * tileSize + 1, this.y * tileSize + 1, tileSize - 2, tileSize - 2);
    ctx.globalAlpha = 1;
  }
}

/* ------------------- Particles ------------------- */
const particlesArr = [];
function spawnParticles(px,py,color){
  for(let i=0;i<20;i++){
    particlesArr.push({
      x:px + (Math.random()-0.5)*tileSize,
      y:py + (Math.random()-0.5)*tileSize,
      vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, life:40 + Math.random()*30, color
    });
  }
}
function updateParticles(){
  for(let i=particlesArr.length-1;i>=0;i--){
    const p = particlesArr[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.995; p.vy *= 0.995; p.life--;
    if(p.life <= 0) particlesArr.splice(i,1);
  }
}
function drawParticles(ctx){
  for(const p of particlesArr){
    ctx.globalAlpha = Math.max(0, p.life / 70);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

/* ------------------- Movement & input ------------------- */
let activeDirs = { up:false, down:false, left:false, right:false };
function stepPlayerFromInput(){
  // tile-based movement: prefer last pressed direction priority: up/down/left/right
  let nx = player.x, ny = player.y;
  if(activeDirs.up) ny--;
  else if(activeDirs.down) ny++;
  else if(activeDirs.left) nx--;
  else if(activeDirs.right) nx++;
  if(nx >=0 && nx < cols && ny >=0 && ny < rows && maze[ny][nx] === 0){
    player.x = nx; player.y = ny;
    movesHistory.push({ x: nx, y: ny });
    // pickup check
    for(let i=powerups.length-1;i>=0;i--){
      if(powerups[i].x === nx && powerups[i].y === ny){
        applyPowerup(powerups[i].type);
        powerups.splice(i,1);
      }
    }
  }
}

document.addEventListener('keydown', (e)=>{
  if(!running) return;
  if(e.key === 'ArrowUp' || e.key === 'w'){ activeDirs.up = true; stepPlayerFromInput(); }
  if(e.key === 'ArrowDown' || e.key === 's'){ activeDirs.down = true; stepPlayerFromInput(); }
  if(e.key === 'ArrowLeft' || e.key === 'a'){ activeDirs.left = true; stepPlayerFromInput(); }
  if(e.key === 'ArrowRight' || e.key === 'd'){ activeDirs.right = true; stepPlayerFromInput(); }
});
document.addEventListener('keyup', (e)=>{
  if(e.key === 'ArrowUp' || e.key === 'w'){ activeDirs.up = false; }
  if(e.key === 'ArrowDown' || e.key === 's'){ activeDirs.down = false; }
  if(e.key === 'ArrowLeft' || e.key === 'a'){ activeDirs.left = false; }
  if(e.key === 'ArrowRight' || e.key === 'd'){ activeDirs.right = false; }
});

/* ------------------- Mobile D-Pad events ------------------- */
dpad?.addEventListener('pointerdown', (ev)=>{
  const btn = ev.target.closest('button[data-dir]');
  if(btn){
    const dir = btn.dataset.dir;
    triggerDir(dir);
    btn.setPointerCapture(ev.pointerId);
  }
});
dpad?.addEventListener('pointerup', (ev)=>{
  const btn = ev.target.closest('button[data-dir]');
  if(btn){
    releaseDir(btn.dataset.dir);
  }
});
function triggerDir(dir){
  if(dir === 'up') activeDirs.up = true;
  if(dir === 'down') activeDirs.down = true;
  if(dir === 'left') activeDirs.left = true;
  if(dir === 'right') activeDirs.right = true;
  stepPlayerFromInput();
}
function releaseDir(dir){
  if(dir === 'up') activeDirs.up = false;
  if(dir === 'down') activeDirs.down = false;
  if(dir === 'left') activeDirs.left = false;
  if(dir === 'right') activeDirs.right = false;
}

/* ------------------- Clone spawn & game logic ------------------- */
function spawnClone(){
  if(movesHistory.length < 4) return;
  const len = Math.min(800, movesHistory.length);
  const snap = movesHistory.slice(Math.max(0, movesHistory.length - len));
  const type = Math.random() < 0.12 + Math.min(0.2, frameCount/5000) ? 'wraith' : 'basic';
  const c = new Clone(snap, type);
  clones.push(c);
  if(SETTINGS.sfx) try{ spawnSfx.currentTime = 0; spawnSfx.play(); } catch(e){}
  spawnParticles(c.x*tileSize + tileSize/2, c.y*tileSize + tileSize/2, '#ff4466');
}

/* ------------------- Game over & scoring ------------------- */
function gameOver(){
  running = false;
  try{ if(SETTINGS.music) bgMusic.pause(); }catch(e){}
  if(SETTINGS.sfx) try{ deathSfx.currentTime=0; deathSfx.play(); }catch(e){}
  const elapsed = nowSec();
  const prevBest = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  if(elapsed > prevBest){
    localStorage.setItem(STORAGE_KEY, elapsed);
    try{ if(SETTINGS.sfx) { newRecordSfx.currentTime=0; newRecordSfx.play(); } }catch(e){}
    statusText.textContent = `☠️ You survived ${elapsed}s — NEW RECORD!`;
    // add to leaderboard
    tryAddToLeaderboard(elapsed);
  } else {
    statusText.textContent = `☠️ You survived ${elapsed}s (Best: ${prevBest}s)`;
  }
  spawnParticles(player.rx*tileSize + tileSize/2, player.ry*tileSize + tileSize/2, '#ffcc66');
  restartBtn.style.display = 'inline-block';
  menuBtn.style.display = 'inline-block';
}

/* ------------------- Draw functions ------------------- */
function drawMaze(){
  const w = gameCanvas.clientWidth;
  const h = gameCanvas.clientHeight;
  // draw cells
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      if(maze[y][x] === 1){
        ctx.fillStyle = '#2e2e2e';
        ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x*tileSize+1, y*tileSize+1, tileSize-2, tileSize-2);
      } else {
        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
      }
    }
  }
}

function drawPowerups(){
  for(const pu of powerups){
    const cx = pu.x*tileSize + tileSize/2;
    const cy = pu.y*tileSize + tileSize/2;
    ctx.save();
    if(pu.type === 'speed'){
      ctx.fillStyle = '#4fd1ff';
      ctx.beginPath(); ctx.arc(cx, cy, tileSize*0.28, 0, Math.PI*2); ctx.fill();
    } else if(pu.type === 'cloak'){
      ctx.fillStyle = '#9be7b0'; ctx.fillRect(pu.x*tileSize+4, pu.y*tileSize+4, tileSize-8, tileSize-8);
    } else if(pu.type === 'freeze'){
      ctx.fillStyle = '#bfe8ff';
      ctx.beginPath(); ctx.moveTo(cx, cy - tileSize*0.22); ctx.lineTo(cx + tileSize*0.16, cy); ctx.lineTo(cx - tileSize*0.16, cy); ctx.fill();
    }
    ctx.restore();
  }
}

function drawMiniMap(){
  // mini map scales whole maze into mini canvas
  const mmW = miniMap.width / (window.devicePixelRatio || 1);
  const mmH = miniMap.height / (window.devicePixelRatio || 1);
  miniCtx.clearRect(0,0,mmW,mmH);
  const cellW = mmW / cols, cellH = mmH / rows;
  // draw maze
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      if(maze[y][x] === 1) miniCtx.fillStyle = '#222'; else miniCtx.fillStyle = '#0b0b0b';
      miniCtx.fillRect(x*cellW, y*cellH, cellW, cellH);
    }
  }
  // draw clones (small dots)
  for(const c of clones){
    miniCtx.fillStyle = c.type === 'wraith' ? '#ff66ff' : '#ff6666';
    miniCtx.fillRect(c.x*cellW, c.y*cellH, Math.max(1, cellW*0.9), Math.max(1, cellH*0.9));
  }
  // draw player
  miniCtx.fillStyle = '#66ff99';
  miniCtx.fillRect(player.x*cellW, player.y*cellH, Math.max(1, cellW*0.9), Math.max(1, cellH*0.9));
  // draw powerups
  for(const pu of powerups){
    miniCtx.fillStyle = pu.type === 'speed' ? '#4fd1ff' : (pu.type==='cloak' ? '#9be7b0' : '#bfe8ff');
    miniCtx.fillRect(pu.x*cellW + cellW*0.2, pu.y*cellH + cellH*0.2, cellW*0.6, cellH*0.6);
  }
}

/* ------------------- HUD update ------------------- */
function updateHUD(){
  const elapsed = nowSec();
  timerText.textContent = `Time: ${elapsed}s`;
  if(activePower && Date.now() < activePower.until){
    const rem = Math.ceil((activePower.until - Date.now()) / 1000);
    powerupBox.innerHTML = `<b>${activePower.type.toUpperCase()}</b> ${rem}s`;
  } else {
    if(activePower && Date.now() >= activePower.until){
      // expire speed effect
      if(activePower.type === 'speed') {}
      activePower = null;
    }
    powerupBox.innerHTML = '';
  }
}

/* ------------------- Main loop ------------------- */
let lastFrame = performance.now();
function animate(now){
  if(!running) return;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  frameCount++;

  // occasionally spawn powerups
  if(frameCount % 600 === 0 && Math.random() < 0.9) spawnPowerup();

  // clone spawning
  if(frameCount % Math.max(12, Math.floor(cloneInterval / (1 + SETTINGS.difficulty * 0.6))) === 0 && movesHistory.length > 8){
    spawnClone();
    if(cloneInterval > 40) cloneInterval -= 1 + SETTINGS.difficulty;
    if(Math.random() < 0.02 + SETTINGS.difficulty * 0.03) spawnClone();
  }

  // update clones
  for(let i = clones.length-1; i>=0; i--){
    const c = clones[i];
    c.update();
    if(Math.round(c.x) === player.x && Math.round(c.y) === player.y){
      // check cloak
      if(!(activePower && activePower.type === 'cloak' && Date.now() < activePower.until)){
        gameOver();
        return;
      }
    }
  }

  // particles
  updateParticles();

  // draw everything
  ctx.clearRect(0,0,gameCanvas.width, gameCanvas.height);
  drawMaze();
  drawPowerups();
  // draw clones
  for(const c of clones) c.draw(ctx);

  // smooth render of player
  // lerp
  const speed = 12 + SETTINGS.difficulty * 6;
  const t = Math.min(1, dt * speed);
  player.rx = player.rx === undefined ? player.x : (player.rx + (player.x - player.rx) * t);
  player.ry = player.ry === undefined ? player.y : (player.ry + (player.y - player.ry) * t);

  // draw trail
  for(let i = Math.max(0, movesHistory.length - 28); i < movesHistory.length; i++){
    const m = movesHistory[i];
    const alpha = (i - Math.max(0, movesHistory.length - 28)) / 28;
    ctx.globalAlpha = 0.05 + alpha * 0.25;
    ctx.fillStyle = '#33ff77';
    ctx.fillRect(m.x*tileSize + tileSize*0.28, m.y*tileSize + tileSize*0.28, tileSize*0.44, tileSize*0.44);
  }
  ctx.globalAlpha = 1;

  // draw player
  ctx.beginPath();
  const px = player.rx * tileSize + tileSize/2;
  const py = player.ry * tileSize + tileSize/2;
  ctx.fillStyle = player.color;
  ctx.arc(px, py, player.radius, 0, Math.PI*2);
  ctx.fill();

  // draw particles
  drawParticles(ctx);

  // draw minimap
  drawMiniMap();

  // HUD
  updateHUD();

  requestAnimationFrame(animate);
}

/* ------------------- Public UI handlers ------------------- */
startBtn.addEventListener('click', ()=>{
  saveSettings();
  // hide menu and show canvas + mobile controls on small screens
  document.getElementById('menu').style.display = 'none';
  tutorialBox.style.display = 'none';
  settingsBox.style.display = 'none';
  document.getElementById('ui').classList.remove('panel-hidden');
  resizeCanvasToContainer();
  recomputeGrid();
  resetGame();
  if(SETTINGS.music) try{ bgMusic.currentTime = 0; bgMusic.volume = 0.55; bgMusic.play(); }catch(e){}
  // show mobile controls if small screen
  if(window.innerWidth <= 720){ mobileControls.classList.remove('hidden'); }
  lastFrame = performance.now();
  requestAnimationFrame(animate);
});

tutorialBtn.addEventListener('click', ()=>{ tutorialBox.style.display = tutorialBox.style.display === 'none' ? 'block' : 'none'; });
settingsBtn.addEventListener('click', ()=>{ settingsBox.style.display = settingsBox.style.display === 'none' ? 'block' : 'none'; });
menuBtnHeader.addEventListener('click', ()=>{ document.getElementById('menu').style.display = 'block'; tutorialBox.style.display = 'block'; });
restartBtn.addEventListener('click', ()=>{ resetGame(); if(SETTINGS.music) try{ bgMusic.currentTime = 0; bgMusic.play(); }catch(e){} lastFrame = performance.now(); requestAnimationFrame(animate); });
if(menuBtn) menuBtn.addEventListener('click', ()=>{ running = false; document.getElementById('menu').style.display = 'block'; document.getElementById('ui').classList.add('panel-hidden'); mobileControls.classList.add('hidden'); try{ bgMusic.pause(); }catch(e){} });

musicToggleEl?.addEventListener('change', ()=>{ saveSettings(); if(!musicToggleEl.checked) try{ bgMusic.pause(); }catch(e){} });
sfxToggleEl?.addEventListener('change', ()=>{ saveSettings(); });
difficultyEl?.addEventListener('input', ()=> saveSettings());

clearLeaderboardBtn?.addEventListener('click', ()=>{
  if(confirm('Clear local leaderboard?')){ localStorage.removeItem(LEADER_KEY); updateLeaderboardUI(); }
});

/* ------------------- Leaderboard load & UI ------------------- */
function initLeaderboard(){ updateLeaderboardUI(); }
updateLeaderboardUI();

/* ------------------- Interaction: click to use power (mobile "Power" button) ------------------- */
const btnPower = document.getElementById('btnPower');
btnPower?.addEventListener('click', ()=>{
  if(activePower && Date.now() < activePower.until) return; // already active
  // use pickup-like: if have powerups nearby, pick; else, trigger cloak if available
  // For simplicity: Trigger cloak if have none active
  applyPowerup('cloak');
});

/* ------------------- Spawn clones & powerups pacing & collision checks ------------------- */
let lastStepTick = 0;
function tickStep(){
  if(!running) return;
  // step player automatically based on directional inputs if any, at a paced tick (avoid ultra fast repeats)
  const now = performance.now();
  if(now - lastStepTick > 140){ // tile-step every 140ms while pressing direction
    if(activeDirs.up || activeDirs.down || activeDirs.left || activeDirs.right){
      stepPlayerFromInput();
    }
    lastStepTick = now;
  }
  requestAnimationFrame(tickStep);
}
tickStep();

/* ------------------- Startup: adjust canvas + settings ------------------- */
resizeCanvasToContainer();
recomputeGrid();
loadSettings();
initLeaderboard();

/* ------------------- Expose some debugging functions (optional) ------------------- */
window.__game = {
  resetGame,
  spawnPowerup,
  spawnClone,
  getLeaderboard: getLeaderboard,
  setDifficulty: (v)=> { difficultyEl.value = v; saveSettings(); }
};
