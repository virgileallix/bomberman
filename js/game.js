import { NetworkManager } from './network.js';
import { Renderer } from './renderer.js';
import { Player } from './player.js';
import { Bomb, Explosion, PowerUp } from './bomb.js';

/**
 * Game Manager - Main game logic and state management
 */
class GameManager {
    constructor() {
        this.network = null;
        this.renderer = null;
        this.roomCode = null;

        // Game state
        this.grid = [];
        this.players = new Map();
        this.bombs = new Map();
        this.explosions = [];
        this.powerups = new Map();

        // Local player
        this.localPlayerId = null;
        this.localPlayer = null;

        // Game settings
        this.gridWidth = 15;
        this.gridHeight = 13;
        this.gameStartTime = null;
        this.gameDuration = 300; // seconds
        this.gameRunning = false;

        // Input
        this.keys = {};
        this.lastMoveTime = 0;
        this.moveDelay = 150; // ms between moves

        // Game loop
        this.lastFrameTime = 0;
        this.animationFrame = null;

        this.init();
    }

    async init() {
        // Get room code from URL
        const params = new URLSearchParams(window.location.search);
        this.roomCode = params.get('room');

        if (!this.roomCode) {
            alert('No room code provided');
            window.location.href = 'index.html';
            return;
        }

        // Wait for Firebase
        await this.waitForFirebase();

        // Initialize network
        this.network = new NetworkManager(window.database, window.firestore);
        await this.network.initialize();
        this.localPlayerId = this.network.getUserId();

        // Initialize renderer
        const canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(canvas);

        // Setup game
        await this.setupGame();
        this.setupInput();
        this.setupUI();

        // Start game loop
        this.startGameLoop();
    }

    async waitForFirebase() {
        let attempts = 0;
        while (!window.database || !window.firestore) {
            if (attempts++ > 50) throw new Error('Firebase not loaded');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async setupGame() {
        // Listen to game state
        this.network.listenToGameState(this.roomCode, (gameState) => {
            this.syncGameState(gameState);
        });

        // Listen to room for game settings and player list
        this.network.listenToRoom(this.roomCode, (room) => {
            if (!room) {
                alert('Room closed');
                window.location.href = 'index.html';
                return;
            }

            if (room.status === 'waiting') {
                alert('Game not started yet');
                window.location.href = 'index.html';
                return;
            }

            if (room.status === 'finished') {
                this.endGame();
                return;
            }

            // Initialize game if not running
            if (!this.gameRunning) {
                this.startGame(room);
            }
        });
    }

    startGame(room) {
        console.log('Starting game...');

        this.gameRunning = true;
        this.gameDuration = room.settings.duration;
        this.gameStartTime = Date.now();

        // Generate grid
        this.generateGrid(room.settings.map);

        // Initialize players
        const playerList = Object.values(room.players);
        const spawnPoints = this.getSpawnPoints();

        playerList.forEach((playerData, index) => {
            const spawn = spawnPoints[index];
            const player = new Player(
                playerData.id,
                playerData.username,
                spawn.x,
                spawn.y,
                playerData.colorIndex
            );

            this.players.set(player.id, player);

            if (player.id === this.localPlayerId) {
                this.localPlayer = player;
            }
        });

        // Update HUD
        this.updatePlayersHUD();
    }

    generateGrid(mapType) {
        // Initialize empty grid
        this.grid = Array(this.gridHeight).fill(null).map(() =>
            Array(this.gridWidth).fill(0)
        );

        // Add perimeter walls
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (x === 0 || x === this.gridWidth - 1 || y === 0 || y === this.gridHeight - 1) {
                    this.grid[y][x] = 1; // Wall
                }
            }
        }

        // Add internal walls (grid pattern)
        for (let y = 2; y < this.gridHeight - 2; y += 2) {
            for (let x = 2; x < this.gridWidth - 2; x += 2) {
                this.grid[y][x] = 1;
            }
        }

        // Add destructible crates
        const spawnSafeZones = this.getSpawnPoints();

        for (let y = 1; y < this.gridHeight - 1; y++) {
            for (let x = 1; x < this.gridWidth - 1; x++) {
                if (this.grid[y][x] !== 0) continue;

                // Don't place crates in spawn zones
                let inSafeZone = false;
                for (const spawn of spawnSafeZones) {
                    if (Math.abs(x - spawn.x) <= 1 && Math.abs(y - spawn.y) <= 1) {
                        inSafeZone = true;
                        break;
                    }
                }

                if (!inSafeZone && Math.random() < 0.7) {
                    this.grid[y][x] = 2; // Destructible
                }
            }
        }
    }

