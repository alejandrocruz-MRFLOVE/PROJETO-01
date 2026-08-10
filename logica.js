const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const qteContainer = document.getElementById('qte-container');
const qteBtn = document.getElementById('qte-btn');

// --- AJUSTE DE TELA CHEIA ---
let groundY = 0;
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  groundY = canvas.height - 100;
  if (typeof dino !== 'undefined' && dino) dino.groundY = groundY - dino.normalHeight;
}

// --- SINTETIZADOR DE SOM ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;

  if (type === 'jump') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } 
  else if (type === 'doubleJump') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }
  else if (type === 'shoot') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } 
  else if (type === 'pickup') {
    const notes = [300, 450, 600];
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, now + idx * 0.04);
      gain.gain.linearRampToValueAtTime(0.01, now + idx * 0.04 + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.05);
    });
  } 
  else if (type === 'explode' || type === 'hit') {
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    noise.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(now);
  } 
  else if (type === 'gameover') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.4);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}

// --- ESTADOS DO JOGO ---
let gameStarted = false;
let gameOver = false;
let score = 0;
let highScore = localStorage.getItem('dino_highscore_full') || 0;
let speed = 7;
let frameCount = 0;
let isDarkMode = false;
let lastScoreCheck = 0;

// ARMA E MUNIÇÃO
let hasGun = false;
let ammo = 0;
const bullets = [];
const items = [];

// CICLO DIA/NOITE
let dayNightTimer = 0;
const CYCLE_DURATION = 1800;

// CONTROLES
const keys = { up: false, down: false };

// --- BOSS & MECÂNICAS ---
let bossActive = false;
let bossDefeated = false;
let bossSpawnedAt500 = false;
let activeQTE = false;
let qteTargetNumber = null;
let qteTimeout = null;

const boss = {
  x: 0,
  y: 0,
  width: 88,
  height: 94,
  hp: 100,
  maxHp: 100,
  targetX: 0,
  state: 'entering', // 'entering', 'idle', 'attacking', 'returning', 'kicked'
  animTimer: 0,
  kickTimer: 0,
  
  init() {
    this.hp = 100;
    this.width = 88;
    this.height = 94;
    this.x = canvas.width + 100;
    this.y = groundY - this.height;
    this.targetX = canvas.width - 200;
    this.state = 'entering';
    bossActive = true;
  },

  update() {
    if (!bossActive) return;

    if (this.state === 'entering') {
      this.x -= 4;
      if (this.x <= this.targetX) {
        this.x = this.targetX;
        this.state = 'idle';
        if (!hasGun) triggerQTE();
      }
    } else if (this.state === 'attacking') {
      this.x -= 15;
      if (this.x <= dino.x + dino.width) {
        dino.lives--;
        playSound('hit');
        for (let i = 0; i < 10; i++) {
          particles.push(new Particle(dino.x + 20, dino.y + 20, '#e74c3c'));
        }
        if (dino.lives <= 0) {
          triggerGameOver();
        } else {
          this.state = 'returning';
        }
      }
    } else if (this.state === 'returning') {
      this.x += 10;
      if (this.x >= this.targetX) {
        this.x = this.targetX;
        this.state = 'idle';
        if (!hasGun && !gameOver) triggerQTE();
      }
    } else if (this.state === 'kicked') {
      this.kickTimer--;
      if (this.kickTimer <= 0) {
        this.state = 'idle';
        if (!hasGun && !gameOver) triggerQTE();
      }
    }
  },

  takeDamage(amount) {
    this.hp -= amount;
    playSound('hit');
    for (let i = 0; i < 15; i++) {
      particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, '#c0392b'));
    }

    if (this.hp <= 0) {
      this.hp = 0;
      bossActive = false;
      bossDefeated = true;
      qteContainer.style.display = 'none';
      clearTimeout(qteTimeout);
      for (let i = 0; i < 30; i++) {
        particles.push(new Particle(this.x + Math.random() * this.width, this.y + Math.random() * this.height, '#f1c40f'));
      }
    }
  },

  draw() {
    if (!bossActive) return;

    ctx.save();
    const c = '#c0392b';
    const darkC = '#78281f';

    ctx.fillStyle = c;

    ctx.fillRect(this.x + 24, this.y, 44, 50);      
    ctx.fillRect(this.x, this.y - 24, 48, 32);  
    ctx.fillRect(this.x - 16, this.y - 8, 16, 16);    
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x + 12, this.y - 18, 10, 10);
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x + 14, this.y - 16, 5, 5);

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(this.x + 8, this.y - 22);
    ctx.lineTo(this.x + 24, this.y - 14);
    ctx.lineTo(this.x + 24, this.y - 18);
    ctx.fill();

    ctx.fillStyle = darkC;
    ctx.fillRect(this.x + 12, this.y, 20, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x + 14, this.y - 2, 4, 4);
    ctx.fillRect(this.x + 22, this.y - 2, 4, 4);

    ctx.fillStyle = c;
    ctx.fillRect(this.x + 60, this.y + 12, 24, 20);     
    ctx.fillRect(this.x + 80, this.y + 8, 12, 12);

    ctx.fillRect(this.x + 28, this.y + 50, 12, 28);
    ctx.fillRect(this.x + 48, this.y + 50, 12, 20);

    const barWidth = 120;
    const barHeight = 12;
    const barX = this.x + (this.width / 2) - (barWidth / 2);
    const barY = this.y - 45;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(barX, barY, barWidth * (this.hp / this.maxHp), barHeight);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`BOSS: ${this.hp}/${this.maxHp}`, barX + barWidth / 2, barY - 5);

    ctx.restore();
  }
};

