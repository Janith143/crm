import { ContactSource, type Message, type WhatsAppSettings } from '../types';
import { API_BASE } from './api';

export const BACKEND_URL = API_BASE;
export const API_BASE_URL = API_BASE.replace('/api', '');

export const getStoredSettings = (): WhatsAppSettings => {
  const stored = localStorage.getItem('whatsapp_settings');
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    connectionType: 'qr',
    isLinked: false
  };
};

export const saveSettings = (settings: WhatsAppSettings) => {
  localStorage.setItem('whatsapp_settings', JSON.stringify(settings));
  // Sync core auth traits to backend silently
  saveSettingsToBackend({
    WA_PROVIDER: settings.connectionType,
    WA_CLOUD_TOKEN: settings.accessToken || '',
    WA_PHONE_ID: settings.phoneNumberId || '',
    WA_BUSINESS_ACCOUNT_ID: settings.businessAccountId || '',
    WA_VERIFY_TOKEN: settings.verifyToken || '',
    WA_APP_ID: settings.appId || '',
    WA_APP_SECRET: settings.appSecret || ''
  }).catch(console.error);
};

export const saveSettingsToBackend = async (settingsPayload: any) => {
  try {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: JSON.stringify({ settings: settingsPayload })
    });
  } catch (error) {
    console.error("Failed to sync settings to backend", error);
  }
};

// Helper to include JWT auth header when user is logged in
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
};

// --- REAL WORLD IMPLEMENTATION ---

export const getBackendStatus = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/status`, { headers: getAuthHeaders() });
    return await response.json();
  } catch (error) {
    console.error('Backend offline', error);
    return null;
  }
};

export const logoutBackend = async () => {
  try {
    await fetch(`${BACKEND_URL}/logout`, { method: 'POST', headers: getAuthHeaders() });
    return true;
  } catch (error) {
    return false;
  }
};

export const sendWhatsAppMessage = async (
  to: string,
  body: string,
  file?: File,
  quotedMessageId?: string
): Promise<{ success: boolean; error?: string; data?: unknown }> => {
  const settings = getStoredSettings();

  // 1. QR Mode (via Node Backend)
  if (settings.connectionType === 'qr') {
    try {
      let options: RequestInit = {};

      if (file) {
        const formData = new FormData();
        formData.append('phone', to);
        formData.append('message', body);
        formData.append('file', file);
        if (quotedMessageId) {
          formData.append('quotedMessageId', quotedMessageId);
        }
        options = {
          method: 'POST',
          body: formData
        };
      } else {
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: to, message: body, quotedMessageId })
        };
      }

      const response = await fetch(`${BACKEND_URL}/send`, options);
      const data = await response.json();
      if (data.success) {
        return { success: true, data };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to reach WhatsApp Server. Is server.js running?' };
    }
  }

  // 2. Official API Mode (Direct from Frontend)
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { success: false, error: 'Configuration missing' };
  }

  const GRAPH_API_VERSION = 'v17.0';
  const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
  // For official API, we still might need sanitization, but let's assume 'to' is correct for now or handle it if needed.
  // Official API usually expects just the number.
  const formattedPhone = to.includes('@') ? to.split('@')[0] : to.replace(/[^0-9]/g, '');

  try {
    const response = await fetch(`${BASE_URL}/${settings.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: { body }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error?.message || 'Failed to send message', data };
    }
    return { success: true, data };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
    return { success: false, error: errorMessage };
  }
};

export const sendBroadcastMessage = async (
  recipients: string[],
  message: string
): Promise<{ successful: string[]; failed: string[] }> => {
  const successful: string[] = [];
  const failed: string[] = [];

  for (const phone of recipients) {
    const result = await sendWhatsAppMessage(phone, message);
    if (result.success) {
      successful.push(phone);
    } else {
      failed.push(phone);
    }
    // Small delay to prevent rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { successful, failed };
};

export const getWhatsAppMessages = async (phone: string): Promise<any[]> => {
  const settings = getStoredSettings();

  // Always try to fetch from backend if available, as Official API implementation for history is limited/missing
  try {
    // If phone contains @, it's a chat ID, use it directly. Otherwise sanitize.
    const identifier = phone.includes('@') ? encodeURIComponent(phone) : phone.replace(/[^0-9]/g, '');
    const response = await fetch(`${BACKEND_URL}/messages/${identifier}`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (data.success) {
      return data.messages;
    }
  } catch (error) {
    console.error('Failed to fetch messages', error);
  }
  return [];
};

export const getWhatsAppChats = async (): Promise<any[]> => {
  const settings = getStoredSettings();

  // Always try to fetch from backend
  try {
    const response = await fetch(`${API_BASE}/chats`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch chats, status:', response.status, 'Error:', errorText);
      return [];
    }
    const data = await response.json();
    console.log('Fetched chats data:', data);
    if (data.success) {
      return data.chats;
    }
  } catch (error) {
    console.error('Failed to fetch chats:', error);
  }
  return [];
};

export const getProfilePicture = async (chatId: string): Promise<{ url?: string; error?: string; notFound?: boolean }> => {
  const settings = getStoredSettings();

  try {
    const response = await fetch(`${BACKEND_URL}/profile-pic/${encodeURIComponent(chatId)}`, { headers: getAuthHeaders() });
    const data = await response.json();
    if (data.success && data.url) {
      return { url: data.url };
    } else if (data.success === false && data.error === 'No profile picture') {
      return { notFound: true };
    }
  } catch (error) {
    console.error(`Failed to fetch profile pic for ${chatId}:`, error);
    return { error: 'Network error' };
  }
  return { error: 'Not connected' };
};
