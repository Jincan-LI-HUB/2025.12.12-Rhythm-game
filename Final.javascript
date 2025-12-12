let centerRing;
let magneticParticles = [];
let rhythmGame;
let explosions = []; 
const PI = Math.PI;
const TWO_PI = Math.PI * 2;

// --- 串口与压力配置 ---
let serial;
let pressureValue = 0; 
let lastNoteTime = 0;
let noteCooldown = 120; 
const MAX_PRESSURE = 800; 
// -------------------

// --- 待机模式防噪记录 ---
let lastTriggeredIndex = -1; 
// -------------------------

// 核心配置
const ARC_START = PI * 0.75; 
const ARC_END = PI * 2.25;   
const TOTAL_ARC = ARC_END - ARC_START;

// 模式控制
let isRandomMode = false; 
let currentSongIndex = 0; 

// 音调
let osc, envelope, notes = [];
let octaveOffset = 0;

// --- 🎵 歌单配置 🎵 ---
const SONGS = [
  {
    name: "Twinkle Star (小星星)",
    data: [
      0, 0, 4, 4, 5, 5, 4, -1, 
      3, 3, 2, 2, 1, 1, 0, -1, 
      4, 4, 3, 3, 2, 2, 1, -1,
      4, 4, 3, 3, 2, 2, 1, -1,
      0, 0, 4, 4, 5, 5, 4, -1, 
      3, 3, 2, 2, 1, 1, 0, -1
    ]
  },
  {
    name: "Ode to Joy (欢乐颂)",
    data: [
      2, 2, 3, 4, 4, 3, 2, 1, 
      0, 0, 1, 2, 2, 1, 1, -1, 
      2, 2, 3, 4, 4, 3, 2, 1, 
      0, 0, 1, 2, 1, 0, 0, -1, 
      1, 1, 2, 0, 1, 2, 3, 2, 
      0, 1, 2, 3, 2, 1, 0, 1, 
      4, -1, 2, 2, 3, 4, 4, 3, 
      2, 1, 0, 0, 1, 2, 1, 0, 0, -1 
    ]
  },
  {
    name: "Little Bee (小蜜蜂)",
    data: [
      4, 2, 2, -1, 3, 1, 1, -1, 
      0, 1, 2, 3, 4, 4, 4, -1, 
      4, 2, 2, -1, 3, 1, 1, -1, 
      0, 2, 4, 4, 0, -1, -1, -1, 
      1, 1, 1, 1, 1, 2, 3, -1, 
      2, 2, 2, 2, 2, 3, 4, -1, 
      4, 2, 2, -1, 3, 1, 1, -1, 
      0, 2, 4, 4, 0, -1, -1, -1  
    ]
  }
];
// ------------------------

function angleDiff(a, b) {
  let diff = (b - a + PI) % TWO_PI - PI;
  return diff < -PI ? diff + TWO_PI : diff;
}

// --- 爆炸特效类 ---
class Explosion {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.life = 1.0; 
  }
  update() { this.life -= 0.05; }
  display() {
    push();
    blendMode(ADD); 
    noStroke();
    let waveSize = (1.0 - this.life) * 150;
    let waveAlpha = this.life * 200;
    stroke(255, 200, 100, waveAlpha);
    strokeWeight(3);
    noFill();
    ellipse(this.pos.x, this.pos.y, waveSize, waveSize);
    noStroke();
    fill(255, 255, 255, this.life * 255);
    ellipse(this.pos.x, this.pos.y, 40 * this.life, 40 * this.life);
    blendMode(BLEND);
    pop();
  }
}

// --- 音游逻辑 ---
class RhythmGame {
  constructor() {
    this.isPlaying = false;
    this.score = 0;
    this.combo = 0;
    this.spawnRadius = 450; 
    this.hitRadius = 130;
    
    // --- 速度控制 ---
    this.speed = 3.0; // 默认速度
    // ----------------
    
    this.obstacles = [];
    this.lastSpawnTime = 0;
    this.spawnInterval = 1200; 
    this.songIndex = 0;
  }

  start() {
    this.isPlaying = true;
    this.score = 0;
    this.combo = 0;
    this.obstacles = [];
    this.songIndex = 0; 
  }
  
  stop() {
    this.isPlaying = false;
    this.obstacles = [];
  }

  getTrackAngle(index) {
    let step = TOTAL_ARC / 9;
    return ARC_START + step * index + step / 2;
  }

