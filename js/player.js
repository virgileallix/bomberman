/**
 * Player Class - Represents a player in the Bomberman game
 */
export class Player {
    constructor(id, username, x, y, colorIndex = 0) {
        this.id = id;
        this.username = username;
        this.x = x;
        this.y = y;
        this.gridX = x;
        this.gridY = y;
        this.targetX = x;
        this.targetY = y;
        this.direction = 'down'; // up, down, left, right
        this.alive = true;
        this.colorIndex = colorIndex;

        // Player stats
        this.kills = 0;
        this.deaths = 0;

        // Movement
        this.speed = 2; // Base speed: 2 tiles per second
        this.moving = false;

        // Power-ups
        this.maxBombs = 1;
        this.currentBombs = 0;
        this.bombRange = 2;
        this.canKickBombs = false;
        this.invincible = false;
        this.invincibleUntil = 0;

        // Animation
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.15; // seconds per frame

        // Network
        this.lastUpdate = Date.now();
        this.interpolationDelay = 100; // ms

        // Emotes
        this.currentEmote = null;
        this.emoteTimer = 0;

        // Colors for different players
        this.colors = [
            { main: '#00f0ff', secondary: '#0080ff', name: 'Cyan' },
            { main: '#ff00ff', secondary: '#ff0080', name: 'Magenta' },
            { main: '#ffff00', secondary: '#ff8800', name: 'Yellow' },
            { main: '#00ff88', secondary: '#00ff00', name: 'Green' }
        ];
    }

    /**
     * Update player position with smooth interpolation
     */
    update(deltaTime) {
        // Update animation
        if (this.moving) {
            this.animationTimer += deltaTime;
            if (this.animationTimer >= this.animationSpeed) {
                this.animationTimer = 0;
                this.animationFrame = (this.animationFrame + 1) % 4;
            }
        } else {
            this.animationFrame = 0;
        }

        // Update invincibility
        if (this.invincible && Date.now() > this.invincibleUntil) {
            this.invincible = false;
        }

        // Update emote timer
        if (this.currentEmote && this.emoteTimer > 0) {
            this.emoteTimer -= deltaTime;
            if (this.emoteTimer <= 0) {
                this.currentEmote = null;
            }
        }

        // Smooth position interpolation
        const lerpFactor = Math.min(1, deltaTime * 10);
        if (Math.abs(this.x - this.targetX) > 0.01) {
            this.x += (this.targetX - this.x) * lerpFactor;
        } else {
            this.x = this.targetX;
        }

        if (Math.abs(this.y - this.targetY) > 0.01) {
            this.y += (this.targetY - this.y) * lerpFactor;
        } else {
            this.y = this.targetY;
        }

        this.moving = (this.x !== this.targetX || this.y !== this.targetY);
    }

    /**
     * Move player in a direction
     */
    move(direction, grid, tileSize) {
        if (!this.alive) return false;

        this.direction = direction;

        // Only move if we're at the target position (not mid-movement)
        if (Math.abs(this.x - this.targetX) > 0.1 || Math.abs(this.y - this.targetY) > 0.1) {
            return false;
        }

        let newGridX = this.gridX;
        let newGridY = this.gridY;

        switch (direction) {
            case 'up':
                newGridY -= 1;
                break;
            case 'down':
                newGridY += 1;
                break;
            case 'left':
                newGridX -= 1;
                break;
            case 'right':
                newGridX += 1;
                break;
        }

        // Check if move is valid
        if (this.canMoveTo(newGridX, newGridY, grid)) {
            this.gridX = newGridX;
            this.gridY = newGridY;
            this.targetX = newGridX;
            this.targetY = newGridY;
            this.moving = true;
            this.lastUpdate = Date.now();
            return true;
        }

        return false;
    }

