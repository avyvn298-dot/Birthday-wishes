/* Shadow Clone Escape — Complete build
   - Random solvable mazes (recursive backtracker)
   - Smooth movement, clones, power-ups, settings, SFX & music
   Drop into repo as script.js
*/

//// DOM & audio
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const tutorialBtn = document.getElementById('tutorialBtn');
const settingsBtn = document.getElementById('settingsBtn');
const restartBtn = document.getElementById('restartBtn');
const menuBtn = document.getElementById('menuBtn');
const tutorial = document.getElementById('tutorial');
const settings = document.getElementById('settings');
const musicToggle = document.getElementById('musicToggle') || document.createElement('input'); // may be created later
const difficultyInput = document.getElementById('difficulty');
const menu = document.getElementById('menu');
const ui = document.getElementById('ui');
const statusText = document.getElementById('status');
const timerText = document.getElementById('timer');
const powerupBox = document.getElementById('powerupBox');
const bestRecordText = document.getElementById('bestRecordText');

const bgMusic = document.getElementById('bgMusic');
const spawnSfx = document.getElementById('spawnSfx');
const deathSfx = document.getElementById('deathSfx');
const pickupSfx = document.getElementById('pickupSfx');
const newRecordSfx = document.getElementById('newRecordSfx');

/* Settings defaults */
let SETTINGS = {
  music: true,
  sfx: true,
  difficulty: 1 // 0 easy,1 normal,2 hard
};

const STORAGE_KEY = 'shadow_clone_best';
const SETTINGS_KEY = 'shadow_clone_settings';

//// canvas grid
const tileSize = 30;
let cols = Math.floor(canvas.width / tileSize);
let rows = Math.floor(canvas.height / tileSize);
if (cols % 2 === 0) cols--;
if (rows % 2 === 0) rows--;

//// game state
let maze = [];
let player, target, movesHistory, clones, powerups;
let frameCount = 0;
let cloneInterval = 300;
let running = false;
let startTime = 0;
let bestTime = 0;

/* load settings & bind UI elements that may be created in HTML */
(function initSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) SETTINGS = {...SETTINGS,...s};
  } catch(e){}
  // locate toggles inside settings panel now
  if (!document.getElementById('musicToggle')) {
    // create toggles if not in markup
    const musicLabel = document.createElement('label');
    musicLabel.innerHTML = `<input type="checkbox" id="musicToggle"> Music`;
    const sfxLabel = document.createElement('label');
    sfxLabel.innerHTML = `<input type="checkbox" id="sfxToggle"> SFX`;
    const diffLabel = document.createElement('label');
    diffLabel.innerHTML = `Difficulty: <input id="difficulty" type="range" min="0" max="2" step="1" value="${SETTINGS.difficulty}">`;
    settings.appendChild(musicLabel);
    settings.appendChild(document.createElement('br'));
    settings.appendChild(sfxLabel);
    settings.appendChild(document.createElement('br'));
    settings.appendChild(diffLabel);
  }
  document.getElementById('musicToggle').checked = SETTINGS.music;
  document.getElementById('sfxToggle').checked = SETTINGS.sfx;
  document.getElementById('difficulty').value = SETTINGS.difficulty;
})();

/* save settings */
function saveSettings(){
  SETTINGS.music = document.getElementById('musicToggle').checked;
  SETTINGS.sfx = document.getElementById('sfxToggle').checked;
  SETTINGS.difficulty = Number(document.getElementById('difficulty').value);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
}

/* utility */
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

/* Maze generator (recursive backtracker). grid: 1=wall,0=passage */
function generateMaze(c,r){
  const grid = Array.from({length:r},()=>Array(c).fill(1));
  function carve(x,y){
    grid[y][x]=0;
    const dirs = shuffle([[2,0],[-2,0],[0,2],[0,-2]]);
    for(const [dx,dy] of dirs){
      const nx=x+dx, ny=y+dy;
      if(nx>0 && nx<c-1 && ny>0 && ny<r-1 && grid[ny][nx]===1){
        grid[y+dy/2][x+dx/2]=0;
        carve(nx,ny);
      }
    }
  }
  carve(1,1);
  // clear small safe area
  grid[1][1]=0; grid[1][2]=0; grid[2][1]=0;
  return grid;
}