  update() {
    if (!this.isPlaying) return;
    
    let currentInterval = isRandomMode ? max(800, 1200 - this.combo * 10) : 1200;

    if (millis() - this.lastSpawnTime > currentInterval) {
      let note;
      if (isRandomMode) {
        note = floor(random(0, 9));
      } else {
        let currentSongData = SONGS[currentSongIndex].data;
        note = currentSongData[this.songIndex];
        this.songIndex = (this.songIndex + 1) % currentSongData.length;
      }
      
      if (note !== -1) {
        this.spawnObstacle(note);
      }
      this.lastSpawnTime = millis();
    }
    
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      let obs = this.obstacles[i];
      obs.dist -= this.speed; // 使用动态速度
      if (obs.dist < this.hitRadius - 20) {
        this.combo = 0;
        this.obstacles.splice(i, 1);
      }
    }
  }

  spawnObstacle(index) {
    this.obstacles.push({
      trackIndex: index,
      angle: this.getTrackAngle(index),
      dist: this.spawnRadius,
      hueOffset: random(-20, 20) 
    });
  }

  checkHit(inputIndex) {
    if (!this.isPlaying) return false;
    for (let i = 0; i < this.obstacles.length; i++) {
      let obs = this.obstacles[i];
      if (obs.trackIndex === inputIndex) {
        if (abs(obs.dist - this.hitRadius) < 40) { 
          
          let hitX = cos(obs.angle) * this.hitRadius;
          let hitY = sin(obs.angle) * this.hitRadius;
          explosions.push(new Explosion(hitX, hitY));
          
          let debrisCount = 12; 
          for(let k = 0; k < debrisCount; k++) {
            let spreadAngle = obs.angle + random(-0.8, 0.8);
            let speed = random(4, 12); 
            let burstVel = createVector(cos(spreadAngle) * speed, sin(spreadAngle) * speed);
            magneticParticles.push(new MagneticParticle(hitX, hitY, burstVel));
          }

          this.obstacles.splice(i, 1);
          this.score += 100;
          this.combo++;
          return true; 
        }
      }
    }
    return false; 
  }

  display() {
    push();
    translate(width/2, height/2);
    if (this.isPlaying) {
      stroke(255, 10);
      strokeWeight(1);
      for (let i = 0; i < 9; i++) {
        let angle = this.getTrackAngle(i);
        line(cos(angle) * this.hitRadius, sin(angle) * this.hitRadius, 
             cos(angle) * this.spawnRadius, sin(angle) * this.spawnRadius);
      }
      
      fill(255);
      textSize(24);
      textAlign(LEFT, TOP);
      text("SCORE: " + this.score, -width/2 + 30, -height/2 + 30);
      
      // --- UI 显示区域 ---
      textSize(16);
      fill(150, 200, 255);
      
      // 显示速度
      text("SPEED: " + this.speed.toFixed(1), -width/2 + 30, -height/2 + 60);
      
      // 显示模式/歌曲
      if (isRandomMode) {
        text("MODE: RANDOM", -width/2 + 30, -height/2 + 85);
      } else {
        text("SONG: " + SONGS[currentSongIndex].name, -width/2 + 30, -height/2 + 85);
      }
      
      fill(255, 100);
      textSize(12);
      text("R:MODE | S:SWITCH | Q W:SPEED", -width/2 + 30, -height/2 + 110);

      if (this.combo > 1) {
        textSize(18);
        fill(255, 200, 50);
        text(this.combo + " COMBO", -width/2 + 30, -height/2 + 140);
      }
    } else {
      fill(255, 100);
      textAlign(CENTER);
      text("PRESS'G' TO START", 0, 80);
    }

    for (let obs of this.obstacles) {
      let x = cos(obs.angle) * obs.dist;
      let y = sin(obs.angle) * obs.dist;
      push();
      translate(x, y);
      rotate(obs.angle); 
      blendMode(ADD);
      strokeWeight(2);
      for(let j=0; j<3; j++) {
        let trailAlpha = map(j, 0, 3, 150, 0);
        stroke(255, 50, 80, trailAlpha);
        let startX = 10 + j * 8;
        line(startX, 0, startX + 5, 0);
      }
      noStroke();
      fill(255, 50, 80, 50);
      beginShape(); vertex(-15, 0); vertex(5, 10); vertex(5, -10); endShape(CLOSE);
      fill(255, 80, 100, 200);
      beginShape(); vertex(-12, 0); vertex(0, 6); vertex(4, 0); vertex(0, -6); endShape(CLOSE);
      fill(255, 255, 255, 200);
      ellipse(0, 0, 4, 4);
      blendMode(BLEND); 
      pop();
    }
    pop();
  }
}

