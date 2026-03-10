// Profile Picture Cache Service
// Stores and retrieves profile picture URLs from localStorage

interface CachedProfilePic {
    url: string;
    timestamp: number;
}

const CACHE_KEY = 'profile_pic_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const profilePicCache = {
    // Get cached profile picture URL
    get: (chatId: string): string | null => {
        try {
            const cache = localStorage.getItem(CACHE_KEY);
            if (!cache) return null;

            const parsed = JSON.parse(cache);
            const cached = parsed[chatId] as CachedProfilePic | undefined;

            if (!cached) return null;

            // Check if cache is expired
            const now = Date.now();
            if (now - cached.timestamp > CACHE_DURATION) {
                // Cache expired, remove it
                profilePicCache.remove(chatId);
                return null;
            }

            return cached.url;
        } catch (error) {
            console.error('Error reading profile pic cache:', error);
            return null;
        }
    },

    // Set profile picture URL in cache
    set: (chatId: string, url: string): void => {
        try {
            const cache = localStorage.getItem(CACHE_KEY);
            const parsed = cache ? JSON.parse(cache) : {};

            parsed[chatId] = {
                url,
                timestamp: Date.now()
            };

            localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        } catch (error) {
            console.error('Error writing profile pic cache:', error);
        }
    },

    // Remove a specific cached profile picture
    remove: (chatId: string): void => {
        try {
            const cache = localStorage.getItem(CACHE_KEY);
            if (!cache) return;

            const parsed = JSON.parse(cache);
            delete parsed[chatId];

            localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        } catch (error) {
            console.error('Error removing from profile pic cache:', error);
        }
    },

    // Clear all cached profile pictures
    clear: (): void => {
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch (error) {
            console.error('Error clearing profile pic cache:', error);
        }
    }
};
