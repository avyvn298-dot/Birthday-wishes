const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");
const timerText = document.getElementById("timer");
const restartBtn = document.getElementById("restartBtn");
const startBtn = document.getElementById("startBtn");
const menu = document.getElementById("menu");
const ui = document.getElementById("ui");

// Sounds
const bgMusic = document.getElementById("bgMusic");
const winSound = document.getElementById("winSound");
const loseSound = document.getElementById("loseSound");

// Grid settings
const tileSize = 30;

// Game state
let player, movesHistory, clones, frameCount, cloneInterval, running, startTime, bestTime;

// Maze layout (1 = wall, 0 = empty, 2 = safe zone)
let maze = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,0,1,0,1,0,1,0,1,1,1,1,0,0,1],
  [1,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,1,0,0,1],
  [1,1,1,0,1,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,1,0,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,1,1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1],
  [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Reset game
function resetGame() {
  player = { x: 1, y: 1, color: "lime" };
  movesHistory = [];
  clones = [];
  frameCount = 0;
  cloneInterval = 300; // initial clone spawn speed
  running = true;
  startTime = Date.now();
  statusText.textContent = "Survive as long as possible!";
  restartBtn.style.display = "none";
  timerText.textContent = "Time: 0s";
}

// Controls
document.addEventListener("keydown", (e) => {
  if (!running) return;

  let newX = player.x;
  let newY = player.y;

  if (e.key === "ArrowUp" || e.key === "w") newY--;
  if (e.key === "ArrowDown" || e.key === "s") newY++;
  if (e.key === "ArrowLeft" || e.key === "a") newX--;
  if (e.key === "ArrowRight" || e.key === "d") newX++;

  if (maze[newY][newX] !== 1) {
    player.x = newX;
    player.y = newY;
    movesHistory.push({ x: newX, y: newY });
  }
});

// Clone class
class Clone {
  constructor(path) {
    this.path = [...path];
    this.index = 0;
    this.color = "red";
    this.x = path[0].x;
    this.y = path[0].y;
  }

  update() {
    if (this.index < this.path.length) {
      this.x = this.path[this.index].x;
      this.y = this.path[this.index].y;
      this.index++;
    }
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x * tileSize, this.y * tileSize, tileSize, tileSize);
  }
}

// Game loop
function gameLoop() {
  if (!running) return;

  frameCount++;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw maze
  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      if (maze[y][x] === 1) {
        ctx.fillStyle = "gray";
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }

  // Spawn new clones (faster over time)
  if (frameCount % cloneInterval === 0 && movesHistory.length > 0) {
    clones.push(new Clone(movesHistory));
    if (cloneInterval > 100) cloneInterval -= 10; // difficulty increases
  }

  // Update & draw clones
  for (let clone of clones) {
    clone.update();
    clone.draw();
    if (clone.x === player.x && clone.y === player.y) {
      gameOver();
      return;
    }
  }

  // Draw player
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x * tileSize, player.y * tileSize, tileSize, tileSize);

  // Timer
  let elapsed = Math.floor((Date.now() - startTime) / 1000);
  timerText.textContent = "Time: " + elapsed + "s";

  requestAnimationFrame(gameLoop);
}

// Game over
function gameOver() {
  running = false;
  bgMusic.pause();
  loseSound.play();

  let elapsed = Math.floor((Date.now() - startTime) / 1000);

  if (!bestTime || elapsed > bestTime) {
    bestTime = elapsed;
    statusText.textContent = `☠️ You survived ${elapsed}s (NEW RECORD!)`;
  } else {
    statusText.textContent = `☠️ You survived ${elapsed}s (Best: ${bestTime}s)`;
  }

  restartBtn.style.display = "inline-block";
}

// Restart button
restartBtn.addEventListener("click", () => {
  resetGame();
  requestAnimationFrame(gameLoop);
  bgMusic.currentTime = 0;
  bgMusic.play();
});

// Start button
startBtn.addEventListener("click", () => {
  menu.style.display = "none";
  canvas.style.display = "block";
  ui.style.display = "block";
  resetGame();
  requestAnimationFrame(gameLoop);
  bgMusic.currentTime = 0;
  bgMusic.play();
});
