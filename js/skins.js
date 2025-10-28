/**
 * Skins System - Character and Bomb customization
 */

export const CHARACTER_SKINS = {
    classic: {
        id: 'classic',
        name: 'Classique',
        emoji: '🧑',
        unlocked: true,
        description: 'Le bombardier original'
    },
    ninja: {
        id: 'ninja',
        name: 'Ninja',
        emoji: '🥷',
        unlocked: true,
        description: 'Rapide et silencieux'
    },
    robot: {
        id: 'robot',
        name: 'Robot',
        emoji: '🤖',
        unlocked: true,
        description: 'Précision mécanique'
    },
    alien: {
        id: 'alien',
        name: 'Alien',
        emoji: '👽',
        unlocked: true,
        description: 'Venu d\'ailleurs'
    },
    ghost: {
        id: 'ghost',
        name: 'Fantôme',
        emoji: '👻',
        unlocked: true,
        description: 'Mystérieux et effrayant'
    },
    pirate: {
        id: 'pirate',
        name: 'Pirate',
        emoji: '🏴‍☠️',
        unlocked: true,
        description: 'Yo ho ho!'
    },
    wizard: {
        id: 'wizard',
        name: 'Sorcier',
        emoji: '🧙',
        unlocked: true,
        description: 'Magie explosive'
    },
    superhero: {
        id: 'superhero',
        name: 'Super-héros',
        emoji: '🦸',
        unlocked: true,
        description: 'Justice explosive'
    },
    zombie: {
        id: 'zombie',
        name: 'Zombie',
        emoji: '🧟',
        unlocked: true,
        description: 'Mort mais vivant'
    },
    vampire: {
        id: 'vampire',
        name: 'Vampire',
        emoji: '🧛',
        unlocked: true,
        description: 'Assoiffé de victoire'
    },
    clown: {
        id: 'clown',
        name: 'Clown',
        emoji: '🤡',
        unlocked: true,
        description: 'Chaos amusant'
    },
    cowboy: {
        id: 'cowboy',
        name: 'Cowboy',
        emoji: '🤠',
        unlocked: true,
        description: 'Yeehaw!'
    }
};

export const BOMB_SKINS = {
    classic: {
        id: 'classic',
        name: 'Classique',
        emoji: '💣',
        unlocked: true,
        description: 'La bombe originale'
    },
    nuclear: {
        id: 'nuclear',
        name: 'Nucléaire',
        emoji: '☢️',
        unlocked: true,
        description: 'Radioactif!'
    },
    dynamite: {
        id: 'dynamite',
        name: 'Dynamite',
        emoji: '🧨',
        unlocked: true,
        description: 'Style cartoon'
    },
    firecracker: {
        id: 'firecracker',
        name: 'Pétard',
        emoji: '🎆',
        unlocked: true,
        description: 'Festif et explosif'
    },
    cannon: {
        id: 'cannon',
        name: 'Boulet',
        emoji: '⚫',
        unlocked: true,
        description: 'Lourd et puissant'
    },
    crystal: {
        id: 'crystal',
        name: 'Cristal',
        emoji: '💎',
        unlocked: true,
        description: 'Précieux et mortel'
    },
    toxic: {
        id: 'toxic',
        name: 'Toxique',
        emoji: '☣️',
        unlocked: true,
        description: 'Danger biologique'
    },
    fire: {
        id: 'fire',
        name: 'Feu',
        emoji: '🔥',
        unlocked: true,
        description: 'Flammes pures'
    },
    ice: {
        id: 'ice',
        name: 'Glace',
        emoji: '❄️',
        unlocked: true,
        description: 'Froid mortel'
    },
    lightning: {
        id: 'lightning',
        name: 'Foudre',
        emoji: '⚡',
        unlocked: true,
        description: 'Électrique'
    },
    star: {
        id: 'star',
        name: 'Étoile',
        emoji: '⭐',
        unlocked: true,
        description: 'Magique'
    },
    skull: {
        id: 'skull',
        name: 'Crâne',
        emoji: '💀',
        unlocked: true,
        description: 'Mortel'
    }
};

/**
 * Skin Manager Class
 */
export class SkinManager {
    constructor() {
        this.selectedCharacterSkin = this.loadSelectedCharacterSkin();
        this.selectedBombSkin = this.loadSelectedBombSkin();
    }

    /**
     * Load selected character skin from localStorage
     */
    loadSelectedCharacterSkin() {
        const saved = localStorage.getItem('bomberman_character_skin');
        return saved && CHARACTER_SKINS[saved] ? saved : 'classic';
    }

    /**
     * Load selected bomb skin from localStorage
     */
    loadSelectedBombSkin() {
        const saved = localStorage.getItem('bomberman_bomb_skin');
        return saved && BOMB_SKINS[saved] ? saved : 'classic';
    }

    /**
     * Set character skin
     */
    setCharacterSkin(skinId) {
        if (CHARACTER_SKINS[skinId]) {
            this.selectedCharacterSkin = skinId;
            localStorage.setItem('bomberman_character_skin', skinId);
            return true;
        }
        return false;
    }

    /**
     * Set bomb skin
     */
    setBombSkin(skinId) {
        if (BOMB_SKINS[skinId]) {
            this.selectedBombSkin = skinId;
            localStorage.setItem('bomberman_bomb_skin', skinId);
            return true;
        }
        return false;
    }

    /**
     * Get current character skin
     */
    getCharacterSkin() {
        return CHARACTER_SKINS[this.selectedCharacterSkin];
    }

    /**
     * Get current bomb skin
     */
    getBombSkin() {
        return BOMB_SKINS[this.selectedBombSkin];
    }

    /**
     * Get all unlocked character skins
     */
    getUnlockedCharacterSkins() {
        return Object.values(CHARACTER_SKINS).filter(skin => skin.unlocked);
    }

    /**
     * Get all unlocked bomb skins
     */
    getUnlockedBombSkins() {
        return Object.values(BOMB_SKINS).filter(skin => skin.unlocked);
    }

    /**
     * Get selected skins for network sync
     */
    getSelectedSkins() {
        return {
            character: this.selectedCharacterSkin,
            bomb: this.selectedBombSkin
        };
    }
}
