/**
 * Admin & Moderation System
 */

export class ModerationManager {
    constructor(network, userId) {
        this.network = network;
        this.userId = userId;
        this.isAdmin = false;

        // Admin list (IDs Firebase des admins)
        // TODO: Remplacer par ton propre ID Firebase
        this.adminIds = [
            // Ajoute ton ID Firebase ici
            // Tu peux le trouver dans la console Firebase
        ];

        // Rate limiting
        this.messageTimestamps = new Map(); // userId -> [timestamps]
        this.messageLimit = 5; // messages
        this.timeWindow = 10000; // 10 secondes

        // Muted users
        this.mutedUsers = new Set();
        this.muteTimeouts = new Map();

        // Banned users (stored in Firebase)
        this.bannedUsers = new Set();

        // Profanity filter
        this.bannedWords = [
            // Mots français
            'connard', 'salope', 'pute', 'enculé', 'merde', 'fdp', 'pd',
            'con', 'bite', 'couille', 'chier', 'putain', 'bordel',
            // Mots anglais
            'fuck', 'shit', 'bitch', 'asshole', 'damn', 'cunt',
            'dick', 'pussy', 'bastard', 'whore', 'fag'
        ];

        this.checkAdmin();
    }

    checkAdmin() {
        this.isAdmin = this.adminIds.includes(this.userId);
        if (this.isAdmin) {
            console.log('👑 Admin mode activé');
        }
    }

    /**
     * Ajouter un admin
     */
    addAdmin(userId) {
        if (!this.adminIds.includes(userId)) {
            this.adminIds.push(userId);
        }
    }

    /**
     * Vérifier si un message contient des mots interdits
     */
    containsProfanity(message) {
        const lowerMessage = message.toLowerCase();
        for (const word of this.bannedWords) {
            if (lowerMessage.includes(word)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Filtrer un message (remplacer les gros mots par ***)
     */
    filterMessage(message) {
        let filtered = message;
        const lowerMessage = message.toLowerCase();

        for (const word of this.bannedWords) {
            const regex = new RegExp(word, 'gi');
            filtered = filtered.replace(regex, '*'.repeat(word.length));
        }

        return filtered;
    }

    /**
     * Vérifier le rate limiting (anti-spam)
     */
    checkRateLimit(userId) {
        const now = Date.now();

        if (!this.messageTimestamps.has(userId)) {
            this.messageTimestamps.set(userId, []);
        }

        const timestamps = this.messageTimestamps.get(userId);

        // Supprimer les timestamps trop anciens
        const recentTimestamps = timestamps.filter(t => now - t < this.timeWindow);
        this.messageTimestamps.set(userId, recentTimestamps);

        // Vérifier la limite
        if (recentTimestamps.length >= this.messageLimit) {
            return false; // Spam détecté
        }

        // Ajouter le timestamp actuel
        recentTimestamps.push(now);
        return true;
    }

    /**
     * Muter un utilisateur
     */
    muteUser(userId, username, duration = 60000) { // 1 minute par défaut
        this.mutedUsers.add(userId);

        // Auto-unmute après la durée
        const timeout = setTimeout(() => {
            this.unmuteUser(userId);
        }, duration);

        this.muteTimeouts.set(userId, timeout);

        console.log(`🔇 ${username} a été mute pour ${duration / 1000}s`);
        return `${username} a été mute pour ${duration / 1000} secondes`;
    }

    /**
     * Unmute un utilisateur
     */
    unmuteUser(userId) {
        this.mutedUsers.delete(userId);

        if (this.muteTimeouts.has(userId)) {
            clearTimeout(this.muteTimeouts.get(userId));
            this.muteTimeouts.delete(userId);
        }
    }

    /**
     * Vérifier si un utilisateur est mute
     */
    isMuted(userId) {
        return this.mutedUsers.has(userId);
    }

    /**
     * Bannir un utilisateur
     */
    async banUser(userId, username, roomCode) {
        this.bannedUsers.add(userId);

        // Stocker le ban dans Firebase
        try {
            await this.network.banUser(roomCode, userId, {
                username,
                bannedBy: this.userId,
                timestamp: Date.now()
            });

            console.log(`🚫 ${username} a été banni`);
            return `${username} a été banni de la partie`;
        } catch (error) {
            console.error('Erreur lors du ban:', error);
            return 'Erreur lors du ban';
        }
    }

    /**
     * Kicker un utilisateur (kick sans ban)
     */
    async kickUser(userId, username, roomCode) {
        try {
            await this.network.kickUser(roomCode, userId);
            console.log(`👢 ${username} a été kick`);
            return `${username} a été kick de la partie`;
        } catch (error) {
            console.error('Erreur lors du kick:', error);
            return 'Erreur lors du kick';
        }
    }

    /**
     * Clear le chat
     */
    async clearChat(roomCode) {
        try {
            await this.network.clearChat(roomCode);
            console.log('🧹 Chat effacé');
            return 'Chat effacé';
        } catch (error) {
            console.error('Erreur lors du clear:', error);
            return 'Erreur lors du clear';
        }
    }

    /**
     * Traiter une commande admin
     */
    processAdminCommand(command, args, roomCode) {
        if (!this.isAdmin) {
            return null;
        }

        switch (command) {
            case 'mute':
                if (args.length >= 1) {
                    const username = args[0];
                    const duration = args[1] ? parseInt(args[1]) * 1000 : 60000;
                    // Trouve l'userId par le username (besoin d'une référence aux joueurs)
                    return { action: 'mute', username, duration };
                }
                return 'Usage: /mute <username> [durée en secondes]';

            case 'unmute':
                if (args.length >= 1) {
                    const username = args[0];
                    return { action: 'unmute', username };
                }
                return 'Usage: /unmute <username>';

            case 'kick':
                if (args.length >= 1) {
                    const username = args[0];
                    return { action: 'kick', username };
                }
                return 'Usage: /kick <username>';

            case 'ban':
                if (args.length >= 1) {
                    const username = args[0];
                    return { action: 'ban', username };
                }
                return 'Usage: /ban <username>';

            case 'clear':
                return { action: 'clear' };

            default:
                return `Commandes disponibles: /mute, /unmute, /kick, /ban, /clear`;
        }
    }

    /**
     * Valider un message avant envoi
     */
    validateMessage(userId, message) {
        // Vérifier si mute
        if (this.isMuted(userId)) {
            return { valid: false, reason: 'Vous êtes mute' };
        }

        // Vérifier le rate limit
        if (!this.checkRateLimit(userId)) {
            return { valid: false, reason: 'Spam détecté - ralentissez !' };
        }

        // Vérifier les mots interdits
        if (this.containsProfanity(message)) {
            return { valid: false, reason: 'Message contient des mots interdits', filtered: this.filterMessage(message) };
        }

        return { valid: true };
    }
}