// --- 仪表盘圆环类 ---
class CenterRing {
  constructor() {
    this.x = width / 2;
    this.y = height / 2;
    this.radius = 130;
    this.baseColor = color(100, 160, 255);
    this.flashColor = color(255, 255, 255);
    this.currentColor = this.baseColor;
    this.colorLerpAmt = 0;
    this.segments = 100; 
    this.points = [];
    this.initPoints();
    
    this.pointerAngle = ARC_START; 
    this.targetPointerAngle = ARC_START;
    this.pointerVelocity = 0;
    this.pointerSpring = 0.1; 
    this.pointerDamping = 0.75; 
    
    this.shakeIntensity = 0;
    this.rotAngle1 = 0;
    this.rotAngle2 = 0;
  }

  initPoints() {
    this.points = [];
    for (let i = 0; i <= this.segments; i++) {
      let t = i / this.segments;
      let angle = lerp(ARC_START, ARC_END, t);
      this.points.push({
        angle: angle, offset: 0, velocity: 0, elasticity: 0.9, damping: 0.9     
      });
    }
  }

  update() {
    let force = (this.targetPointerAngle - this.pointerAngle) * this.pointerSpring;
    this.pointerVelocity += force;
    this.pointerVelocity *= this.pointerDamping; 
    this.pointerAngle += this.pointerVelocity;
    
    let tension = 0.2; 
    for (let i = 1; i < this.points.length - 1; i++) {
      let prev = this.points[i-1];
      let curr = this.points[i];
      let next = this.points[i+1];
      let neighborForce = (prev.offset + next.offset - 2 * curr.offset) * tension;
      curr.velocity += neighborForce;
    }

    for (let p of this.points) {
      let restoration = -p.offset * 0.1; 
      p.velocity += restoration;
      p.velocity *= p.damping;
      p.offset += p.velocity;
    }
    
    this.colorLerpAmt *= 0.85;
    this.shakeIntensity *= 0.8;
    if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
    
    this.rotAngle1 += 0.002;
    this.rotAngle2 -= 0.005;
    
    for (let particle of magneticParticles) {
      particle.update(this.x, this.y, this.pointerAngle, this.shakeIntensity, magneticParticles);
    }
  }

  updatePointerByPressure(pressure) {
    let p = constrain(pressure, 0, MAX_PRESSURE);
    this.targetPointerAngle = map(p, 0, MAX_PRESSURE, ARC_START, ARC_END);
  }

  triggerVibration(index) {
    let step = TOTAL_ARC / 9;
    let targetAngle = ARC_START + step * index + step / 2;
    this.colorLerpAmt = 1.0;
    this.shakeIntensity = 20; 
    
    for (let p of this.points) {
      let dist = abs(angleDiff(p.angle, targetAngle));
      if (dist < step * 1.5) {
        let force = map(dist, 0, step * 1.5, 1, 0);
        force = pow(force, 2); 
        p.velocity += force * 20; 
      }
    }
  }

  display() {
    push();
    translate(this.x, this.y);
    blendMode(ADD);
    
    this.drawOuterRings();
    
    let c = lerpColor(this.baseColor, this.flashColor, this.colorLerpAmt);
    stroke(c);
    strokeWeight(6); 
    strokeCap(ROUND); 
    noFill();
    
    beginShape();
    for (let p of this.points) {
      let noiseVal = random(-1, 1) * this.shakeIntensity * 0.5;
      let r = this.radius + p.offset + noiseVal;
      vertex(cos(p.angle) * r, sin(p.angle) * r);
    }
    endShape();
    
    strokeWeight(1);
    stroke(red(c), green(c), blue(c), 150);
    let step = TOTAL_ARC / 9;
    for (let i = 0; i <= 9; i++) {
      let angle = ARC_START + i * step;
      let r1 = this.radius - 8;
      let r2 = this.radius + 8;
      line(cos(angle) * r1, sin(angle) * r1, cos(angle) * r2, sin(angle) * r2);
      
      if (i < 9) {
        let numAngle = angle + step/2;
        let numR = this.radius - 30;
        let distToPtr = abs(angleDiff(numAngle, this.pointerAngle));
        let isActive = distToPtr < step/2;
        if (isActive) { fill(255, 255, 200); textSize(16); } 
        else { fill(255, 100); textSize(11); }
        noStroke();
        textAlign(CENTER, CENTER);
        text(i + 1, cos(numAngle) * numR, sin(numAngle) * numR);
        stroke(red(c), green(c), blue(c), 150); 
      }
    }
    this.drawPointer();
    blendMode(BLEND); 
    pop();
  }
  
