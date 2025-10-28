/**
 * Effects Manager - Handles visual effects customization
 */
export class EffectsManager {
    constructor() {
        this.effects = {
            explosion: 'classic',
            explosionSize: 100,
            explosionDuration: 500,
            kill: 'confetti',
            killSound: true,
            killText: true,
            death: 'fade',
            trail: 'none',
            trailIntensity: 5,
            trailLifetime: 500
        };

        this.loadEffects();
    }

    /**
     * Load effects from localStorage
     */
    loadEffects() {
        const saved = localStorage.getItem('bomberman_effects');
        if (saved) {
            try {
                this.effects = { ...this.effects, ...JSON.parse(saved) };
            } catch (error) {
                console.error('Failed to load effects:', error);
            }
        }
    }

    /**
     * Save effects to localStorage
     */
    saveEffects() {
        localStorage.setItem('bomberman_effects', JSON.stringify(this.effects));
    }

    /**
     * Set an effect
     */
    setEffect(type, value) {
        this.effects[type] = value;
        this.saveEffects();
    }

    /**
     * Get an effect
     */
    getEffect(type) {
        return this.effects[type];
    }

    /**
     * Get all effects
     */
    getAllEffects() {
        return { ...this.effects };
    }
}

/**
 * Explosion Effect Renderer
 */
export class ExplosionEffect {
    constructor(x, y, type = 'classic', size = 100, duration = 500) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.size = size / 100; // Convert percentage to multiplier
        this.duration = duration;
        this.startTime = Date.now();
        this.particles = [];

