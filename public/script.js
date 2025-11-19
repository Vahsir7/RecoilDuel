// public/script.js
const socket = io();

let myPlayerId = null;
let currentRoomCode = null;
let localPlayer = null;
let opponentPlayer = null;
let rematchVoteSent = false;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const game = {
    width: canvas.width,
    height: canvas.height,
    running: false
};

const playerScores = { 1: 0, 2: 0 };
let countdownTimer = null;
const countdownSteps = ['3', '2', '1', 'GO!'];

class Player {
    constructor(x, y, color, id) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.angle = 0;
        this.angularVelocity = 0;
        this.radius = 25;
        this.color = color;
        this.id = id;
        this.bullets = [];
        this.canShoot = true;
        this.shootCooldown = 500;
        this.hits = 0;
        this.score = 0;
        this.hasShot = false;
    }

    shoot() {
        if (!this.canShoot || !game.running) return;

        const isFlare = !this.hasShot;
        this.hasShot = true;

        const bulletSpeed = 8;
        const bullet = {
            x: this.x + Math.cos(this.angle) * (this.radius + 5),
            y: this.y + Math.sin(this.angle) * (this.radius + 5),
            vx: Math.cos(this.angle) * bulletSpeed,
            vy: Math.sin(this.angle) * bulletSpeed,
            radius: 4,
            life: 150,
            isFlare: isFlare
        };
        this.bullets.push(bullet);

        const recoilForce = 3.5;
        this.vx -= Math.cos(this.angle) * recoilForce;
        this.vy -= Math.sin(this.angle) * recoilForce;
        this.angularVelocity += (Math.random() - 0.5) * 0.3;

        this.canShoot = false;
        setTimeout(() => {
            this.canShoot = true;
        }, this.shootCooldown);

        if (this === localPlayer) {
            socket.emit('shoot', {
                angle: this.angle,
                isFlare: isFlare
            });
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        const rotationSpeed = 0.02;
        this.angle += rotationSpeed;
        this.angle += this.angularVelocity;

        this.vx *= 0.995;
        this.vy *= 0.995;
        this.angularVelocity *= 0.95;

        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx = Math.abs(this.vx) * 0.8;
            this.angularVelocity += this.vy * 0.02;
        }
        if (this.x + this.radius > game.width) {
            this.x = game.width - this.radius;
            this.vx = -Math.abs(this.vx) * 0.8;
            this.angularVelocity -= this.vy * 0.02;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy = Math.abs(this.vy) * 0.8;
            this.angularVelocity -= this.vx * 0.02;
        }
        if (this.y + this.radius > game.height) {
            this.y = game.height - this.radius;
            this.vy = -Math.abs(this.vy) * 0.8;
            this.angularVelocity += this.vx * 0.02;
        }

        this.bullets = this.bullets.filter(bullet => {
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;

            return bullet.life > 0 && 
                   bullet.x > 0 && bullet.x < game.width &&
                   bullet.y > 0 && bullet.y < game.height;
        });

        if (this === localPlayer) {
            socket.emit('playerState', {
                x: this.x,
                y: this.y,
                vx: this.vx,
                vy: this.vy,
                angle: this.angle,
                angularVelocity: this.angularVelocity
            });
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.rect(0, -4, this.radius + 10, 8);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();

        ctx.restore();

        this.bullets.forEach(bullet => {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            ctx.fillStyle = bullet.isFlare ? '#ffd700' : this.color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        if (!this.canShoot) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }
    }

    registerHit() {
        this.hits++;
        this.score += 100;
        playerScores[this.id] = this.score;
        updateScoreboard();
        
        if (this.hits >= 2) {
            endGame(this);
        }
    }
}

socket.on('connect', () => {
    console.log('Connected to server');
    showStatus('connectionStatus', 'Connected to server', false);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showStatus('connectionStatus', 'Disconnected from server', true);
});

socket.on('roomCreated', (data) => {
    currentRoomCode = data.roomCode;
    myPlayerId = data.playerId;
    document.getElementById('roomCode').textContent = data.roomCode;
    document.getElementById('roomCodeDisplay').classList.remove('hidden');
    showStatus('createStatus', 'Room created! Share this code with your friend.', false);
});

socket.on('roomJoined', (data) => {
    currentRoomCode = data.roomCode;
    myPlayerId = data.playerId;
    showStatus('joinStatus', 'Joined room! Starting game...', false);
});

socket.on('playerJoined', () => {
    showStatus('createStatus', 'Player 2 joined! Starting game...', false);
});

socket.on('gameStart', () => {
    startGame();
});

socket.on('opponentShoot', (data) => {
    if (opponentPlayer) {
        opponentPlayer.angle = data.angle;
        opponentPlayer.shoot();
    }
});

socket.on('opponentState', (data) => {
    if (opponentPlayer) {
        opponentPlayer.x = data.x;
        opponentPlayer.y = data.y;
        opponentPlayer.vx = data.vx;
        opponentPlayer.vy = data.vy;
        opponentPlayer.angle = data.angle;
        opponentPlayer.angularVelocity = data.angularVelocity;
    }
});

socket.on('hitRegistered', (data) => {
    updateScoreboard();
});

socket.on('gameEnded', (data) => {
    // Fix: prevent infinite loop by passing flag
    endGame(data.winnerId === myPlayerId ? localPlayer : opponentPlayer, true);
});

socket.on('opponentDisconnected', () => {
    alert('Opponent disconnected!');
    leaveGame();
});

socket.on('error', (message) => {
    showStatus('joinStatus', message, true);
});

socket.on('rematchVoteUpdate', (data) => {
    if (!data) return;
    const btn = document.getElementById('playAgainBtn');

    switch (data.type) {
        case 'waiting':
            updateRematchStatus(data.message || 'Waiting for opponent to accept...');
            break;
        case 'opponent-voted':
            rematchVoteSent = false;
            if (btn) btn.disabled = false;
            updateRematchStatus(data.message || 'Opponent wants a rematch!');
            break;
        case 'accepted':
            if (btn) btn.disabled = true;
            updateRematchStatus(data.message || 'Both players agreed. Restarting...');
            break;
        case 'error':
        default:
            rematchVoteSent = false;
            if (btn) btn.disabled = false;
            updateRematchStatus(data.message || 'Unable to start rematch.', 'error');
            break;
    }
});

function showCreateRoom() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('createRoomScreen').classList.remove('hidden');
}