  drawOuterRings() {
    let baseAlpha = 100 + this.shakeIntensity * 5; 
    
    push();
    rotate(this.rotAngle1);
    noFill();
    stroke(100, 200, 255, baseAlpha * 0.5);
    strokeWeight(2);
    let r1 = this.radius + 35;
    let dashCount = 12;
    for(let i=0; i<dashCount; i++) {
        let start = map(i, 0, dashCount, 0, TWO_PI);
        let end = start + 0.3;
        arc(0, 0, r1*2, r1*2, start, end);
    }
    pop();
    
    push();
    rotate(this.rotAngle2);
    noFill();
    stroke(255, 200, 100, baseAlpha * 0.3);
    strokeWeight(1);
    let r2 = this.radius + 50;
    arc(0, 0, r2*2, r2*2, 0, PI); 
    arc(0, 0, r2*2, r2*2, PI + 0.5, TWO_PI - 0.5); 
    pop();
    
    push();
    stroke(255, 255, 255, 30);
    strokeWeight(2);
    let r3 = this.radius + 65;
    let pulse = this.shakeIntensity * 0.5; 
    for(let i=0; i<36; i++) {
        let a = map(i, 0, 36, 0, TWO_PI);
        let x1 = cos(a) * (r3 + pulse);
        let y1 = sin(a) * (r3 + pulse);
        let x2 = cos(a) * (r3 + 5 + pulse);
        let y2 = sin(a) * (r3 + 5 + pulse);
        line(x1, y1, x2, y2);
    }
    pop();
  }
  
  drawPointer() {
    push();
    rotate(this.pointerAngle);
    fill(255, 50, 50, 200);
    noStroke();
    beginShape();
    vertex(this.radius - 10, 0); vertex(0, 5); vertex(-15, 0); vertex(0, -5);
    endShape(CLOSE);
    fill(200); ellipse(0, 0, 8, 8);
    fill(50); ellipse(0, 0, 3, 3);
    pop();
  }
}

// --- 粒子系统 ---
class MagneticParticle {
  constructor(startX, startY, startVel) {
    if (startX !== undefined) {
      this.pos = createVector(startX, startY);
      this.vel = startVel;
      this.acc = createVector(0, 0);
      this.baseAlpha = 255; 
      this.size = random(3, 6); 
      this.isDebris = true; 
    } else {
      this.resetPosition();
    }
  }
  
  resetPosition() {
    let angle = random(TWO_PI);
    let dist = random(200, width);
    this.pos = createVector(width/2 + cos(angle)*dist, height/2 + sin(angle)*dist);
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.baseAlpha = random(50, 150);
    this.size = random(2, 4);
    this.isDebris = false;
  }
  
  update(cx, cy, ptrAngle, shake, allParticles) {
    let target = createVector(cx + cos(ptrAngle)*130, cy + sin(ptrAngle)*130);
    if (shake > 2) {
      let dir = p5.Vector.sub(target, this.pos);
      let d = dir.mag();
      dir.normalize(); dir.mult(shake * 0.15); 
      this.acc.add(dir);
    }
    let separationRadius = 20; 
    let steer = createVector(0, 0);
    let count = 0;
    for (let other of allParticles) {
      let d = p5.Vector.dist(this.pos, other.pos);
      if (d > 0 && d < separationRadius) {
        let diff = p5.Vector.sub(this.pos, other.pos);
        diff.normalize(); diff.div(d); 
        steer.add(diff); count++;
      }
    }
    if (count > 0) { steer.div(count); steer.setMag(0.5); this.acc.add(steer); }

    this.vel.add(this.acc);
    this.vel.mult(0.94); 
    this.vel.add(p5.Vector.random2D().mult(0.05)); 
    this.pos.add(this.vel);
    this.acc.mult(0); 
    if (this.isDebris && this.baseAlpha > 150) { this.baseAlpha -= 2; }
    if (this.pos.x < 0 || this.pos.x > width || this.pos.y < 0 || this.pos.y > height) { this.resetPosition(); }
  }
  
  display() {
    noStroke();
    let speed = this.vel.mag();
    let alpha = this.baseAlpha + speed * 30;
    if (this.isDebris && this.baseAlpha > 160) { fill(255, 200, 200, alpha); } 
    else { fill(200, 220, 255, alpha); }
    ellipse(this.pos.x, this.pos.y, this.size, this.size);
  }
}

