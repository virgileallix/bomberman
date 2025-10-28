/**
 * Renderer - Handles all Canvas drawing operations
 */
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tileSize = 48; // pixels per tile
        this.gridWidth = 15;
        this.gridHeight = 13;

        // Set canvas size
        this.canvas.width = this.gridWidth * this.tileSize;
        this.canvas.height = this.gridHeight * this.tileSize;

        // Pixel art rendering
        this.ctx.imageSmoothingEnabled = false;

        // Colors
        this.colors = {
            floor: '#1a1a2e',
            floorAlt: '#16162a',
            wall: '#4a4a6a',
            wallShade: '#3a3a5a',
            destructible: '#8b4513',
            destructibleShade: '#654321',
            bomb: '#2a2a4a',
            explosion: '#ff6600',
            explosionCore: '#ffff00'
        };
    }

    /**
     * Clear canvas
     */
    clear() {
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Draw the game grid
     */
    drawGrid(grid) {
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const tile = grid[y][x];
                this.drawTile(x, y, tile);
            }
        }
    }

    /**
     * Draw a single tile
     */
    drawTile(x, y, type) {
        const px = x * this.tileSize;
        const py = y * this.tileSize;

        switch (type) {
            case 0: // Empty floor
                this.drawFloor(px, py, (x + y) % 2 === 0);
                break;
            case 1: // Indestructible wall
                this.drawWall(px, py);
                break;
            case 2: // Destructible crate
                this.drawCrate(px, py);
                break;
        }
    }

    /**
     * Draw floor tile
     */
    drawFloor(x, y, alternate = false) {
        this.ctx.fillStyle = alternate ? this.colors.floorAlt : this.colors.floor;
        this.ctx.fillRect(x, y, this.tileSize, this.tileSize);

        // Add subtle grid lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, this.tileSize, this.tileSize);
    }

    /**
     * Draw indestructible wall
     */
    drawWall(x, y) {
        // Main wall
        this.ctx.fillStyle = this.colors.wall;
        this.ctx.fillRect(x, y, this.tileSize, this.tileSize);

        // Top highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(x, y, this.tileSize, 4);

        // Bottom shadow
        this.ctx.fillStyle = this.colors.wallShade;
        this.ctx.fillRect(x, y + this.tileSize - 4, this.tileSize, 4);

        // Grid pattern
        const gridSize = 8;
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.lineWidth = 2;

        for (let i = 0; i < this.tileSize; i += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + i, y);
            this.ctx.lineTo(x + i, y + this.tileSize);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(x, y + i);
            this.ctx.lineTo(x + this.tileSize, y + i);
            this.ctx.stroke();
        }
    }

    /**
     * Draw destructible crate
     */
    drawCrate(x, y) {
        // Main crate
        this.ctx.fillStyle = this.colors.destructible;
        this.ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);

        // Top highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(x + 4, y + 4, this.tileSize - 8, 6);

        // Bottom shadow
        this.ctx.fillStyle = this.colors.destructibleShade;
        this.ctx.fillRect(x + 4, y + this.tileSize - 10, this.tileSize - 8, 6);

        // Wood planks
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.lineWidth = 2;

        const plankY = [y + 16, y + 32];
        plankY.forEach(py => {
            this.ctx.beginPath();
            this.ctx.moveTo(x + 4, py);
            this.ctx.lineTo(x + this.tileSize - 4, py);
            this.ctx.stroke();
        });
    }

    /**
     * Draw default player (fallback when no custom skin)
     */
    drawDefaultPlayer(color, size) {
        // Body
        this.ctx.fillStyle = color.main;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Shine effect
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(-size / 6, -size / 6, size / 6, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * Draw a player
     */
    drawPlayer(player) {
        if (!player.alive) return;

        const px = player.x * this.tileSize + this.tileSize / 2;
        const py = player.y * this.tileSize + this.tileSize / 2;
        const size = this.tileSize * 0.7;

        const color = player.getColor();

        this.ctx.save();
        this.ctx.translate(px, py);

        // Shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, size / 3, size / 3, size / 6, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Invincibility effect
        if (player.invincible) {
            const time = Date.now() / 100;
            this.ctx.strokeStyle = color.main;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.lineDashOffset = -time;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, size / 2 + 5, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Draw custom skin if available, otherwise default rendering
        const hasCustomSkin = player.hasCustomSkin('character');
        if (hasCustomSkin) {
            const skinImg = player.skinImages.character;
            if (skinImg && skinImg.complete) {
                // Draw custom skin centered
                this.ctx.drawImage(
                    skinImg,
                    -size / 2,
                    -size / 2,
                    size,
                    size
                );
            } else {
                // Fallback to default if image not loaded yet
                this.drawDefaultPlayer(color, size);
            }
        } else {
            // Default player rendering
            this.drawDefaultPlayer(color, size);
        }

        // Only draw eyes for default skin (custom skins have their own design)
        if (!hasCustomSkin || !player.skinImages.character || !player.skinImages.character.complete) {
            this.ctx.fillStyle = '#000';
            const eyeOffsetX = player.direction === 'left' ? -4 : player.direction === 'right' ? 4 : 0;
            const eyeOffsetY = player.direction === 'up' ? -4 : player.direction === 'down' ? 4 : 0;

            this.ctx.fillRect(-8 + eyeOffsetX, -4 + eyeOffsetY, 4, 6);
            this.ctx.fillRect(4 + eyeOffsetX, -4 + eyeOffsetY, 4, 6);
        }

        // Walking animation
        if (player.moving) {
            const bounce = Math.sin(player.animationFrame * Math.PI / 2) * 2;
            this.ctx.translate(0, -bounce);
        }

        this.ctx.restore();

        // Draw username
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px "Press Start 2P"';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.username, px, py - size / 2 - 10);

        // Draw emote
        if (player.currentEmote) {
            this.ctx.font = '20px Arial';
            this.ctx.fillText(player.currentEmote, px, py - size / 2 - 30);
        }
    }

    /**
     * Draw a bomb
     */
    drawBomb(bomb, ownerPlayer = null) {
        const px = bomb.x * this.tileSize + this.tileSize / 2;
        const py = bomb.y * this.tileSize + this.tileSize / 2;
        const size = this.tileSize * 0.6;

        this.ctx.save();
        this.ctx.translate(px, py);

        // Shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, size / 3, size / 3, size / 6, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Pulsing effect when near explosion
        let scale = 1;
        if (bomb.shouldBlink()) {
            scale = 1 + Math.sin(Date.now() / 100) * 0.1;
            this.ctx.scale(scale, scale);
        }

        // Draw custom bomb skin if owner has one
        if (ownerPlayer && ownerPlayer.hasCustomSkin('bomb')) {
            const skinImg = ownerPlayer.skinImages.bomb;
            if (skinImg && skinImg.complete) {
                this.ctx.drawImage(
                    skinImg,
                    -size / 2,
                    -size / 2,
                    size,
                    size
                );
                this.ctx.restore();
                this.drawBombTimer(bomb, px, py, size);
                return;
            }
        }

        // Default bomb rendering
        // Bomb body
        this.ctx.fillStyle = '#2a2a4a';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.ctx.arc(-size / 6, -size / 6, size / 6, 0, Math.PI * 2);
        this.ctx.fill();

        // Fuse
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size / 2);
        this.ctx.lineTo(size / 4, -size / 2 - 10);
        this.ctx.stroke();

        // Fuse spark
        if (bomb.animationFrame % 2 === 0) {
            this.ctx.fillStyle = '#ff6600';
            this.ctx.beginPath();
            this.ctx.arc(size / 4, -size / 2 - 10, 3, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(size / 4, -size / 2 - 10, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();

        // Draw timer
        this.drawBombTimer(bomb, px, py, size);
    }

    /**
     * Draw bomb timer indicator
     */
    drawBombTimer(bomb, px, py, size) {
        const timePercentage = bomb.getTimePercentage();
        const barWidth = this.tileSize * 0.8;
        const barHeight = 4;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(px - barWidth / 2, py + size / 2 + 5, barWidth, barHeight);

        this.ctx.fillStyle = timePercentage > 0.5 ? '#00ff88' : timePercentage > 0.25 ? '#ffff00' : '#ff0055';
        this.ctx.fillRect(px - barWidth / 2, py + size / 2 + 5, barWidth * timePercentage, barHeight);
    }

    /**
     * Draw an explosion
     */
    drawExplosion(explosion) {
        const px = explosion.x * this.tileSize + this.tileSize / 2;
        const py = explosion.y * this.tileSize + this.tileSize / 2;
        const scale = explosion.getScale();
        const opacity = explosion.getOpacity();

        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        this.ctx.translate(px, py);
        this.ctx.scale(scale, scale);

        // Outer explosion
        const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, this.tileSize / 2);
        gradient.addColorStop(0, this.colors.explosionCore);
        gradient.addColorStop(0.5, this.colors.explosion);
        gradient.addColorStop(1, 'rgba(255, 102, 0, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.tileSize / 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Particles
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + explosion.animationFrame * 0.1;
            const distance = this.tileSize / 3;
            const px = Math.cos(angle) * distance;
            const py = Math.sin(angle) * distance;

            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(px, py, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    /**
     * Draw a power-up
     */
    drawPowerUp(powerup) {
        const px = powerup.x * this.tileSize + this.tileSize / 2;
        const py = powerup.y * this.tileSize + this.tileSize / 2 + powerup.floatOffset * this.tileSize;
        const size = this.tileSize * 0.5;

        this.ctx.save();
        this.ctx.translate(px, py);
        this.ctx.rotate(powerup.animationFrame * Math.PI / 4);

        // Glow
        const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2 + 10);
        gradient.addColorStop(0, powerup.getColor() + '88');
        gradient.addColorStop(1, powerup.getColor() + '00');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, size / 2 + 10, 0, Math.PI * 2);
        this.ctx.fill();

        // Icon background
        this.ctx.fillStyle = powerup.getColor();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Icon
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(powerup.getIcon(), 0, 0);

        this.ctx.restore();
    }

    /**
     * Draw debug grid
     */
    drawDebugGrid() {
        this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= this.gridWidth; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.tileSize, 0);
            this.ctx.lineTo(x * this.tileSize, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.gridHeight; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.tileSize);
            this.ctx.lineTo(this.canvas.width, y * this.tileSize);
            this.ctx.stroke();
        }
    }

    /**
     * Render entire game state
     */
    render(gameState) {
        this.clear();
        this.drawGrid(gameState.grid);

        // Draw power-ups
        if (gameState.powerups) {
            gameState.powerups.forEach(powerup => this.drawPowerUp(powerup));
        }

        // Draw bombs (with owner player for custom skins)
        if (gameState.bombs) {
            gameState.bombs.forEach(bomb => {
                // Find the player who owns this bomb
                const ownerPlayer = gameState.players?.find(p => p.id === bomb.playerId);
                this.drawBomb(bomb, ownerPlayer);
            });
        }

        // Draw explosions
        if (gameState.explosions) {
            gameState.explosions.forEach(explosion => this.drawExplosion(explosion));
        }

        // Draw players
        if (gameState.players) {
            gameState.players.forEach(player => this.drawPlayer(player));
        }

        // Debug grid (optional)
        // this.drawDebugGrid();
    }
}