function showJoinRoom() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('joinRoomScreen').classList.remove('hidden');
}

function backToMenu() {
    document.getElementById('createRoomScreen').classList.add('hidden');
    document.getElementById('joinRoomScreen').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    document.getElementById('roomCodeDisplay').classList.add('hidden');
}

function createRoom() {
    socket.emit('createRoom');
}

function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (roomCode.length !== 6) {
        showStatus('joinStatus', 'Please enter a valid 6-character room code', true);
        return;
    }
    socket.emit('joinRoom', roomCode);
}

function showStatus(elementId, message, isError) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.remove('hidden');
    if (isError) {
        element.classList.add('error-message');
        element.classList.remove('status-message');
    } else {
        element.classList.add('status-message');
        element.classList.remove('error-message');
    }
}

function clearCountdown() {
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }

    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.classList.add('hidden');
        countdownElement.textContent = '';
    }
}

function startCountdown(onComplete) {
    clearCountdown();
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) {
        if (onComplete) onComplete();
        return;
    }

    let stepIndex = 0;
    countdownElement.textContent = countdownSteps[stepIndex];
    countdownElement.classList.remove('hidden');

    const advance = () => {
        if (stepIndex >= countdownSteps.length - 1) {
            countdownTimer = setTimeout(() => {
                countdownElement.classList.add('hidden');
                countdownElement.textContent = '';
                countdownTimer = null;
                if (onComplete) onComplete();
            }, 600);
            return;
        }

        stepIndex++;
        countdownElement.textContent = countdownSteps[stepIndex];
        countdownTimer = setTimeout(advance, 700);
    };

    countdownTimer = setTimeout(advance, 700);
}