    /**
     * Check if player can move to a position
     */
    canMoveTo(gridX, gridY, grid) {
        if (gridY < 0 || gridY >= grid.length || gridX < 0 || gridX >= grid[0].length) {
            return false;
        }

        const tile = grid[gridY][gridX];
        // 0 = empty, 1 = wall, 2 = destructible, 3 = bomb
        return tile === 0 || tile === 4; // 4 = powerup
    }

    /**
     * Place a bomb
     */
    canPlaceBomb() {
        return this.alive && this.currentBombs < this.maxBombs;
    }

    placeBomb() {
        if (this.canPlaceBomb()) {
            this.currentBombs++;
            return {
                x: this.gridX,
                y: this.gridY,
                playerId: this.id,
                range: this.bombRange,
                timestamp: Date.now()
            };
        }
        return null;
    }

    /**
     * Bomb exploded, decrease counter
     */
    bombExploded() {
        this.currentBombs = Math.max(0, this.currentBombs - 1);
    }

    /**
     * Apply power-up effect
     */
    applyPowerUp(type) {
        switch (type) {
            case 'speed':
                this.speed = Math.min(4, this.speed + 0.5);
                break;
            case 'bomb':
                this.maxBombs = Math.min(8, this.maxBombs + 1);
                break;
            case 'range':
                this.bombRange = Math.min(10, this.bombRange + 1);
                break;
            case 'kick':
                this.canKickBombs = true;
                break;
            case 'invincible':
                this.invincible = true;
                this.invincibleUntil = Date.now() + 5000; // 5 seconds
                break;
        }
    }

    /**
     * Kill player
     */
    kill() {
        if (!this.invincible && this.alive) {
            this.alive = false;
            this.deaths++;
            return true;
        }
        return false;
    }

    /**
     * Revive player (for new round)
     */
    revive(x, y) {
        this.alive = true;
        this.x = x;
        this.y = y;
        this.gridX = x;
        this.gridY = y;
        this.targetX = x;
        this.targetY = y;
        this.currentBombs = 0;
        this.invincible = false;

        // Keep power-ups between rounds
    }

    /**
     * Reset player for new game
     */
    reset(x, y) {
        this.revive(x, y);
        this.kills = 0;
        this.deaths = 0;
        this.maxBombs = 1;
        this.bombRange = 2;
        this.speed = 2;
        this.canKickBombs = false;
    }

    /**
     * Show emote
     */
    showEmote(emote) {
        this.currentEmote = emote;
        this.emoteTimer = 3; // Show for 3 seconds
    }

    /**
     * Get player color
     */
    getColor() {
        return this.colors[this.colorIndex % this.colors.length];
    }

    /**
     * Serialize player data for network
     */
    serialize() {
        return {
            id: this.id,
            username: this.username,
            x: this.x,
            y: this.y,
            gridX: this.gridX,
            gridY: this.gridY,
            targetX: this.targetX,
            targetY: this.targetY,
            direction: this.direction,
            alive: this.alive,
            colorIndex: this.colorIndex,
            kills: this.kills,
            deaths: this.deaths,
            speed: this.speed,
            maxBombs: this.maxBombs,
            currentBombs: this.currentBombs,
            bombRange: this.bombRange,
            canKickBombs: this.canKickBombs,
            invincible: this.invincible,
            invincibleUntil: this.invincibleUntil,
            currentEmote: this.currentEmote,
            lastUpdate: this.lastUpdate
        };
    }

    /**
     * Deserialize player data from network
     */
    static deserialize(data) {
        const player = new Player(
            data.id,
            data.username,
            data.x,
            data.y,
            data.colorIndex
        );

        Object.assign(player, data);
        return player;
    }

    /**
     * Calculate distance to another player
     */
    distanceTo(otherPlayer) {
        const dx = this.gridX - otherPlayer.gridX;
        const dy = this.gridY - otherPlayer.gridY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check if player is at grid position
     */
    isAtPosition(gridX, gridY) {
        return this.gridX === gridX && this.gridY === gridY;
    }
}