    getSpawnPoints() {
        // Corner spawn points
        return [
            { x: 1, y: 1 },           // Top-left
            { x: this.gridWidth - 2, y: 1 },           // Top-right
            { x: 1, y: this.gridHeight - 2 },          // Bottom-left
            { x: this.gridWidth - 2, y: this.gridHeight - 2 }  // Bottom-right
        ];
    }

    setupInput() {
        // Keyboard input
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;

            // Space to place bomb
            if (e.key === ' ') {
                e.preventDefault();
                this.placeBomb();
            }

            // E to open emote menu
            if (e.key === 'e' || e.key === 'E') {
                this.toggleEmoteMenu();
            }

            // Escape to open pause menu
            if (e.key === 'Escape') {
                this.togglePauseMenu();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Emote buttons
        document.querySelectorAll('.emote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emote = btn.dataset.emote;
                this.showEmote(emote);
                this.toggleEmoteMenu();
            });
        });

        // Menu buttons
        document.getElementById('menuBtn').addEventListener('click', () => this.togglePauseMenu());
        document.getElementById('resumeBtn').addEventListener('click', () => this.togglePauseMenu());
        document.getElementById('quitBtn').addEventListener('click', () => this.quitGame());
        document.getElementById('backToLobbyBtn').addEventListener('click', () => this.backToLobby());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain());
    }

    setupUI() {
        // Timer will be updated in game loop
    }

    startGameLoop() {
        this.lastFrameTime = performance.now();

        const loop = (currentTime) => {
            const deltaTime = (currentTime - this.lastFrameTime) / 1000; // seconds
            this.lastFrameTime = currentTime;

            this.update(deltaTime);
            this.render();

            this.animationFrame = requestAnimationFrame(loop);
        };

        this.animationFrame = requestAnimationFrame(loop);
    }

    update(deltaTime) {
        if (!this.gameRunning || !this.localPlayer) return;

        // Handle input
        this.handleInput();

        // Update players
        this.players.forEach(player => player.update(deltaTime));

        // Update bombs
        const bombsToExplode = [];
        this.bombs.forEach((bomb, id) => {
            const shouldExplode = bomb.update(deltaTime);
            if (shouldExplode) {
                bombsToExplode.push(id);
            }
        });

        // Explode bombs
        bombsToExplode.forEach(bombId => {
            this.explodeBomb(bombId);
        });

        // Update explosions
        this.explosions = this.explosions.filter(explosion => {
            const expired = explosion.update(deltaTime);
            return !expired;
        });

        // Update power-ups
        this.powerups.forEach(powerup => powerup.update(deltaTime));

        // Check power-up collection
        this.checkPowerUpCollection();

        // Update timer
        this.updateTimer();

        // Check game end
        this.checkGameEnd();
    }

    handleInput() {
        const now = Date.now();
        if (now - this.lastMoveTime < this.moveDelay) return;

        let moved = false;

        if (this.keys['w'] || this.keys['arrowup']) {
            moved = this.localPlayer.move('up', this.grid, this.renderer.tileSize);
        } else if (this.keys['s'] || this.keys['arrowdown']) {
            moved = this.localPlayer.move('down', this.grid, this.renderer.tileSize);
        } else if (this.keys['a'] || this.keys['arrowleft']) {
            moved = this.localPlayer.move('left', this.grid, this.renderer.tileSize);
        } else if (this.keys['d'] || this.keys['arrowright']) {
            moved = this.localPlayer.move('right', this.grid, this.renderer.tileSize);
        }

        if (moved) {
            this.lastMoveTime = now;
            // Sync with server
            this.network.updatePlayerPosition(this.roomCode, this.localPlayer.serialize());
        }
    }

    async placeBomb() {
        if (!this.localPlayer || !this.localPlayer.canPlaceBomb()) return;

        // Check if there's already a bomb at this position
        for (const bomb of this.bombs.values()) {
            if (bomb.isAtPosition(this.localPlayer.gridX, this.localPlayer.gridY)) {
                return;
            }
        }

        const bombData = this.localPlayer.placeBomb();
        if (bombData) {
            const bomb = new Bomb(
                bombData.x,
                bombData.y,
                bombData.playerId,
                bombData.range
            );

            this.bombs.set(bomb.id, bomb);
            this.grid[bomb.y][bomb.x] = 3; // Mark grid as having bomb

            // Sync with server
            await this.network.placeBomb(this.roomCode, bomb.serialize());
        }
    }

    async explodeBomb(bombId) {
        const bomb = this.bombs.get(bombId);
        if (!bomb) return;

        // Get explosion data
        const explosionData = bomb.explode(this.grid);
        if (!explosionData) return;

        // Remove bomb
        this.bombs.delete(bombId);
        this.grid[Math.round(bomb.y)][Math.round(bomb.x)] = 0;

        // Notify owner that bomb exploded
        const player = this.players.get(bomb.playerId);
        if (player) {
            player.bombExploded();
        }

        // Create explosion effects
        explosionData.explosions.forEach(expl => {
            this.explosions.push(new Explosion(expl.x, expl.y));

            // Destroy tiles
            if (this.grid[expl.y][expl.x] === 2) {
                this.grid[expl.y][expl.x] = 0;

                // Chance to spawn power-up
                if (Math.random() < 0.3) {
                    this.spawnPowerUp(expl.x, expl.y);
                }
            }

            // Kill players
            this.players.forEach(player => {
                if (player.isAtPosition(expl.x, expl.y)) {
                    if (player.kill()) {
                        // Award kill to bomb owner
                        if (player.id !== bomb.playerId) {
                            const killer = this.players.get(bomb.playerId);
                            if (killer) killer.kills++;
                        }
                        this.updatePlayersHUD();
                    }
                }
            });

            // Chain reaction - explode other bombs
            this.bombs.forEach((otherBomb, otherId) => {
                if (otherId !== bombId && otherBomb.isAtPosition(expl.x, expl.y)) {
                    // Explode after a short delay
                    setTimeout(() => this.explodeBomb(otherId), 100);
                }
            });
        });

        // Sync with server
        if (bomb.playerId === this.localPlayerId) {
            await this.network.triggerExplosion(this.roomCode, explosionData);
            await this.network.removeBomb(this.roomCode, bombId);
        }

        // Play sound (if implemented)
        this.playSound('explosion');
    }

    async spawnPowerUp(x, y) {
        const type = PowerUp.randomType();
        const powerup = new PowerUp(x, y, type);
        this.powerups.set(powerup.id, powerup);

        // Sync with server (if local player is host)
        // For simplicity, all players spawn their own power-ups
    }

    checkPowerUpCollection() {
        if (!this.localPlayer || !this.localPlayer.alive) return;

        this.powerups.forEach((powerup, id) => {
            if (powerup.x === this.localPlayer.gridX && powerup.y === this.localPlayer.gridY) {
                if (!powerup.collected) {
                    const type = powerup.collect();
                    if (type) {
                        this.localPlayer.applyPowerUp(type);
                        this.powerups.delete(id);
                        this.playSound('powerup');

                        // Sync with server
                        this.network.collectPowerUp(this.roomCode, id);
                    }
                }
            }
        });
    }

    syncGameState(gameState) {
        // Sync players from network (except local player)
        if (gameState.players) {
            Object.entries(gameState.players).forEach(([id, playerData]) => {
                if (id === this.localPlayerId) return; // Skip local player

                let player = this.players.get(id);
                if (!player) {
                    player = Player.deserialize(playerData);
                    this.players.set(id, player);
                } else {
                    // Update player state
                    Object.assign(player, playerData);
                }
            });
        }

        // Sync bombs from network
        if (gameState.bombs) {
            Object.entries(gameState.bombs).forEach(([id, bombData]) => {
                if (!this.bombs.has(id)) {
                    const bomb = Bomb.deserialize(bombData);
                    this.bombs.set(id, bomb);
                    this.grid[Math.round(bomb.y)][Math.round(bomb.x)] = 3;
                }
            });
        }

        // Sync power-ups
        if (gameState.powerups) {
            Object.entries(gameState.powerups).forEach(([id, powerupData]) => {
                if (!this.powerups.has(id)) {
                    const powerup = PowerUp.deserialize(powerupData);
                    this.powerups.set(id, powerup);
                }
            });
        }
    }

    updatePlayersHUD() {
        const hud = document.getElementById('playersStatus');
        hud.innerHTML = '';

        this.players.forEach(player => {
            const playerHud = document.createElement('div');
            playerHud.className = `player-hud ${player.alive ? 'alive' : 'dead'}`;

            const color = player.getColor();
            playerHud.innerHTML = `
                <div class="player-hud-avatar" style="background: ${color.main};">
                    ${player.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="player-hud-name">${player.username}</div>
                    <div class="player-hud-kills">💀 ${player.kills}</div>
                </div>
            `;

            hud.appendChild(playerHud);
        });
    }

    updateTimer() {
        if (!this.gameStartTime) return;

        const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const remaining = Math.max(0, this.gameDuration - elapsed);

        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        document.getElementById('gameTimer').textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (remaining === 0) {
            this.endGame();
        }
    }

    checkGameEnd() {
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);

        // End if only one player left or time's up
        if (alivePlayers.length <= 1) {
            setTimeout(() => this.endGame(), 1000);
        }
    }

    async endGame() {
        if (!this.gameRunning) return;

        this.gameRunning = false;

        // Determine winner
        const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);
        let winner = null;

        if (alivePlayers.length === 1) {
            winner = alivePlayers[0];
        } else {
            // Winner by most kills
            winner = Array.from(this.players.values()).reduce((prev, current) =>
                (prev.kills > current.kills) ? prev : current
            );
        }

        // Update stats
        if (this.localPlayer) {
            await this.network.updateStats(
                winner && winner.id === this.localPlayerId,
                this.localPlayer.kills,
                this.localPlayer.deaths
            );
        }

        // Show game over screen
        this.showGameOver(winner);
    }

    showGameOver(winner) {
        const modal = document.getElementById('gameOverModal');
        modal.classList.remove('hidden');

        document.getElementById('gameOverTitle').textContent =
            winner && winner.id === this.localPlayerId ? '🎉 Victory!' : 'Game Over';

        document.getElementById('winnerDisplay').textContent = `${winner.username} Wins!`;

        // Show scores
        const scoresEl = document.getElementById('finalScores');
        scoresEl.innerHTML = '';

        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => b.kills - a.kills);

        sortedPlayers.forEach((player, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = 'score-item';
            if (player.id === winner.id) scoreItem.classList.add('winner');

            scoreItem.innerHTML = `
                <span>#${index + 1} ${player.username}</span>
                <span>${player.kills} kills / ${player.deaths} deaths</span>
            `;

            scoresEl.appendChild(scoreItem);
        });
    }

    render() {
        if (!this.gameRunning) return;

        const gameState = {
            grid: this.grid,
            players: Array.from(this.players.values()),
            bombs: Array.from(this.bombs.values()),
            explosions: this.explosions,
            powerups: Array.from(this.powerups.values())
        };

        this.renderer.render(gameState);
    }

    toggleEmoteMenu() {
        const menu = document.getElementById('emotesMenu');
        menu.classList.toggle('hidden');
    }

    showEmote(emote) {
        if (this.localPlayer) {
            this.localPlayer.showEmote(emote);
        }
    }

    togglePauseMenu() {
        const menu = document.getElementById('pauseMenu');
        menu.classList.toggle('hidden');
    }

    quitGame() {
        this.network.leaveRoom(this.roomCode);
        window.location.href = 'index.html';
    }

    backToLobby() {
        window.location.href = 'index.html';
    }

    playAgain() {
        window.location.reload();
    }

    playSound(type) {
        // TODO: Implement sound effects
        console.log('Play sound:', type);
    }

    cleanup() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.network.removeAllListeners();
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.gameManager = new GameManager();
    });
} else {
    window.gameManager = new GameManager();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.gameManager) {
        window.gameManager.cleanup();
    }
});