/* Game reset */
function resetGame() {
  saveSettings();
  maze = generateMaze(cols,rows);
  player = {x:1, y:1, rx:1, ry:1, // rx/ry = rendered (smooth) pos in tiles (floats)
            speed: 6 + SETTINGS.difficulty*2, // movement speed in tiles per second baseline (not used for stepping but for tween speed)
            color:'lime', radius: tileSize*0.4};
  movesHistory = [];
  clones = [];
  powerups = [];
  frameCount = 0;
  // initial clone interval depends on difficulty
  cloneInterval = 280 - SETTINGS.difficulty*80;
  if (cloneInterval < 80) cloneInterval = 80;
  running = true;
  startTime = Date.now();
  bestTime = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  bestRecordText.textContent = bestTime ? `Best: ${bestTime}s` : `Best: —`;
  statusText.textContent = 'Survive as long as you can';
  timerText.textContent = 'Time: 0s';
  restartBtn.style.display = 'none';
  menuBtn.style.display = 'none';
  // small safety: ensure player on open tile
  if (maze[player.y][player.x]===1){
    player.x = 1; player.y = 1;
  }
  // set rendered position
  player.rx = player.x; player.ry = player.y;
}

/* powerup spawn & effects */
const POWER_TYPES = ['speed','cloak','freeze'];
function spawnPowerup(){
  // find a random empty tile far from player
  let attempts=0;
  while(attempts<200){
    const x = randInt(1, cols-2);
    const y = randInt(1, rows-2);
    attempts++;
    if (maze[y][x]===0 && !(x===player.x && y===player.y)){
      // don't spawn on clone positions or other powerups
      if(powerups.some(p=>p.x===x&&p.y===y)) continue;
      powerups.push({x,y,type:POWER_TYPES[randInt(0,POWER_TYPES.length-1)],timer: Date.now()});
      break;
    }
  }
}

/* clone types */
class Clone {
  constructor(path, type='basic'){
    this.path = path.slice(); // snapshot
    this.index = 0;
    this.type = type; // basic or wraith
    this.x = this.path[0]?.x ?? 1;
    this.y = this.path[0]?.y ?? 1;
    this.color = (type==='wraith') ? 'magenta' : 'crimson';
    this.spawnFrame = frameCount;
    this.teleportCooldown = 0;
  }
  update(){
    if(this.type==='wraith'){
      // wraith moves faster and sometimes teleports forward
      if (Math.random() < 0.006 + Math.min(0.04, frameCount/50000)){
        // teleport ahead in path
        const jump = Math.min(40, Math.floor(Math.random()*Math.min(200,this.path.length)));
        this.index = Math.min(this.path.length-1, this.index + jump);
      }
    }
    if(this.index < this.path.length){
      this.x = this.path[this.index].x;
      this.y = this.path[this.index].y;
      this.index++;
    }
  }
  draw(){
    const age = frameCount - this.spawnFrame;
    const pulse = 0.6 + Math.sin(age/12)*0.2;
    ctx.globalAlpha = Math.max(0.35, Math.min(1, pulse));
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x * tileSize + 1, this.y * tileSize + 1, tileSize-2, tileSize-2);
    ctx.globalAlpha = 1;
  }
}

/* particles for death */
const particles = [];
function spawnParticles(px,py,color){
  for(let i=0;i<24;i++){
    particles.push({
      x: px + (Math.random()-0.5)*tileSize,
      y: py + (Math.random()-0.5)*tileSize,
      vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, life: 40 + Math.random()*30, color
    });
  }
}
function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.06; p.life--;
    p.vx *= 0.99; p.vy *= 0.99;
    if(p.life<=0) particles.splice(i,1);
  }
}
function drawParticles(){
  for(const p of particles){
    ctx.globalAlpha = Math.max(0, p.life/70);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3,3);
    ctx.globalAlpha = 1;
  }
}

/* smooth tween utility (lerp) */
function lerp(a,b,t){ return a + (b-a)*t; }

/* movement smoothing: player.rx/ry moves toward player.x/player.y */
function updateRenderPosition(dt){
  const speed = 12 + SETTINGS.difficulty*6; // tile per second smoothing factor
  // fraction to move this frame
  const t = Math.min(1, dt * speed);
  player.rx = lerp(player.rx, player.x, t);
  player.ry = lerp(player.ry, player.y, t);
}

