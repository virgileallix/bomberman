/**
 * Obstacle classes for dynamic map elements
 */

export class Teleporter {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.cooldown = 0; // Prevent rapid teleportation
        this.cooldownTime = 1000; // 1 second cooldown
    }

    update(deltaTime) {
        if (this.cooldown > 0) {
            this.cooldown -= deltaTime * 1000;
        }
    }

    canTeleport() {
        return this.cooldown <= 0;
    }

    teleport() {
        this.cooldown = this.cooldownTime;
        return { x: this.targetX, y: this.targetY };
    }

    serialize() {
        return {
            x: this.x,
            y: this.y,
            targetX: this.targetX,
            targetY: this.targetY
        };
    }

    static deserialize(data) {
        return new Teleporter(data.x, data.y, data.targetX, data.targetY);
    }
}

export class MovingWall {
    constructor(startX, startY, endX, endY, speed = 0.02) {
        this.startX = startX;
        this.startY = startY;
        this.endX = endX;
        this.endY = endY;
        this.x = startX;
        this.y = startY;
        this.speed = speed;
        this.direction = 1; // 1 = forward, -1 = backward
        this.progress = 0; // 0 to 1
    }

    update(deltaTime) {
        this.progress += this.speed * this.direction * deltaTime;

        if (this.progress >= 1) {
            this.progress = 1;
            this.direction = -1;
        } else if (this.progress <= 0) {
            this.progress = 0;
            this.direction = 1;
        }

        // Linear interpolation between start and end
        this.x = this.startX + (this.endX - this.startX) * this.progress;
        this.y = this.startY + (this.endY - this.startY) * this.progress;
    }

    getGridPosition() {
        return {
            x: Math.round(this.x),
            y: Math.round(this.y)
        };
    }

    serialize() {
        return {
            startX: this.startX,
            startY: this.startY,
            endX: this.endX,
            endY: this.endY,
            x: this.x,
            y: this.y,
            progress: this.progress,
            direction: this.direction
        };
    }

    static deserialize(data) {
        const wall = new MovingWall(data.startX, data.startY, data.endX, data.endY);
        wall.x = data.x;
        wall.y = data.y;
        wall.progress = data.progress;
        wall.direction = data.direction;
        return wall;
    }
}
