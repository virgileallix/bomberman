/**
 * Skin Editor - Canvas-based pixel art editor for character and bomb skins
 */

export class SkinEditor {
    constructor(canvasId, previewCanvasId, colorPickerId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.previewCanvas = document.getElementById(previewCanvasId);
        this.previewCtx = this.previewCanvas.getContext('2d');
        this.colorPicker = document.getElementById(colorPickerId);

        this.size = 32; // 32x32 pixels
        this.scale = 16; // Pixel scale for drawing
        this.currentTool = 'pencil';
        this.currentColor = this.colorPicker.value;
        this.isDrawing = false;
        this.imageData = null;

        this.init();
    }

    init() {
        // Set canvas size
        this.canvas.width = this.size;
        this.canvas.height = this.size;

        // Clear with transparent
        this.clear();

        // Setup event listeners
        this.setupEventListeners();

        // Initial preview update
        this.updatePreview();
    }

    setupEventListeners() {
        // Drawing events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());

        // Color picker
        this.colorPicker.addEventListener('input', (e) => {
            this.currentColor = e.target.value;
        });
    }

    getPixelCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        return { x, y };
    }

    startDrawing(e) {
        this.isDrawing = true;
        this.draw(e);
    }

    stopDrawing() {
        this.isDrawing = false;
        if (this.imageData) {
            this.updatePreview();
        }
    }

    draw(e) {
        if (!this.isDrawing && this.currentTool !== 'picker') return;

        const { x, y } = this.getPixelCoords(e);

        if (x < 0 || x >= this.size || y < 0 || y >= this.size) return;

        switch (this.currentTool) {
            case 'pencil':
                this.drawPixel(x, y, this.currentColor);
                break;
            case 'eraser':
                this.erasePixel(x, y);
                break;
            case 'fill':
                if (this.isDrawing) {
                    this.floodFill(x, y, this.currentColor);
                    this.isDrawing = false;
                }
                break;
            case 'picker':
                this.pickColor(x, y);
                break;
        }

        this.updatePreview();
    }

    drawPixel(x, y, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, 1, 1);
    }

    erasePixel(x, y) {
        this.ctx.clearRect(x, y, 1, 1);
    }

    pickColor(x, y) {
        const imageData = this.ctx.getImageData(x, y, 1, 1);
        const [r, g, b, a] = imageData.data;

        if (a === 0) {
            this.currentColor = '#00000000';
            return;
        }

        const hex = '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');

        this.currentColor = hex;
        this.colorPicker.value = hex;
    }

    floodFill(x, y, fillColor) {
        const imageData = this.ctx.getImageData(0, 0, this.size, this.size);
        const targetColor = this.getPixelColor(imageData, x, y);
        const fillRGB = this.hexToRGB(fillColor);

        if (this.colorsMatch(targetColor, fillRGB)) return;

        const stack = [[x, y]];
        const visited = new Set();

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = `${cx},${cy}`;

            if (visited.has(key)) continue;
            if (cx < 0 || cx >= this.size || cy < 0 || cy >= this.size) continue;

            const currentColor = this.getPixelColor(imageData, cx, cy);
            if (!this.colorsMatch(currentColor, targetColor)) continue;

            visited.add(key);
            this.setPixelColor(imageData, cx, cy, fillRGB);

            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    getPixelColor(imageData, x, y) {
        const index = (y * imageData.width + x) * 4;
        return [
            imageData.data[index],
            imageData.data[index + 1],
            imageData.data[index + 2],
            imageData.data[index + 3]
        ];
    }

    setPixelColor(imageData, x, y, [r, g, b, a = 255]) {
        const index = (y * imageData.width + x) * 4;
        imageData.data[index] = r;
        imageData.data[index + 1] = g;
        imageData.data[index + 2] = b;
        imageData.data[index + 3] = a;
    }

    hexToRGB(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b, 255];
    }

    colorsMatch([r1, g1, b1, a1], [r2, g2, b2, a2]) {
        return r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2;
    }

    updatePreview() {
        // Scale up the small canvas to preview
        this.previewCtx.imageSmoothingEnabled = false;
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewCtx.drawImage(
            this.canvas,
            0, 0, this.size, this.size,
            0, 0, this.previewCanvas.width, this.previewCanvas.height
        );
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.size, this.size);
        this.updatePreview();
    }

    loadImage(image) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Clear canvas
                this.ctx.clearRect(0, 0, this.size, this.size);

                // Draw image scaled to 32x32
                this.ctx.drawImage(img, 0, 0, this.size, this.size);
                this.updatePreview();
                resolve();
            };
            img.onerror = reject;
            img.src = image;
        });
    }

    loadImageData(dataUrl) {
        return this.loadImage(dataUrl);
    }

    exportImage() {
        return this.canvas.toDataURL('image/png');
    }

    getImageData() {
        return this.ctx.getImageData(0, 0, this.size, this.size);
    }

    setImageData(imageData) {
        this.ctx.putImageData(imageData, 0, 0);
        this.updatePreview();
    }
}

