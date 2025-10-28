/**
 * Bomb Class - Represents a bomb in the game
 */
const generateSafeId = (prefix) => {
    const timePart = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${timePart}_${randomPart}`;
};

export class Bomb {
    constructor(x, y, playerId, range = 2, timer = 3000) {
        this.id = generateSafeId(playerId);
        this.x = x;
        this.y = y;
        this.playerId = playerId;
        this.range = range;
        this.timer = timer; // milliseconds until explosion
        this.planted = Date.now();
        this.exploded = false;

        // Animation
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.2; // seconds per frame

        // Kicked bomb properties
        this.isMoving = false;
        this.moveDirection = null;
        this.moveSpeed = 0.1; // tiles per update
    }

    /**
     * Update bomb state
     */
    update(deltaTime) {
        // Update animation
        this.animationTimer += deltaTime;
        if (this.animationTimer >= this.animationSpeed) {
            this.animationTimer = 0;
            this.animationFrame = (this.animationFrame + 1) % 3;
        }

        // Move if kicked
        if (this.isMoving) {
            this.updateMovement(deltaTime);
        }

        // Check if should explode
        const elapsed = Date.now() - this.planted;
        return elapsed >= this.timer;
    }

    /**
     * Update bomb movement (when kicked)
     */
    updateMovement(deltaTime) {
        if (!this.isMoving || !this.moveDirection) return;

        const moveAmount = this.moveSpeed;

        switch (this.moveDirection) {
            case 'up':
                this.y -= moveAmount;
                break;
            case 'down':
                this.y += moveAmount;
                break;
            case 'left':
                this.x -= moveAmount;
                break;
            case 'right':
                this.x += moveAmount;
                break;
        }

        // Round to grid if close enough
        if (Math.abs(this.x - Math.round(this.x)) < 0.1) {
            this.x = Math.round(this.x);
        }
        if (Math.abs(this.y - Math.round(this.y)) < 0.1) {
            this.y = Math.round(this.y);
        }
    }

    /**
     * Kick the bomb in a direction
     */
    kick(direction) {
        if (!this.isMoving) {
            this.isMoving = true;
            this.moveDirection = direction;
        }
    }

    /**
     * Stop bomb movement (hit wall or another bomb)
     */
    stopMovement() {
        this.isMoving = false;
        this.moveDirection = null;
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
    }

    /**
     * Get remaining time percentage
     */
    getTimePercentage() {
        const elapsed = Date.now() - this.planted;
        return 1 - (elapsed / this.timer);
    }

    /**
     * Check if bomb should blink (near explosion)
     */
    shouldBlink() {
        return this.getTimePercentage() < 0.3;
    }

    /**
     * Explode and return explosion data
     */
    explode(grid) {
        if (this.exploded) return null;

        this.exploded = true;

        const explosions = [{
            x: this.x,
            y: this.y,
            timestamp: Date.now()
        }];

        // Calculate explosion in 4 directions
        const directions = [
            { dx: 0, dy: -1 }, // up
            { dx: 0, dy: 1 },  // down
            { dx: -1, dy: 0 }, // left
            { dx: 1, dy: 0 }   // right
        ];

        directions.forEach(dir => {
            for (let i = 1; i <= this.range; i++) {
                const explX = Math.round(this.x) + (dir.dx * i);
                const explY = Math.round(this.y) + (dir.dy * i);

                // Check bounds
                if (explY < 0 || explY >= grid.length ||
                    explX < 0 || explX >= grid[0].length) {
                    break;
                }

                const tile = grid[explY][explX];

                // Hit indestructible wall
                if (tile === 1) {
                    break;
                }

                explosions.push({
                    x: explX,
                    y: explY,
                    timestamp: Date.now()
                });

                // Hit destructible wall
                if (tile === 2) {
                    break;
                }
            }
        });

        return {
            id: this.id,
            playerId: this.playerId,
            explosions: explosions,
            timestamp: Date.now()
        };
    }

    /**
     * Serialize bomb for network
     */
    serialize() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            playerId: this.playerId,
            range: this.range,
            timer: this.timer,
            planted: this.planted,
            isMoving: this.isMoving,
            moveDirection: this.moveDirection
        };
    }

    /**
     * Deserialize bomb from network data
     */
    static deserialize(data) {
        const bomb = new Bomb(
            data.x,
            data.y,
            data.playerId,
            data.range,
            data.timer
        );

        bomb.id = data.id;
        bomb.planted = data.planted;
        bomb.isMoving = data.isMoving;
        bomb.moveDirection = data.moveDirection;

        return bomb;
    }

    /**
     * Check if bomb is at grid position
     */
    isAtPosition(gridX, gridY) {
        return Math.round(this.x) === gridX && Math.round(this.y) === gridY;
    }
}

/**
 * Explosion Class - Represents an explosion effect
 */
export class Explosion {
    constructor(x, y, timestamp = Date.now()) {
        this.x = x;
        this.y = y;
        this.timestamp = timestamp;
        this.duration = 300; // ms
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.04; // seconds per frame
    }

    /**
     * Update explosion animation
     */
    update(deltaTime) {
        this.animationTimer += deltaTime;
        if (this.animationTimer >= this.animationSpeed) {
            this.animationTimer = 0;
            this.animationFrame++;
        }

        const elapsed = Date.now() - this.timestamp;
        return elapsed >= this.duration;
    }

    /**
     * Get opacity based on age
     */
    getOpacity() {
        const elapsed = Date.now() - this.timestamp;
        return Math.max(0, 1 - (elapsed / this.duration));
    }

    /**
     * Get scale based on age
     */
    getScale() {
        const elapsed = Date.now() - this.timestamp;
        const progress = elapsed / this.duration;
        return 0.5 + (progress * 0.5); // Scale from 0.5 to 1.0
    }
}

/**
 * PowerUp Class - Represents a collectible power-up
 */
export class PowerUp {
    constructor(x, y, type) {
        this.id = generateSafeId('powerup');
        this.x = x;
        this.y = y;
        this.type = type; // 'speed', 'bomb', 'range', 'kick', 'invincible'
        this.collected = false;
        this.spawned = Date.now();

        // Animation
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.3;
        this.floatOffset = 0;
        this.floatSpeed = 2;

        // Icons for each power-up type
        this.icons = {
            'speed': '⚡',
            'bomb': '💣',
            'range': '🔥',
            'kick': '👟',
            'invincible': '⭐'
        };

        // Colors for each power-up type
        this.colors = {
            'speed': '#ffff00',
            'bomb': '#ff0000',
            'range': '#ff8800',
            'kick': '#00ff88',
            'invincible': '#ff00ff'
        };
    }

    /**
     * Update power-up animation
     */
    update(deltaTime) {
        this.animationTimer += deltaTime;

        // Floating animation
        this.floatOffset = Math.sin(this.animationTimer * this.floatSpeed) * 0.2;

        // Rotation animation
        if (this.animationTimer >= this.animationSpeed) {
            this.animationTimer = 0;
            this.animationFrame = (this.animationFrame + 1) % 8;
        }
    }

    /**
     * Collect the power-up
     */
    collect() {
        if (!this.collected) {
            this.collected = true;
            return this.type;
        }
        return null;
    }

    /**
     * Get power-up icon
     */
    getIcon() {
        return this.icons[this.type] || '?';
    }

    /**
     * Get power-up color
     */
    getColor() {
        return this.colors[this.type] || '#ffffff';
    }

    /**
     * Serialize for network
     */
    serialize() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            type: this.type,
            collected: this.collected,
            spawned: this.spawned
        };
    }

    /**
     * Deserialize from network data
     */
    static deserialize(data) {
        const powerup = new PowerUp(data.x, data.y, data.type);
        powerup.id = data.id;
        powerup.collected = data.collected;
        powerup.spawned = data.spawned;
        return powerup;
    }

    /**
     * Generate random power-up type
     */
    static randomType() {
        const types = ['speed', 'bomb', 'range', 'kick', 'invincible'];
        const weights = [28, 28, 28, 10, 6];

        const total = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * total;

        for (let i = 0; i < types.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return types[i];
            }
        }

        return types[0];
    }
}
