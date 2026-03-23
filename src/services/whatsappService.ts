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

export const getSettingsFromBackend = async (): Promise<Partial<WhatsAppSettings> | null> => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/settings`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      }
    });
    const data = await response.json();
    if (data.success && data.settings) {
      return {
        connectionType: data.settings.WA_PROVIDER as 'qr' | 'official' || 'qr',
        accessToken: data.settings.WA_CLOUD_TOKEN || '',
        phoneNumberId: data.settings.WA_PHONE_ID || '',
        businessAccountId: data.settings.WA_BUSINESS_ACCOUNT_ID || '',
        verifyToken: data.settings.WA_VERIFY_TOKEN || '',
        appId: data.settings.WA_APP_ID || '',
        appSecret: data.settings.WA_APP_SECRET || ''
      };
    }
  } catch (error) {
    console.error("Failed to fetch settings from backend", error);
  }
  return null;
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

  // 2. Official API Mode — Route through backend so messages are saved to DB
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
};

export const sendBroadcastMessage = async (
  recipients: string[],
  messages: string[],
  batchSize: number = 10,
  delayMinutes: number = 10,
  delaySeconds: number = 0,
  messageDelaySeconds: number = 2,
  files?: (File | null)[],
  onProgress?: (sent: number, total: number, status: string, nextBatchTime: Date | null) => void
): Promise<{ successful: string[]; failed: string[] }> => {
  const successful: string[] = [];
  const failed: string[] = [];
  const total = recipients.length;
  let overallSentIndex = 0;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = recipients.slice(i, i + batchSize);

    // Process current batch
    for (const phone of chunk) {
      if (onProgress) {
        onProgress(successful.length + failed.length, total, 'Sending messages...', null);
      }

      const sendIndex = overallSentIndex % messages.length;
      const currentMessage = messages[sendIndex];
      const currentFile = files && files.length > sendIndex ? files[sendIndex] : null;

      const result = await sendWhatsAppMessage(phone, currentMessage, currentFile || undefined);
      overallSentIndex++;

      if (result.success) {
        successful.push(phone);
      } else {
        failed.push(phone);
      }

      // Configurable gap between individual messages
      await new Promise(resolve => setTimeout(resolve, messageDelaySeconds * 1000));
    }

    // If there are more batches left, apply the delay
    if (i + batchSize < total) {
      const delayMs = (delayMinutes * 60 + delaySeconds) * 1000;
      const nextBatchTime = new Date(Date.now() + delayMs);

      if (onProgress) {
        const delayStr = delayMinutes > 0
          ? `${delayMinutes}m ${delaySeconds}s`
          : `${delaySeconds}s`;

        onProgress(
          successful.length + failed.length,
          total,
          `Waiting ${delayStr} before next batch to prevent ban risk...`,
          nextBatchTime
        );
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (onProgress) {
    onProgress(total, total, 'Completed', null);
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