        this.createParticles();
    }

    createParticles() {
        const count = Math.floor(20 * this.size);

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 2 + Math.random() * 3;

            this.particles.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 3 + Math.random() * 5,
                color: this.getParticleColor()
            });
        }
    }

    getParticleColor() {
        const colors = {
            classic: ['#ff6600', '#ff3300', '#ff9900', '#ffcc00'],
            fire: ['#ff0000', '#ff3300', '#ff6600', '#ffaa00'],
            electric: ['#00ccff', '#0099ff', '#ffffff', '#66ffff'],
            ice: ['#aaeeff', '#ffffff', '#ccffff', '#88ddff'],
            toxic: ['#00ff00', '#88ff00', '#aaff00', '#66ff00'],
            rainbow: ['#ff0000', '#ff9900', '#ffff00', '#00ff00', '#0099ff', '#6600ff', '#ff00ff']
        };

        const palette = colors[this.type] || colors.classic;
        return palette[Math.floor(Math.random() * palette.length)];
    }

    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        this.particles.forEach(particle => {
            particle.x += particle.vx * deltaTime * 60;
            particle.y += particle.vy * deltaTime * 60;
            particle.life = 1 - progress;
            particle.vx *= 0.98;
            particle.vy *= 0.98;
        });

        return progress >= 1;
    }

    render(ctx, tileSize) {
        this.particles.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.life;
            ctx.fillStyle = particle.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = particle.color;

            const renderX = particle.x * tileSize;
            const renderY = particle.y * tileSize;
            const renderSize = particle.size * this.size;

            ctx.beginPath();
            ctx.arc(renderX, renderY, renderSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}

/**
 * Kill Effect Renderer
 */
export class KillEffect {
    constructor(x, y, type = 'confetti', showText = true) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.showText = showText;
        this.startTime = Date.now();
        this.duration = 1500;
        this.particles = [];

        this.createParticles();
    }

    createParticles() {
        const count = 30;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
            const speed = 1 + Math.random() * 2;

            this.particles.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 1,
                size: 4 + Math.random() * 6,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2,
                symbol: this.getParticleSymbol()
            });
        }
    }

    getParticleSymbol() {
        const symbols = {
            confetti: ['🎉', '🎊', '✨', '⭐', '💫'],
            stars: ['⭐', '🌟', '✨', '💫'],
            skulls: ['💀', '☠️'],
            hearts: ['💖', '💗', '💝', '💘'],
            lightning: ['⚡', '⚡', '💥'],
            none: []
        };

        const palette = symbols[this.type] || symbols.confetti;
        return palette[Math.floor(Math.random() * palette.length)];
    }

    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        this.particles.forEach(particle => {
            particle.x += particle.vx * deltaTime * 60;
            particle.y += particle.vy * deltaTime * 60;
            particle.vy += 0.2 * deltaTime * 60; // Gravity
            particle.life = 1 - progress;
            particle.rotation += particle.rotationSpeed;
        });

        return progress >= 1;
    }

    render(ctx, tileSize) {
        // Render particles
        this.particles.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.life;
            ctx.translate(particle.x * tileSize, particle.y * tileSize);
            ctx.rotate(particle.rotation);
            ctx.font = `${particle.size * 3}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(particle.symbol, 0, 0);
            ctx.restore();
        });

        // Render "KILL!" text
        if (this.showText) {
            const textProgress = Math.min(1, (Date.now() - this.startTime) / 500);
            const textY = this.y - 1 - textProgress * 0.5;
            const textAlpha = textProgress < 0.8 ? 1 : (1 - textProgress) / 0.2;

            ctx.save();
            ctx.globalAlpha = textAlpha;
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText('KILL!', this.x * tileSize, textY * tileSize);
            ctx.fillStyle = '#ff0055';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ff0055';
            ctx.fillText('KILL!', this.x * tileSize, textY * tileSize);
            ctx.restore();
        }
    }
}

/**
 * Death Effect Renderer
 */
export class DeathEffect {
    constructor(player, type = 'fade') {
        this.player = player;
        this.type = type;
        this.startTime = Date.now();
        this.duration = 1000;
        this.particles = [];

        if (type === 'explode') {
            this.createExplosionParticles();
        }
    }

    createExplosionParticles() {
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;

            this.particles.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 1,
                size: 3 + Math.random() * 5,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.3
            });
        }
    }

    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        this.particles.forEach(particle => {
            particle.x += particle.vx * deltaTime * 60;
            particle.y += particle.vy * deltaTime * 60;
            particle.vy += 0.15 * deltaTime * 60;
            particle.life = 1 - progress;
            particle.rotation += particle.rotationSpeed;
        });

        return progress >= 1;
    }

    getAlpha() {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        switch (this.type) {
            case 'fade':
                return 1 - progress;
            case 'explode':
                return progress < 0.3 ? 1 : 0;
            case 'ascend':
                return 1 - progress;
            case 'melt':
                return 1;
            case 'spin':
                return 1 - progress;
            case 'angel':
                return 1 - (progress * 0.5);
            default:
                return 1 - progress;
        }
    }

    getOffset() {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        switch (this.type) {
            case 'ascend':
            case 'angel':
                return { x: 0, y: -progress * 2 };
            case 'melt':
                return { x: 0, y: progress * 0.5 };
            default:
                return { x: 0, y: 0 };
        }
    }

    getScale() {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        switch (this.type) {
            case 'melt':
                return { x: 1, y: 1 - progress * 0.5 };
            case 'spin':
                return { x: 1 - progress * 0.5, y: 1 - progress * 0.5 };
            default:
                return { x: 1, y: 1 };
        }
    }

    getRotation() {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        if (this.type === 'spin') {
            return progress * Math.PI * 4;
        }
        return 0;
    }

    renderParticles(ctx, tileSize) {
        if (this.type === 'explode') {
            this.particles.forEach(particle => {
                ctx.save();
                ctx.globalAlpha = particle.life;
                ctx.translate(particle.x * tileSize, particle.y * tileSize);
                ctx.rotate(particle.rotation);
                ctx.fillStyle = this.player.getColor().main;
                ctx.fillRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
                ctx.restore();
            });
        }
    }
}

/**
 * Trail Effect Renderer
 */
export class TrailEffect {
    constructor(x, y, type = 'sparkles', intensity = 5, lifetime = 500) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.intensity = intensity;
        this.lifetime = lifetime;
        this.startTime = Date.now();
        this.particles = [];

        this.createParticles();
    }

    createParticles() {
        const count = Math.floor(this.intensity);

        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: this.x + (Math.random() - 0.5) * 0.5,
                y: this.y + (Math.random() - 0.5) * 0.5,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                life: 1,
                size: 2 + Math.random() * 3,
                color: this.getParticleColor()
            });
        }
    }

    getParticleColor() {
        const colors = {
            sparkles: ['#ffff00', '#ffaa00', '#ffcc00'],
            fire: ['#ff3300', '#ff6600', '#ff9900'],
            smoke: ['#666666', '#888888', '#aaaaaa'],
            rainbow: ['#ff0000', '#ff9900', '#ffff00', '#00ff00', '#0099ff', '#ff00ff'],
            neon: ['#00ffff', '#ff00ff', '#00ff00', '#ffff00']
        };

        const palette = colors[this.type] || colors.sparkles;
        return palette[Math.floor(Math.random() * palette.length)];
    }

    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.lifetime;

        this.particles.forEach(particle => {
            particle.x += particle.vx * deltaTime * 60;
            particle.y += particle.vy * deltaTime * 60;
            particle.life = 1 - progress;
        });

        return progress >= 1;
    }

    render(ctx, tileSize) {
        this.particles.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.life * 0.7;
            ctx.fillStyle = particle.color;
            ctx.shadowBlur = 5;
            ctx.shadowColor = particle.color;

            const renderX = particle.x * tileSize;
            const renderY = particle.y * tileSize;

            ctx.beginPath();
            ctx.arc(renderX, renderY, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}