/**
 * Premade Skins Generator
 */
export class PremadeSkins {
    static generateCharacterSkins() {
        return [
            this.createSolidColor('#00f0ff', 'Cyan'),
            this.createSolidColor('#ff00ff', 'Magenta'),
            this.createSolidColor('#ffff00', 'Yellow'),
            this.createSolidColor('#00ff88', 'Green'),
            this.createSolidColor('#ff0055', 'Red'),
            this.createSmiley(),
            this.createRobot(),
            this.createGhost()
        ];
    }

    static generateBombSkins() {
        return [
            this.createClassicBomb(),
            this.createSpikeBomb(),
            this.createCrystalBomb(),
            this.createFireBomb(),
            this.createIceBomb(),
            this.createToxicBomb(),
            this.createNuclearBomb(),
            this.createCartoonBomb()
        ];
    }

    static createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        return canvas;
    }

    static createSolidColor(color, name) {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Draw a simple character shape
        ctx.fillStyle = color;
        ctx.fillRect(8, 4, 16, 10); // Head
        ctx.fillRect(10, 14, 12, 12); // Body
        ctx.fillRect(6, 16, 4, 8); // Left arm
        ctx.fillRect(22, 16, 4, 8); // Right arm
        ctx.fillRect(10, 26, 5, 6); // Left leg
        ctx.fillRect(17, 26, 5, 6); // Right leg

        // Eyes
        ctx.fillStyle = '#000000';
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);

        return { canvas, name };
    }

    static createSmiley() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Yellow circle
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(16, 16, 12, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#000000';
        ctx.fillRect(10, 12, 3, 3);
        ctx.fillRect(19, 12, 3, 3);

        // Smile
        ctx.fillRect(10, 20, 2, 2);
        ctx.fillRect(12, 22, 8, 2);
        ctx.fillRect(20, 20, 2, 2);

        return { canvas, name: 'Smiley' };
    }

    static createRobot() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Body
        ctx.fillStyle = '#808080';
        ctx.fillRect(8, 8, 16, 16);

        // Eyes
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(10, 12, 3, 3);
        ctx.fillRect(19, 12, 3, 3);

        // Antenna
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(15, 4, 2, 4);
        ctx.fillRect(13, 3, 6, 2);

        // Mouth
        ctx.fillStyle = '#000000';
        ctx.fillRect(10, 18, 12, 2);

        return { canvas, name: 'Robot' };
    }

    static createGhost() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // White body
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, 8, 16, 18);

        // Wavy bottom
        ctx.fillRect(8, 26, 3, 2);
        ctx.fillRect(13, 26, 3, 2);
        ctx.fillRect(18, 26, 3, 2);
        ctx.fillRect(10, 28, 3, 2);
        ctx.fillRect(16, 28, 3, 2);

        // Eyes
        ctx.fillStyle = '#000000';
        ctx.fillRect(11, 14, 3, 4);
        ctx.fillRect(18, 14, 3, 4);

        return { canvas, name: 'Ghost' };
    }

    static createClassicBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Black sphere
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(16, 18, 10, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#404040';
        ctx.beginPath();
        ctx.arc(13, 15, 3, 0, Math.PI * 2);
        ctx.fill();

        // Fuse
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(14, 6, 4, 8);

        // Spark
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(13, 4, 6, 3);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(14, 5, 4, 1);

        return { canvas, name: 'Classic' };
    }

    static createSpikeBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Dark gray sphere
        ctx.fillStyle = '#404040';
        ctx.beginPath();
        ctx.arc(16, 16, 8, 0, Math.PI * 2);
        ctx.fill();

        // Spikes
        ctx.fillStyle = '#808080';
        const spikes = [
            [16, 4], [16, 28], [4, 16], [28, 16],
            [10, 10], [22, 10], [10, 22], [22, 22]
        ];
        spikes.forEach(([x, y]) => {
            ctx.fillRect(x - 1, y - 1, 3, 3);
        });

        return { canvas, name: 'Spike' };
    }

    static createCrystalBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Diamond shape
        const colors = ['#00f0ff', '#00c0cc', '#008899'];
        ctx.fillStyle = colors[0];
        ctx.beginPath();
        ctx.moveTo(16, 6);
        ctx.lineTo(24, 16);
        ctx.lineTo(16, 26);
        ctx.lineTo(8, 16);
        ctx.closePath();
        ctx.fill();

        // Inner facets
        ctx.fillStyle = colors[1];
        ctx.fillRect(12, 14, 8, 4);
        ctx.fillStyle = colors[2];
        ctx.fillRect(14, 12, 4, 8);

        return { canvas, name: 'Crystal' };
    }

    static createFireBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Red sphere
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(16, 18, 9, 0, Math.PI * 2);
        ctx.fill();

        // Flames
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(12, 6, 3, 6);
        ctx.fillRect(17, 8, 3, 4);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(13, 7, 2, 3);
        ctx.fillRect(18, 9, 2, 2);

        return { canvas, name: 'Fire' };
    }

    static createIceBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Blue sphere
        ctx.fillStyle = '#00ccff';
        ctx.beginPath();
        ctx.arc(16, 16, 9, 0, Math.PI * 2);
        ctx.fill();

        // Ice crystals
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16, 10, 2, 6);
        ctx.fillRect(13, 13, 8, 2);
        ctx.fillRect(12, 19, 3, 2);
        ctx.fillRect(19, 19, 3, 2);

        return { canvas, name: 'Ice' };
    }

    static createToxicBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Green sphere
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(16, 16, 9, 0, Math.PI * 2);
        ctx.fill();

        // Toxic symbol
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(16, 16, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#00ff00';
        ctx.fillRect(15, 12, 2, 8);
        ctx.fillRect(11, 15, 10, 2);

        return { canvas, name: 'Toxic' };
    }

    static createNuclearBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Yellow sphere
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(16, 16, 9, 0, Math.PI * 2);
        ctx.fill();

        // Nuclear symbol
        ctx.fillStyle = '#000000';
        // Center circle
        ctx.beginPath();
        ctx.arc(16, 16, 3, 0, Math.PI * 2);
        ctx.fill();

        // Three triangular sections
        ctx.beginPath();
        ctx.moveTo(16, 16);
        ctx.lineTo(16, 8);
        ctx.lineTo(20, 12);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(16, 16);
        ctx.lineTo(24, 20);
        ctx.lineTo(20, 24);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(16, 16);
        ctx.lineTo(8, 20);
        ctx.lineTo(12, 24);
        ctx.closePath();
        ctx.fill();

        return { canvas, name: 'Nuclear' };
    }

    static createCartoonBomb() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');

        // Black sphere
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(16, 18, 10, 0, Math.PI * 2);
        ctx.fill();

        // White highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(12, 14, 4, 0, Math.PI * 2);
        ctx.fill();

        // Red fuse
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(14, 4, 4, 10);

        // Yellow spark
        ctx.fillStyle = '#ffff00';
        const sparkPoints = [
            [12, 2], [16, 0], [20, 2],
            [18, 6], [22, 8], [18, 10]
        ];
        sparkPoints.forEach(([x, y]) => {
            ctx.fillRect(x, y, 2, 2);
        });

        return { canvas, name: 'Cartoon' };
    }
}
