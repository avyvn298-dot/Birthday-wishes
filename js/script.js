const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("status");

// Grid settings
const tileSize = 30;
const gridWidth = canvas.width / tileSize;
const gridHeight = canvas.height / tileSize;

// Player
let player = { x: 1, y: 1, color: "lime" };
let movesHistory = []; // store moves for clone

// Clone(s)
let clones = [];
let cloneInterval = 300; // frames until a clone spawns
let frameCount = 0;

// Maze layout (1 = wall, 0 = empty, 2 = goal)
let maze = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,2,1],
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

// Controls
document.addEventListener("keydown", (e) => {
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

// Clone object
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

// Game Loop
function gameLoop() {
  frameCount++;

  // Clear screen
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw maze
  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      if (maze[y][x] === 1) {
        ctx.fillStyle = "gray";
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
      if (maze[y][x] === 2) {
        ctx.fillStyle = "gold";
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }

  // Draw clones
  for (let clone of clones) {
    clone.update();
    clone.draw();
    if (clone.x === player.x && clone.y === player.y) {
      statusText.textContent = "☠️ You were caught by your shadow clone!";
      return;
    }
  }

  // Draw player
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x * tileSize, player.y * tileSize, tileSize, tileSize);

  // Spawn clones
  if (frameCount % cloneInterval === 0 && movesHistory.length > 0) {
    clones.push(new Clone(movesHistory));
  }

  // Check win condition
  if (maze[player.y][player.x] === 2) {
    statusText.textContent = "🎉 You escaped the maze!";
    return;
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