// --- PARTÍCULAS ---
const particles = [];
class Particle {
  constructor(x, y, color, type = 'dust') {
    this.x = x;
    this.y = y;
    this.type = type;

    if (type === 'smoke') {
      this.size = Math.random() * 8 + 4;
      this.vx = -speed * 0.4 + (Math.random() - 0.5) * 2;
      this.vy = Math.random() * 1.5 + 0.5;
      this.life = 35;
      this.color = color || 'rgba(180, 180, 180, 0.7)';
    } else {
      this.size = Math.random() * 5 + 2;
      this.vx = -speed * 0.3 + (Math.random() - 0.5) * 3;
      this.vy = (Math.random() - 0.5) * 3;
      this.life = 25;
      this.color = color;
    }
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.type === 'smoke') this.size += 0.2;
  }
  draw() {
    if (this.type === 'smoke') {
      const alpha = this.life / 35;
      ctx.fillStyle = `rgba(180, 180, 180, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(Math.floor(this.x), Math.floor(this.y), this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color || (isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(83,83,83,0.4)');
      ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.size, this.size);
    }
  }
}

// --- NUVENS E ESTRELAS ---
const clouds = [];
const stars = [];

function initBackgroundElements() {
  clouds.length = 0;
  stars.length = 0;
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * (window.innerHeight * 0.35) + 30,
      speed: Math.random() * 0.4 + 0.3,
      scale: Math.random() * 0.5 + 0.8
    });
  }
  for (let i = 0; i < 40; i++) {
    stars.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * (window.innerHeight * 0.5) + 10,
      size: Math.random() > 0.5 ? 2 : 3,
      alpha: Math.random()
    });
  }
}

// --- PROJÉTEIS (TIROS) ---
class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.speed = 18;
    this.width = 14;
    this.height = 5;
  }
  update() {
    this.x += this.speed;
  }
  draw() {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(this.x - 4, this.y + 1, 4, 3);
  }
}

// --- ITENS (ARMA / MUNIÇÃO) ---
class Item {
  constructor(type) {
    this.x = canvas.width;
    this.type = type;
    this.width = 26;
    this.height = 26;
    this.y = groundY - 32;
    this.bounce = 0;
  }
  update() {
    this.x -= speed;
    this.bounce += 0.1;
  }
  draw() {
    const floatY = this.y + Math.sin(this.bounce) * 3;
    if (this.type === 'gun') {
      ctx.fillStyle = '#2980b9';
      ctx.fillRect(this.x, floatY, this.width, this.height);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(this.x + 3, floatY + 3, this.width - 6, this.height - 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x + 6, floatY + 12, 12, 5);
      ctx.fillRect(this.x + 14, floatY + 17, 4, 5);
    } else {
      ctx.fillStyle = '#d35400';
      ctx.fillRect(this.x, floatY, this.width, this.height);
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(this.x + 3, floatY + 3, this.width - 6, this.height - 6);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('+AM', this.x + 4, floatY + 17);
    }
  }
}

// --- DINOSSAURO ---
const dino = {
  x: 80,
  groundY: 0,
  y: 0,
  normalWidth: 44,
  normalHeight: 47,
  duckWidth: 59,
  duckHeight: 30,
  width: 44,
  height: 47,
  velocityY: 0,
  gravity: 0.75,
  jumpForce: -13.5,
  isGrounded: true,
  isDucking: false,
  legFrame: 0,
  lives: 3,
  
  jumpsLeft: 2,
  rotation: 0,
  isRotating: false,
  isKicking: false,

  shoot() {
    if (hasGun && ammo > 0 && gameStarted && !gameOver) {
      ammo--;
      bullets.push(new Bullet(this.x + this.width, this.y + (this.isDucking ? 10 : 16)));
      playSound('shoot');
      if (ammo <= 0) {
        hasGun = false;
        if (bossActive && boss.state === 'idle') {
          triggerQTE();
        }
      }
    }
  },

  jump() {
    if (this.isGrounded && !this.isDucking) {
      this.velocityY = this.jumpForce;
      this.isGrounded = false;
      this.jumpsLeft = 1;
      playSound('jump');
      for (let i = 0; i < 8; i++) {
        particles.push(new Particle(this.x + 10, this.groundY + 40));
      }
    } 
    else if (!this.isGrounded && this.jumpsLeft > 0) {
      this.velocityY = this.jumpForce * 0.9;
      this.jumpsLeft = 0;
      this.isRotating = true;
      this.rotation = 0;
      playSound('doubleJump');
      for (let i = 0; i < 14; i++) {
        particles.push(new Particle(this.x + this.width / 2, this.y + this.height, null, 'smoke'));
      }
    }
  },

  update() {
    if (keys.down && this.isGrounded) {
      this.isDucking = true;
      this.width = this.duckWidth;
      this.height = this.duckHeight;
      this.y = this.groundY + 17;
    } else {
      this.isDucking = false;
      this.width = this.normalWidth;
      this.height = this.normalHeight;
      if (this.isGrounded) this.y = this.groundY;
    }

    if (keys.down && !this.isGrounded) {
      this.velocityY += this.gravity * 1.8;
    } else {
      this.velocityY += this.gravity;
    }

    this.y += this.velocityY;

    if (this.isRotating) {
      this.rotation += 22;
      if (this.rotation >= 360) {
        this.rotation = 0;
        this.isRotating = false;
      }
    }

    if (this.y >= (this.isDucking ? this.groundY + 17 : this.groundY)) {
      this.y = this.isDucking ? this.groundY + 17 : this.groundY;
      this.velocityY = 0;
      this.isGrounded = true;
      this.jumpsLeft = 2;
      this.isRotating = false;
      this.rotation = 0;
    }

    if (frameCount % 5 === 0) {
      this.legFrame = this.legFrame === 0 ? 1 : 0;
    }

    if (this.isGrounded && gameStarted && !gameOver && frameCount % 4 === 0) {
      particles.push(new Particle(this.x, this.groundY + 42));
    }
  },

  draw() {
    ctx.save();

    if (this.isRotating) {
      ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.translate(-(this.x + this.width / 2), -(this.y + this.height / 2));
    }

    const c = isDarkMode ? '#f5f6fa' : '#2f3542';
    ctx.fillStyle = c;

    if (!this.isDucking) {
      ctx.fillRect(this.x + 12, this.y, 22, 25);     
      ctx.fillRect(this.x + 20, this.y - 12, 24, 16); 
      ctx.fillRect(this.x + 40, this.y - 4, 8, 8);   
      
      ctx.fillStyle = isDarkMode ? '#0b0c10' : '#ffffff';
      ctx.fillRect(this.x + 34, this.y - 9, 4, 4);
      ctx.fillStyle = c;

      ctx.fillRect(this.x + 30, this.y + 12, 8, 4);  
      ctx.fillRect(this.x, this.y + 6, 12, 10);      
      ctx.fillRect(this.x - 4, this.y + 4, 6, 6);

      if (this.isKicking) {
        ctx.fillRect(this.x + 16, this.y + 25, 6, 10);
        ctx.fillRect(this.x + 26, this.y + 20, 18, 6);
      } else if (this.isGrounded && gameStarted && !gameOver) {
        if (this.legFrame === 0) {
          ctx.fillRect(this.x + 16, this.y + 25, 6, 14);
          ctx.fillRect(this.x + 28, this.y + 25, 6, 6);
        } else {
          ctx.fillRect(this.x + 16, this.y + 25, 6, 6);
          ctx.fillRect(this.x + 28, this.y + 25, 6, 14);
        }
      } else {
        ctx.fillRect(this.x + 16, this.y + 25, 6, 10);
        ctx.fillRect(this.x + 26, this.y + 25, 6, 10);
      }

      if (hasGun) {
        ctx.fillStyle = '#2980b9';
        ctx.fillRect(this.x + 30, this.y + 6, 18, 6);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(this.x + 46, this.y + 7, 4, 2);
      }
    } else {
      ctx.fillRect(this.x + 10, this.y, 36, 18);     
      ctx.fillRect(this.x + 40, this.y + 2, 18, 12); 
      ctx.fillRect(this.x + 54, this.y + 6, 6, 6);   
      
      ctx.fillStyle = isDarkMode ? '#0b0c10' : '#ffffff';
      ctx.fillRect(this.x + 50, this.y + 4, 3, 3);
      ctx.fillStyle = c;

      ctx.fillRect(this.x + 36, this.y + 12, 6, 4);  
      ctx.fillRect(this.x, this.y + 2, 10, 8);        

      if (this.legFrame === 0) {
        ctx.fillRect(this.x + 16, this.y + 18, 6, 10);
        ctx.fillRect(this.x + 32, this.y + 18, 6, 4);
      } else {
        ctx.fillRect(this.x + 16, this.y + 18, 6, 4);
        ctx.fillRect(this.x + 32, this.y + 18, 6, 10);
      }

      if (hasGun) {
        ctx.fillStyle = '#2980b9';
        ctx.fillRect(this.x + 44, this.y + 8, 16, 5);
      }
    }

    ctx.restore();
  }
};

// --- OBSTÁCULOS ---
const obstacles = [];

class Obstacle {
  constructor() {
    this.x = canvas.width;
    const types = score > 150 ? [0, 1, 2, 3, 3] : [0, 1, 2];
    this.type = types[Math.floor(Math.random() * types.length)];

    if (this.type === 0) {
      this.width = 22;
      this.height = 42;
      this.y = groundY - this.height;
    } else if (this.type === 1) {
      this.width = 44;
      this.height = 42;
      this.y = groundY - this.height;
    } else if (this.type === 2) {
      this.width = 30;
      this.height = 56;
      this.y = groundY - this.height;
    } else if (this.type === 3) {
      this.width = 46;
      this.height = 32;
      const heights = [groundY - 75, groundY - 48, groundY - 18];
      this.y = heights[Math.floor(Math.random() * heights.length)];
      this.wingFrame = 0;
    }
  }

  update() {
    this.x -= speed;
    if (this.type === 3 && frameCount % 8 === 0) {
      this.wingFrame = this.wingFrame === 0 ? 1 : 0;
    }
  }

  draw() {
    if (this.type < 3) {
      ctx.fillStyle = isDarkMode ? '#2ed573' : '#27ae60';
      ctx.fillRect(this.x + 4, this.y, this.width - 8, this.height);
      ctx.fillRect(this.x, this.y + 10, this.width, 6);
      ctx.fillRect(this.x, this.y + 4, 4, 12);
      ctx.fillRect(this.x + this.width - 4, this.y + 6, 4, 14);

      ctx.fillStyle = isDarkMode ? '#7bed9f' : '#2ecc71';
      ctx.fillRect(this.x + 6, this.y, 3, this.height);
    } else {
      const pColor = isDarkMode ? '#ff7f50' : '#ff6348';
      ctx.fillStyle = pColor;
      
      ctx.fillRect(this.x + 14, this.y + 10, 24, 10);
      ctx.fillRect(this.x, this.y + 8, 14, 8);        
      ctx.fillRect(this.x + 38, this.y + 12, 8, 4);   

      if (this.wingFrame === 0) {
        ctx.fillRect(this.x + 18, this.y - 12, 10, 22);
      } else {
        ctx.fillRect(this.x + 18, this.y + 18, 10, 18);
      }
    }
  }
}

// --- SISTEMA DE QTE DO BOSS ---
function triggerQTE() {
  if (!bossActive || hasGun || gameOver) return;

  activeQTE = true;
  qteTargetNumber = Math.floor(Math.random() * 9) + 1;
  qteBtn.innerText = qteTargetNumber;

  const posX = Math.random() * (canvas.width - 300) + 150;
  const posY = Math.random() * (canvas.height - 300) + 150;

  qteContainer.style.left = `${posX}px`;
  qteContainer.style.top = `${posY}px`;
  qteContainer.style.display = 'block';

  clearTimeout(qteTimeout);
  qteTimeout = setTimeout(() => {
    if (activeQTE) {
      qteFailed();
    }
  }, 1000);
}

function qteSuccess() {
  activeQTE = false;
  qteContainer.style.display = 'none';
  clearTimeout(qteTimeout);

  dino.isKicking = true;
  boss.takeDamage(10);
  boss.state = 'kicked';
  boss.kickTimer = 20;

  setTimeout(() => {
    dino.isKicking = false;
  }, 300);
}

function qteFailed() {
  activeQTE = false;
  qteContainer.style.display = 'none';
  clearTimeout(qteTimeout);

  boss.state = 'attacking';
}

// --- CENÁRIO E DIA/NOITE ---
function drawEnvironment() {
  document.body.style.backgroundColor = isDarkMode ? '#0b0c10' : '#70a1ff';

  const cycleProgress = (dayNightTimer % CYCLE_DURATION) / CYCLE_DURATION;
  const angle = cycleProgress * Math.PI;

  const celestialX = canvas.width * cycleProgress;
  const celestialY = (canvas.height * 0.55) - Math.sin(angle) * (canvas.height * 0.42);

  if (isDarkMode) {
    ctx.fillStyle = '#f1f2f6';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 30, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#dcdde1';
    ctx.beginPath();
    ctx.arc(celestialX - 8, celestialY - 6, 6, 0, Math.PI * 2);
    ctx.arc(celestialX + 10, celestialY + 8, 8, 0, Math.PI * 2);
    ctx.fill();

    stars.forEach(s => {
      s.alpha += (Math.random() - 0.5) * 0.05;
      s.alpha = Math.max(0.2, Math.min(1, s.alpha));
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    });
  } else {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(241, 196, 15, 0.25)';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 48, 0, Math.PI * 2);
    ctx.fill();
  }

  clouds.forEach(cloud => {
    if (gameStarted && !gameOver) cloud.x -= cloud.speed;
    if (cloud.x < -100) cloud.x = canvas.width + 40;

    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.75)';
    const cx = cloud.x, cy = cloud.y, s = cloud.scale;
    ctx.fillRect(cx, cy, 60 * s, 16 * s);
    ctx.fillRect(cx + 15 * s, cy - 12 * s, 30 * s, 12 * s);
  });

  const mainColor = isDarkMode ? '#e8eaed' : '#2f3542';
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  ctx.fillStyle = mainColor;
  for (let i = 0; i < canvas.width; i += 40) {
    const bumpX = (i - (frameCount * speed * 0.5)) % canvas.width;
    const realX = bumpX < 0 ? canvas.width + bumpX : bumpX;
    ctx.fillRect(realX, groundY + 6, 6, 2);
    ctx.fillRect((realX + 18) % canvas.width, groundY + 12, 4, 2);
  }
}

// --- LOOP PRINCIPAL DO JOGO ---
let spawnTimer = 0;

function gameLoop() {
  frameCount++;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameStarted) {
    if (!gameOver) {
      dayNightTimer++;
      if (dayNightTimer % CYCLE_DURATION === 0) {
        isDarkMode = !isDarkMode;
        document.body.classList.toggle('dark-mode', isDarkMode);
      }
    }

    drawEnvironment();

    if (!gameOver) {
      if (!bossActive) {
        score += 0.15;
        speed += 0.0008;
      }

      if (score >= 500 && !bossSpawnedAt500) {
        bossSpawnedAt500 = true;
        obstacles.length = 0;
        boss.init();
      }

      const currentScoreCheck = Math.floor(score / 100);
      if (currentScoreCheck > lastScoreCheck && !bossActive) {
        lastScoreCheck = currentScoreCheck;
        if (Math.random() < 0.25) {
          items.push(new Item(hasGun ? 'ammo' : 'gun'));
        }
      }

      if (!bossActive) {
        spawnTimer++;
        if (spawnTimer > Math.max(38, 85 - speed * 2.5)) {
          if (Math.random() < 0.65) {
            obstacles.push(new Obstacle());
            spawnTimer = 0;
          }
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.update();
        item.draw();

        if (
          dino.x < item.x + item.width &&
          dino.x + dino.width > item.x &&
          dino.y < item.y + item.height &&
          dino.y + dino.height > item.y
        ) {
          if (item.type === 'gun') {
            hasGun = true;
            ammo = 10;
          } else {
            ammo += 10;
          }
          playSound('pickup');
          items.splice(i, 1);
        } else if (item.x + item.width < 0) {
          items.splice(i, 1);
        }
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.update();
        b.draw();

        for (let j = obstacles.length - 1; j >= 0; j--) {
          const o = obstacles[j];
          if (
            b.x < o.x + o.width &&
            b.x + b.width > o.x &&
            b.y < o.y + o.height &&
            b.y + b.height > o.y
          ) {
            for (let k = 0; k < 12; k++) {
              particles.push(new Particle(o.x + o.width / 2, o.y + o.height / 2, '#e74c3c'));
            }
            playSound('explode');
            obstacles.splice(j, 1);
            bullets.splice(i, 1);
            break;
          }
        }

        if (bossActive && b &&
            b.x < boss.x + boss.width &&
            b.x + b.width > boss.x &&
            b.y < boss.y + boss.height &&
            b.y + b.height > boss.y
        ) {
          boss.takeDamage(20);
          bullets.splice(i, 1);
        }

        if (b && b.x > canvas.width) {
          bullets.splice(i, 1);
        }
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.update();
        o.draw();

        const padding = 6;
        if (
          dino.x + padding < o.x + o.width &&
          dino.x + dino.width - padding > o.x &&
          dino.y + padding < o.y + o.height &&
          dino.y + dino.height - padding > o.y
        ) {
          triggerGameOver();
        }

        if (o.x + o.width < 0) {
          obstacles.splice(i, 1);
        }
      }

      boss.update();
      dino.update();
    }

    boss.draw();
    dino.draw();
    drawUI();
  }

  requestAnimationFrame(gameLoop);
}

// --- INTERFACE DE USUÁRIO DENTRO DO CANVAS ---
function drawUI() {
  ctx.fillStyle = isDarkMode ? '#e8eaed' : '#2f3542';
  ctx.font = 'bold 20px "Courier New"';
  
  ctx.textAlign = 'right';
  const currentFormatted = Math.floor(score).toString().padStart(5, '0');
  const highFormatted = Math.floor(highScore).toString().padStart(5, '0');
  ctx.fillText(`HI ${highFormatted}  ${currentFormatted}`, canvas.width - 30, 40);

  ctx.textAlign = 'left';
  if (hasGun || ammo > 0) {
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(`MUNIÇÃO: ${ammo}`, 30, 40);
  }

  if (bossActive || bossSpawnedAt500) {
    ctx.fillStyle = '#e74c3c';
    let hearts = '';
    for (let i = 0; i < dino.lives; i++) hearts += '❤️ ';
    ctx.fillText(`VIDAS DINO: ${hearts}`, 30, 70);
  }
}

// --- GAME OVER ---
function triggerGameOver() {
  gameOver = true;
  playSound('gameover');
  qteContainer.style.display = 'none';
  clearTimeout(qteTimeout);

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('dino_highscore_full', highScore);
  }

  document.getElementById('final-score').innerText = Math.floor(score).toString().padStart(5, '0');
  document.getElementById('final-highscore').innerText = Math.floor(highScore).toString().padStart(5, '0');
  document.getElementById('final-ammo').innerText = ammo;

  gameOverScreen.classList.remove('hidden');
}

function startGame() {
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  qteContainer.style.display = 'none';

  score = 0;
  speed = 7;
  lastScoreCheck = 0;
  dayNightTimer = 0;
  isDarkMode = false;
  document.body.classList.remove('dark-mode');
  
  hasGun = false;
  ammo = 0;
  
  bossActive = false;
  bossDefeated = false;
  bossSpawnedAt500 = false;
  activeQTE = false;

  obstacles.length = 0;
  particles.length = 0;
  bullets.length = 0;
  items.length = 0;

  gameOver = false;
  gameStarted = true;
  dino.y = dino.groundY;
  dino.velocityY = 0;
  dino.jumpsLeft = 2;
  dino.isRotating = false;
  dino.rotation = 0;
  dino.lives = 3;
}

// --- EVENTOS DE TECLADO ---
window.addEventListener('resize', () => {
  resizeCanvas();
  initBackgroundElements();
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

window.addEventListener('keydown', (e) => {
  if (activeQTE && bossActive) {
    const keyPressed = parseInt(e.key);
    if (!isNaN(keyPressed) && keyPressed === qteTargetNumber) {
      qteSuccess();
      return;
    } else if (!isNaN(keyPressed) && keyPressed !== qteTargetNumber) {
      qteFailed();
      return;
    }
  }

  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (!gameStarted || gameOver) {
      startGame();
    } else {
      dino.jump();
    }
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    keys.down = true;
  }
  if (e.code === 'KeyA' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
    e.preventDefault();
    dino.shoot();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown') {
    keys.down = false;
  }
});

// Iniciar
resizeCanvas();
initBackgroundElements();
requestAnimationFrame(gameLoop);
