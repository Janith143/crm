import { io } from 'socket.io-client';

// Initialize Socket.IO
// Determine URL based on environment
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const socketUrl = isLocal ? 'http://localhost:3001' : 'https://crm.panoralink.com';

export const socket = io(socketUrl, { secure: !isLocal });

socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
});

socket.on('connect_error', (err) => {
    console.error('❌ Socket connection error:', err);
});

socket.on('disconnect', (reason) => {
    console.warn('⚠️ Socket disconnected:', reason);
});