// --- 串口通信逻辑 ---
function setupSerial() {
  try {
    serial = new p5.SerialPort();
    serial.on('data', serialData);
    serial.on('error', function(err) { console.log("Serial Error: " + err); });
    serial.open('COM3'); 
  } catch(e) {
    console.log("Serial library not present");
  }
}

function serialData() {
  let data = serial.readStringUntil('\r\n');
  if (data && data.length > 0) {
    pressureValue = int(data.trim());
    handlePressureInput(pressureValue);
  }
}

// --- 输入处理逻辑 ---
function handlePressureInput(pressure) {
  centerRing.updatePointerByPressure(pressure);
  let index = -1;
  
  if (pressure > 20) { 
    index = floor(map(pressure, 20, MAX_PRESSURE, 0, 9));
    index = constrain(index, 0, 8);
  } else {
    lastTriggeredIndex = -1;
  }

  if (index !== -1 && millis() - lastNoteTime > noteCooldown) {
    triggerAction(index);
    lastNoteTime = millis();
  }
}

// --- 触发动作逻辑 ---
function triggerAction(index) {
  if (rhythmGame.isPlaying) {
    // 游戏模式：击中才发声
    let isHit = rhythmGame.checkHit(index);
    if (isHit) {
      playNote(index);
      centerRing.triggerVibration(index);
    }
  } else {
    // 待机模式：变化才发声
    if (index !== lastTriggeredIndex) {
      playNote(index);
      centerRing.triggerVibration(index);
      lastTriggeredIndex = index; 
    }
  }
}

// --- 主程序 ---
function setup() {
  createCanvas(800, 600);
  centerRing = new CenterRing();
  rhythmGame = new RhythmGame();
  initSounds();
  setupSerial(); 
  
  for (let i = 0; i < 200; i++) {
    magneticParticles.push(new MagneticParticle());
  }
}

function draw() {
  background(15, 20, 30); 
  if (magneticParticles.length > 500) {
      magneticParticles.splice(0, magneticParticles.length - 500);
  }
  for (let p of magneticParticles) { p.display(); }
  
  centerRing.update();
  centerRing.display();
  
  push();
  translate(width/2, height/2);
  for(let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].update(); explosions[i].display();
    if(explosions[i].life <= 0) { explosions.splice(i, 1); }
  }
  pop();
  
  rhythmGame.update();
  rhythmGame.display();
  
  fill(255, 150);
  noStroke();
  textAlign(RIGHT, TOP);
  text("Pressure: " + pressureValue, width - 10, 10);
}

function keyPressed() {
  if (key === 'g' || key === 'G') {
    if (rhythmGame.isPlaying) rhythmGame.stop();
    else rhythmGame.start();
    return;
  }
  
  if (key === 'r' || key === 'R') {
    isRandomMode = !isRandomMode;
    rhythmGame.songIndex = 0; 
    return;
  }
  
  if (key === 's' || key === 'S') {
    if (!isRandomMode) {
      currentSongIndex = (currentSongIndex + 1) % SONGS.length;
      rhythmGame.songIndex = 0; 
      rhythmGame.obstacles = []; 
    }
    return;
  }
  
  // --- 新增：速度调节 ---
  if (keyCode === 'q'
     
     ) {
    rhythmGame.speed = constrain(rhythmGame.speed + 0.5, 1.0, 8.0);
  }
  if (keyCode === 'w') {
    rhythmGame.speed = constrain(rhythmGame.speed - 0.5, 1.0, 8.0);
  }
  // -------------------
  
  if (key >= '1' && key <= '9') {
    let index = int(key) - 1;
    let simulatedPressure = map(index, 0, 8, 50, MAX_PRESSURE);
    centerRing.updatePointerByPressure(simulatedPressure);
    triggerAction(index);
  }
  if (key === 'm' || key === 'M') octaveOffset = -1;
  if (key === 'n' || key === 'N') octaveOffset = 1;
}

function keyReleased() {
  if (key === 'm' || key === 'M' || key === 'n' || key === 'N') octaveOffset = 0;
  if (key >= '1' && key <= '9') {
     centerRing.updatePointerByPressure(0);
     lastTriggeredIndex = -1; 
  }
}

// --- 声音系统 ---
function initSounds() {
  notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33];
  osc = new p5.Oscillator('sine');
  envelope = new p5.Envelope();
  envelope.setADSR(0.005, 0.05, 0.2, 0.4); 
  envelope.setRange(0.6, 0);
  osc.amp(envelope);
  osc.start();
}

function playNote(index) {
  if (index >= 0 && index < notes.length) {
    let freq = notes[index] * Math.pow(2, octaveOffset);
    osc.freq(freq);
    envelope.play();
  }
}