/* input handling (tile steps) */
document.addEventListener('keydown', (e)=>{
  if(!running) return;
  let nx = player.x, ny = player.y;
  if (e.key === 'ArrowUp' || e.key==='w') ny--;
  if (e.key === 'ArrowDown' || e.key==='s') ny++;
  if (e.key === 'ArrowLeft' || e.key==='a') nx--;
  if (e.key === 'ArrowRight' || e.key==='d') nx++;
  if (nx>=0 && nx<cols && ny>=0 && ny<rows && maze[ny][nx]===0){
    player.x = nx; player.y = ny;
    // record
    movesHistory.push({x:nx,y:ny});
    // check pickup
    for(let i=powerups.length-1;i>=0;i--){
      const pu = powerups[i];
      if(pu.x===nx&&pu.y===ny){
        applyPowerup(pu.type);
        powerups.splice(i,1);
        if(SETTINGS.sfx){ try{ pickupSfx.currentTime=0; pickupSfx.play(); }catch(e){} }
      }
    }
  }
});

/* powerup effects */
let activePower = null;
function applyPowerup(type){
  if(type==='speed'){
    activePower = {type:'speed',until:Date.now()+6000};
    player.speed += 4;
  } else if(type==='cloak'){
    activePower = {type:'cloak',until:Date.now()+6000};
  } else if(type==='freeze'){
    activePower = {type:'freeze',until:Date.now()+4000};
    // freeze clones by setting a freeze flag
    clones.forEach(c => c.frozen = true);
    setTimeout(()=>{ clones.forEach(c=>c.frozen=false); }, 4000);
  }
}

/* spawn clone snapshot */
function spawnClone(){
  if(movesHistory.length < 4) return;
  const len = Math.min(800, movesHistory.length);
  const snap = movesHistory.slice(Math.max(0, movesHistory.length - len));
  const type = Math.random() < 0.12 + Math.min(0.2, frameCount/5000) ? 'wraith' : 'basic';
  const c = new Clone(snap, type);
  clones.push(c);
  if(SETTINGS.sfx){ try{ spawnSfx.currentTime=0; spawnSfx.play(); }catch(e){} }
  // animate spawn with particles
  spawnParticles(c.x*tileSize + tileSize/2, c.y*tileSize + tileSize/2, '#ff4466');
}

/* game over */
function gameOver(){
  running = false;
  try{ bgMusic.pause(); }catch(e){}
  if(SETTINGS.sfx){ try{ deathSfx.currentTime=0; deathSfx.play(); }catch(e){} }
  const elapsed = Math.floor((Date.now() - startTime)/1000);
  const prevBest = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  if(elapsed > prevBest){
    localStorage.setItem(STORAGE_KEY, elapsed);
    bestRecordText.textContent = `Best: ${elapsed}s`;
    statusText.textContent = `☠️ You survived ${elapsed}s — NEW RECORD!`;
    if(SETTINGS.sfx){ try{ newRecordSfx.currentTime=0; newRecordSfx.play(); }catch(e){} }
  } else {
    statusText.textContent = `☠️ You survived ${elapsed}s (Best: ${prevBest}s)`;
  }
  // particle big explosion where player was
  spawnParticles(player.rx*tileSize + tileSize/2, player.ry*tileSize + tileSize/2, '#ffcc66');
  restartBtn.style.display = 'inline-block';
  menuBtn.style.display = 'inline-block';
}

/* draw maze */
function drawMaze(){
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const v = maze[y][x];
      if(v===1){
        ctx.fillStyle = '#2f2f2f';
        ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
        // subtle inner shadow
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x*tileSize+2, y*tileSize+2, tileSize-4, tileSize-4);
      } else {
        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
      }
    }
  }
}

/* draw powerups */
function drawPowerups(){
  for(const pu of powerups){
    const cx = pu.x*tileSize + tileSize/2, cy = pu.y*tileSize + tileSize/2;
    ctx.save();
    if(pu.type==='speed'){
      ctx.fillStyle = '#7af';
      ctx.beginPath(); ctx.arc(cx,cy, tileSize*0.28,0,Math.PI*2); ctx.fill();
    } else if(pu.type==='cloak'){
      ctx.fillStyle = '#9be';
      ctx.fillRect(pu.x*tileSize+6, pu.y*tileSize+6, tileSize-12, tileSize-12);
    } else if(pu.type==='freeze'){
      ctx.fillStyle = '#bfe';
      ctx.beginPath(); ctx.moveTo(cx,cy-tileSize*0.22); ctx.lineTo(cx+tileSize*0.16,cy); ctx.lineTo(cx-tileSize*0.16,cy); ctx.fill();
    }
    ctx.restore();
  }
}

/* HUD update */
function updateHUD(){
  // powerup text
  if(activePower && Date.now() < activePower.until){
    const rem = Math.ceil((activePower.until - Date.now())/1000);
    powerupBox.innerHTML = `<b>${activePower.type.toUpperCase()}</b> ${rem}s`;
  } else {
    powerupBox.innerHTML = '';
    if(activePower && Date.now() >= activePower.until){
      // expire effects
      if(activePower.type==='speed'){ player.speed -= 4; }
      activePower = null;
    }
  }
}