function updateRematchStatus(message, state = 'info') {
    const statusEl = document.getElementById('rematchStatus');
    if (!statusEl) return;

    if (!message) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
        return;
    }

    statusEl.textContent = message;
    statusEl.classList.remove('hidden');

    if (state === 'error') {
        statusEl.classList.add('error-message');
        statusEl.classList.remove('status-message');
    } else {
        statusEl.classList.add('status-message');
        statusEl.classList.remove('error-message');
    }
}

function resetRematchUI() {
    rematchVoteSent = false;
    const btn = document.getElementById('playAgainBtn');
    if (btn) btn.disabled = false;
    updateRematchStatus('');
}

function startGame() {
    if (localPlayer) {
        playerScores[localPlayer.id] = localPlayer.score;
    }
    if (opponentPlayer) {
        playerScores[opponentPlayer.id] = opponentPlayer.score;
    }

    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('createRoomScreen').classList.add('hidden');
    document.getElementById('joinRoomScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    // Ensure the game-over overlay is hidden when a new game starts
    document.getElementById('gameOver').classList.remove('show');
    resetRematchUI();
    clearCountdown();
    const playAgainBtn = document.getElementById('playAgainBtn');
    if (playAgainBtn) playAgainBtn.disabled = false;

    document.getElementById('playerRole').textContent = `You are Player ${myPlayerId}`;

    if (myPlayerId === 1) {
        localPlayer = new Player(200, 300, '#32b8c6', 1);
        opponentPlayer = new Player(600, 300, '#e68161', 2);
    } else {
        localPlayer = new Player(600, 300, '#e68161', 2);
        opponentPlayer = new Player(200, 300, '#32b8c6', 1);
    }

    const angle1 = Math.random() * Math.PI * 2;
    const speed1 = 2 + Math.random() * 2;
    localPlayer.vx = Math.cos(angle1) * speed1;
    localPlayer.vy = Math.sin(angle1) * speed1;
    localPlayer.angle = Math.random() * Math.PI * 2;

    const angle2 = Math.random() * Math.PI * 2;
    const speed2 = 2 + Math.random() * 2;
    opponentPlayer.vx = Math.cos(angle2) * speed2;
    opponentPlayer.vy = Math.sin(angle2) * speed2;
    opponentPlayer.angle = Math.random() * Math.PI * 2;
    // ... (continuation of startGame function)
    game.running = false;
    updateScoreboard();

    startCountdown(() => {
        game.running = true;
    });
}

function leaveGame() {
    game.running = false;
    clearCountdown();
    resetRematchUI();
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('gameOver').classList.remove('show');
    document.getElementById('mainMenu').classList.remove('hidden');
    currentRoomCode = null;
    myPlayerId = null;
    localPlayer = null;
    opponentPlayer = null;
    playerScores[1] = 0;
    playerScores[2] = 0;
}

// --- INPUT HANDLING (Keyboard + Touch) ---

// Keyboard: Spacebar to shoot
document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && localPlayer && game.running) {
        e.preventDefault();
        localPlayer.shoot();
    }
});

// Mobile/Mouse: Tap or Click canvas to shoot
function handleTap(e) {
    if (localPlayer && game.running) {
        // Prevent default browser zooming/scrolling behavior on taps
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
        localPlayer.shoot();
    }
}

// Add listeners to the canvas
canvas.addEventListener('touchstart', handleTap, { passive: false });
canvas.addEventListener('mousedown', handleTap);

// -----------------------------------------

