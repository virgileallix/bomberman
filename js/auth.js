import {
    signInAnonymously,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/**
 * Authentication Manager - Handles all authentication methods
 */
export class AuthManager {
    constructor(firestore) {
        this.firestore = firestore;
        this.auth = getAuth();
        this.user = null;
        this.onAuthChangeCallback = null;
    }

    /**
     * Initialize auth state listener
     */
    initialize(callback) {
        this.onAuthChangeCallback = callback;

        return onAuthStateChanged(this.auth, async (user) => {
            this.user = user;

            if (user) {
                await this.initializeUserProfile(user);
            }

            if (callback) {
                callback(user);
            }
        });
    }

    /**
     * Sign in with Google
     */
    async signInWithGoogle() {
        try {
            const provider = new GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');

            const result = await signInWithPopup(this.auth, provider);
            this.user = result.user;

            await this.initializeUserProfile(result.user);

            return this.user;
        } catch (error) {
            console.error("Google sign-in error:", error);
            throw this.handleAuthError(error);
        }
    }

    /**
     * Sign in with Email/Password
     */
    async signInWithEmail(email, password) {
        try {
            const result = await signInWithEmailAndPassword(this.auth, email, password);
            this.user = result.user;

            await this.initializeUserProfile(result.user);

            return this.user;
        } catch (error) {
            console.error("Email sign-in error:", error);
            throw this.handleAuthError(error);
        }
    }

    /**
     * Create account with Email/Password
     */
    async createAccountWithEmail(email, password, username) {
        try {
            const result = await createUserWithEmailAndPassword(this.auth, email, password);
            this.user = result.user;

            // Store username for profile creation
            localStorage.setItem('bomberman_username', username);

            await this.initializeUserProfile(result.user);

            return this.user;
        } catch (error) {
            console.error("Account creation error:", error);
            throw this.handleAuthError(error);
        }
    }

    /**
     * Sign in anonymously (fallback)
     */
    async signInAnonymously() {
        try {
            const result = await signInAnonymously(this.auth);
            this.user = result.user;

            await this.initializeUserProfile(result.user);

            return this.user;
        } catch (error) {
            console.error("Anonymous sign-in error:", error);
            throw this.handleAuthError(error);
        }
    }

    /**
     * Sign out
     */
    async signOut() {
        try {
            await signOut(this.auth);
            this.user = null;
        } catch (error) {
            console.error("Sign-out error:", error);
            throw error;
        }
    }

    /**
     * Initialize or update user profile in Firestore
     */
    async initializeUserProfile(user) {
        let username;

        // Determine username based on auth method
        if (user.displayName) {
            username = user.displayName;
        } else {
            username = localStorage.getItem('bomberman_username') || `Player${Math.floor(Math.random() * 9999)}`;
        }

        // Save username to localStorage
        localStorage.setItem('bomberman_username', username);

        const userRef = doc(this.firestore, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Create new user profile
            await setDoc(userRef, {
                username: username,
                email: user.email || null,
                photoURL: user.photoURL || null,
                provider: user.providerData[0]?.providerId || 'anonymous',
                elo: 1000,
                rank: 'Bronze',
                createdAt: Timestamp.now(),
                gamesPlayed: 0,
                wins: 0,
                kills: 0,
                deaths: 0
            });
        } else {
            // Update existing profile if needed
            const data = userSnap.data();
            const updates = {};

            if (data.username !== username) {
                updates.username = username;
            }

            if (user.photoURL && data.photoURL !== user.photoURL) {
                updates.photoURL = user.photoURL;
            }

            if (Object.keys(updates).length > 0) {
                await updateDoc(userRef, updates);
            }
        }

        return username;
    }

    /**
     * Get current user profile
     */
    async getUserProfile() {
        if (!this.user) return null;

        const userRef = doc(this.firestore, 'users', this.user.uid);
        const userSnap = await getDoc(userRef);

        return userSnap.exists() ? userSnap.data() : null;
    }

    /**
     * Update username
     */
    async updateUsername(newUsername) {
        if (!this.user) return;

        localStorage.setItem('bomberman_username', newUsername);

        const userRef = doc(this.firestore, 'users', this.user.uid);
        await updateDoc(userRef, { username: newUsername });
    }

    /**
     * Get user ID
     */
    getUserId() {
        return this.user?.uid || null;
    }

    /**
     * Get username
     */
    getUsername() {
        return localStorage.getItem('bomberman_username') || 'Guest';
    }

    /**
     * Check if user is signed in
     */
    isSignedIn() {
        return this.user !== null;
    }

    /**
     * Handle authentication errors
     */
    handleAuthError(error) {
        const errorMessages = {
            'auth/email-already-in-use': 'Cet email est déjà utilisé',
            'auth/invalid-email': 'Email invalide',
            'auth/operation-not-allowed': 'Opération non autorisée',
            'auth/weak-password': 'Mot de passe trop faible (min 6 caractères)',
            'auth/user-disabled': 'Compte désactivé',
            'auth/user-not-found': 'Utilisateur non trouvé',
            'auth/wrong-password': 'Mot de passe incorrect',
            'auth/popup-closed-by-user': 'Connexion annulée',
            'auth/cancelled-popup-request': 'Connexion annulée',
            'auth/network-request-failed': 'Erreur réseau',
            'auth/too-many-requests': 'Trop de tentatives, réessayez plus tard'
        };

        const message = errorMessages[error.code] || error.message;
        return new Error(message);
    }
}