/* main loop */
let lastFrameTime = performance.now();
function gameLoop(now){
  if(!running) return;
  const dt = (now - lastFrameTime)/1000;
  lastFrameTime = now;
  frameCount++;

  // spawn powerups occasionally
  if(frameCount % 600 === 0 && Math.random() < 0.9) spawnPowerup();
  // spawn clones based on interval
  if(frameCount % Math.max(20, Math.floor(cloneInterval / (1 + SETTINGS.difficulty*0.6))) === 0 && movesHistory.length > 8){
    spawnClone();
    // difficulty ramp
    if(cloneInterval > 60) cloneInterval -= 1 + SETTINGS.difficulty;
    // sometimes spawn extra clones on harder difficulty
    if(Math.random() < 0.02 + SETTINGS.difficulty*0.03) spawnClone();
  }

  // update clones
  for(let i=clones.length-1;i>=0;i--){
    const c = clones[i];
    if(c.frozen) continue; // freeze effect
    c.update();
    // collision check
    if(Math.round(c.x) === player.x && Math.round(c.y) === player.y){
      // if cloak active, ignore
      if(!(activePower && activePower.type==='cloak' && Date.now()<activePower.until)){
        gameOver();
        return;
      }
    }
  }

  // render
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawMaze();

  // draw powerups
  drawPowerups();

  // draw clones
  for(const c of clones) c.draw();

  // update render pos
  updateRenderPosition(dt);
  // draw player trail: sample last few moves
  ctx.save();
  for(let i = Math.max(0, movesHistory.length-30); i<movesHistory.length; i++){
    const m = movesHistory[i];
    const alpha = (i - Math.max(0, movesHistory.length-30)) / 30;
    ctx.globalAlpha = 0.08 + alpha*0.18;
    ctx.fillStyle = '#33ff77';
    ctx.fillRect(m.x*tileSize+tileSize*0.25, m.y*tileSize+tileSize*0.25, tileSize*0.5, tileSize*0.5);
  }
  ctx.globalAlpha = 1;

  // draw player (smooth positions)
  ctx.fillStyle = player.color;
  ctx.beginPath();
  const px = player.rx*tileSize + tileSize/2;
  const py = player.ry*tileSize + tileSize/2;
  ctx.arc(px, py, player.radius, 0, Math.PI*2);
  ctx.fill();

  // particles
  updateParticles();
  drawParticles();

  // HUD
  const elapsed = Math.floor((Date.now() - startTime)/1000);
  timerText.textContent = `Time: ${elapsed}s`;
  updateHUD();

  requestAnimationFrame(gameLoop);
}

/* UI bindings */
startBtn.addEventListener('click', ()=>{
  saveSettings();
  menu.style.display = 'none';
  canvas.style.display = 'block';
  ui.style.display = 'block';
  resetGame();
  try{ if(SETTINGS.music){ bgMusic.currentTime=0; bgMusic.volume=0.55; bgMusic.play(); } } catch(e){}
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
});
tutorialBtn.addEventListener('click', ()=> tutorial.style.display = tutorial.style.display === 'none' ? 'block':'none');
settingsBtn.addEventListener('click', ()=> settings.style.display = settings.style.display === 'none' ? 'block':'none');

restartBtn.addEventListener('click', ()=>{
  resetGame();
  try{ if(SETTINGS.music){ bgMusic.currentTime=0; bgMusic.play(); } } catch(e){}
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
});
menuBtn.addEventListener('click', ()=>{
  running = false;
  canvas.style.display = 'none';
  ui.style.display = 'none';
  menu.style.display = 'block';
  try{ bgMusic.pause(); } catch(e){}
});
document.getElementById('musicToggle').addEventListener('change', ()=> { SETTINGS.music = document.getElementById('musicToggle').checked; saveSettings(); if(!SETTINGS.music){ try{ bgMusic.pause(); }catch(e){} }});
document.getElementById('sfxToggle').addEventListener('change', ()=> { SETTINGS.sfx = document.getElementById('sfxToggle').checked; saveSettings();});
document.getElementById('difficulty').addEventListener('input', ()=> { SETTINGS.difficulty = Number(document.getElementById('difficulty').value); saveSettings(); });

/* initialize best record text */
(function init(){
  bestTime = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  bestRecordText.textContent = bestTime ? `Best: ${bestTime}s` : `Best: —`;
})();