function checkCollisions() {
    if (!localPlayer || !opponentPlayer) return;

    const dx = opponentPlayer.x - localPlayer.x;
    const dy = opponentPlayer.y - localPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = localPlayer.radius + opponentPlayer.radius;
    
    if (distance < minDistance) {
        const nx = dx / distance;
        const ny = dy / distance;
        
        const overlap = minDistance - distance;
        localPlayer.x -= nx * overlap * 0.5;
        localPlayer.y -= ny * overlap * 0.5;
        opponentPlayer.x += nx * overlap * 0.5;
        opponentPlayer.y += ny * overlap * 0.5;
        
        const dvx = opponentPlayer.vx - localPlayer.vx;
        const dvy = opponentPlayer.vy - localPlayer.vy;
        const dvn = dvx * nx + dvy * ny;
        
        if (dvn < 0) {
            const restitution = 0.8;
            const impulse = -(1 + restitution) * dvn / 2;
            
            localPlayer.vx -= impulse * nx;
            localPlayer.vy -= impulse * ny;
            opponentPlayer.vx += impulse * nx;
            opponentPlayer.vy += impulse * ny;
            
            localPlayer.angularVelocity += (Math.random() - 0.5) * 0.3;
            opponentPlayer.angularVelocity += (Math.random() - 0.5) * 0.3;
        }
    }
    
    localPlayer.bullets.forEach((bullet, index) => {
        if (bullet.isFlare) return;
        
        const dx = bullet.x - opponentPlayer.x;
        const dy = bullet.y - opponentPlayer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < bullet.radius + opponentPlayer.radius) {
            localPlayer.bullets.splice(index, 1);
            localPlayer.registerHit();
            
            opponentPlayer.vx += bullet.vx * 0.5;
            opponentPlayer.vy += bullet.vy * 0.5;
            opponentPlayer.angularVelocity += (Math.random() - 0.5) * 0.5;
            
            socket.emit('hit', { 
                shooterId: myPlayerId,
                hitPlayerId: opponentPlayer.id 
            });
        }
    });

    opponentPlayer.bullets.forEach((bullet, index) => {
        if (bullet.isFlare) return;
        
        const dx = bullet.x - localPlayer.x;
        const dy = bullet.y - localPlayer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < bullet.radius + localPlayer.radius) {
            opponentPlayer.bullets.splice(index, 1);
            opponentPlayer.registerHit();
            
            localPlayer.vx += bullet.vx * 0.5;
            localPlayer.vy += bullet.vy * 0.5;
            localPlayer.angularVelocity += (Math.random() - 0.5) * 0.5;
        }
    });
}

function updateScoreboard() {
    if (!localPlayer || !opponentPlayer) return;
    
    if (myPlayerId === 1) {
        document.getElementById('p1Score').textContent = localPlayer.score;
        document.getElementById('p2Score').textContent = opponentPlayer.score;
        document.getElementById('p1Hits').textContent = `Hits: ${localPlayer.hits}/2`;
        document.getElementById('p2Hits').textContent = `Hits: ${opponentPlayer.hits}/2`;
    } else {
        document.getElementById('p1Score').textContent = opponentPlayer.score;
        document.getElementById('p2Score').textContent = localPlayer.score;
        document.getElementById('p1Hits').textContent = `Hits: ${opponentPlayer.hits}/2`;
        document.getElementById('p2Hits').textContent = `Hits: ${localPlayer.hits}/2`;
    }
}

// UPDATED: endGame function with Replay Loop Fix
function endGame(winner, fromServer = false) {
    game.running = false;
    const isLocalWinner = winner === localPlayer;
    document.getElementById('winnerText').textContent = isLocalWinner ? 'You Win!' : 'You Lose!';
    document.getElementById('gameOver').classList.add('show');
    resetRematchUI();
    updateRematchStatus('Press Play Again for a rematch vote.');
    
    // Only emit if we are the winner and this call didn't come from the server
    if (isLocalWinner && !fromServer) {
        socket.emit('gameOver', { winnerId: myPlayerId });
    }
}

function requestRematch() {
    if (!currentRoomCode) {
        leaveGame();
        return;
    }

    if (rematchVoteSent) return;

    rematchVoteSent = true;

    const btn = document.getElementById('playAgainBtn');
    if (btn) btn.disabled = true;

    updateRematchStatus('Waiting for opponent to accept...');
    socket.emit('requestRematch');
}

function gameLoop() {
    // Fill background
    ctx.fillStyle = '#262828';
    ctx.fillRect(0, 0, game.width, game.height);

    if (localPlayer && opponentPlayer) {
        if (game.running) {
            localPlayer.update();
            opponentPlayer.update();
            checkCollisions();
        }

        localPlayer.draw();
        opponentPlayer.draw();
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();