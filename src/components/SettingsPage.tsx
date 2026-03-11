import React, { useState, useEffect, useRef } from 'react';
import { Save, AlertCircle, CheckCircle, Smartphone, QrCode, RefreshCw, LogOut, LayoutGrid, Key, Shield } from 'lucide-react';
import { type WhatsAppSettings } from '../types';
import { getStoredSettings, saveSettings, getBackendStatus, logoutBackend } from '../services/whatsappService';
import { socket } from '../services/socket';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<'qr' | 'official'>('qr');
  const [settings, setSettings] = useState<WhatsAppSettings>({
    connectionType: 'qr',
    isLinked: false,
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
  });

  const [qrStatus, setQrStatus] = useState<'idle' | 'loading' | 'ready' | 'scanned' | 'authenticating'>('idle');
  const [qrData, setQrData] = useState<string>('');
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
  };

  const updateLinkedState = (isLinked: boolean, number?: string, name?: string) => {
    const newSettings: WhatsAppSettings = {
      ...settings,
      connectionType: 'qr',
      isLinked: isLinked,
      linkedNumber: number || settings.linkedNumber,
      sessionName: name || settings.sessionName
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const checkBackendStatus = React.useCallback(async () => {
    try {
      const status = await getBackendStatus();
      setServerStatus('online');
      if (status) {
        if (status.connected) {
          updateLinkedState(true, status.info?.number, status.info?.name);
          setQrStatus('idle');
          stopPolling();
        } else if (status.authenticated) {
          // Authenticated but not fully ready
          setQrStatus('authenticating');
          // Keep polling until 'connected' becomes true
        } else {
          // Backend reports disconnected - update UI to reflect this
          if (settings.isLinked) {
            updateLinkedState(false);
          }

          if (status.qrCode) {
            setQrData(status.qrCode);
            setQrStatus('ready');
          } else {
            // Backend running but not ready/no QR yet, stick to loading or idle
          }
        }
      }
    } catch (error) {
      setServerStatus('offline');
      console.error("Backend check failed:", error);
    }
  }, [qrStatus, settings.isLinked, settings.linkedNumber, settings.sessionName]);

  useEffect(() => {
    const stored = getStoredSettings();
    if (stored) {
      setSettings(stored);
      if (stored.connectionType) {
        setActiveTab(stored.connectionType);
      }
    }

    // Check status on load
    checkBackendStatus();

    return () => stopPolling();
  }, [checkBackendStatus]);

  // Polling Fallback Effect
  useEffect(() => {
    // If we are in 'authenticating' or 'loading' state, we should poll in case we miss the socket event
    if (qrStatus === 'authenticating' || qrStatus === 'loading') {
      const intervalId = setInterval(async () => {
        console.log(`Polling status due to stuck state: ${qrStatus}`);
        await checkBackendStatus();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(intervalId);
    }
  }, [qrStatus, checkBackendStatus]);

  // Socket Listener for Real-time QR
  useEffect(() => {
    const handleQrUpdate = (data: { qr: string }) => {
      console.log("Socket: QR Received");
      setQrData(data.qr);
      setQrStatus('ready');
      setServerStatus('online');
      stopPolling(); // Stop polling if we get real-time update
    };

    const handleAuthenticated = (data: { authenticated: boolean }) => {
      console.log("Socket: Authenticated");
      setQrStatus('authenticating');
    };

    const handleStatus = (data: { connected: boolean; authenticated?: boolean }) => {
      console.log("Socket: Status Update", data);
      if (data.connected) {
        updateLinkedState(true);
        setQrStatus('idle');
        stopPolling();
      }
    };

    const handleAuthFailure = (data: { message: string }) => {
      console.error("Socket: Auth Failure", data);
      setQrStatus('idle'); // Reset to allow retry
      updateLinkedState(false);
    };

    const handleLoadingScreen = (data: { percent: number, message: string }) => {
      console.log("Socket: Loading", data);
      setQrStatus('authenticating');
    };

    socket.on('qr', handleQrUpdate);
    socket.on('authenticated', handleAuthenticated);
    socket.on('status', handleStatus); // Add this listener!
    socket.on('auth_failure', handleAuthFailure);
    socket.on('loading_screen', handleLoadingScreen);

    return () => {
      socket.off('qr', handleQrUpdate);
      socket.off('authenticated', handleAuthenticated);
      socket.off('status', handleStatus);
      socket.off('auth_failure', handleAuthFailure);
      socket.off('loading_screen', handleLoadingScreen);
    };
  }, []);

  // Handle Tab Switch
  const handleTabChange = (tab: 'qr' | 'official') => {
    setActiveTab(tab);
    const newSettings = { ...settings, connectionType: tab };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // --- Official API Handlers ---
  const handleApiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveApi = () => {
    saveSettings(settings);
    alert("Official API settings saved.");
  };

  // --- QR Code Handlers ---
  const generateQRCode = () => {
    setQrStatus('loading');

    // Start Polling the backend every 2 seconds
    if (pollInterval.current) clearInterval(pollInterval.current);

    pollInterval.current = setInterval(async () => {
      await checkBackendStatus();
    }, 2000);
  };

  const handleLogout = async () => {
    await logoutBackend();
    updateLinkedState(false, undefined, undefined);
    setQrStatus('idle');
  };

  const handleManualRefresh = async () => {
    // Force logout (resets backend state)
    await logoutBackend();
    // Restart generation flow
    generateQRCode();
  };

  const handleTestNotification = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop notifications");
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification("Test Notification", {
        body: "This is a test notification from Clazz CRM",
        icon: '/icon-192.png'
      });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification("Test Notification", {
          body: "This is a test notification from Clazz CRM",
          icon: '/icon-192.png'
        });
      }
    } else {
      alert("Notifications are blocked. Please enable them in your browser settings (click the lock icon in the address bar).");
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar pr-2">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Connection Settings</h1>
          <p className="text-slate-500">Choose how you want to connect your WhatsApp account.</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 border ${serverStatus === 'online' ? 'bg-green-100 text-green-700 border-green-200' :
          serverStatus === 'offline' ? 'bg-red-100 text-red-700 border-red-200' :
            'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
          <div className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-green-500' :
            serverStatus === 'offline' ? 'bg-red-500' :
              'bg-slate-400 animate-pulse'
            }`}></div>
          {serverStatus === 'online' ? 'Backend Online' :
            serverStatus === 'offline' ? 'Backend Offline' : 'Checking Status...'}
        </div>
        <button
          onClick={handleTestNotification}
          className="ml-4 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
        >
          Test Notification
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-200">
        <button
          onClick={() => handleTabChange('qr')}
          className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'qr' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
          <QrCode size={18} />
          Link via QR Code
        </button>
        <button
          onClick={() => handleTabChange('official')}
          className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'official' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
          <LayoutGrid size={18} />
          Official Meta API
        </button>
      </div>

      {/* QR Code Section */}
      {activeTab === 'qr' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Left: Instructions */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Use WhatsApp on Clazz.lk</h2>
              <p className="text-slate-500 text-sm">
                Link your WhatsApp number to manage chats, teachers, and broadcasts directly from this CRM using the backend bridge.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Instructions</h3>
              <ol className="list-decimal list-inside space-y-3 text-sm text-slate-600">
                <li>Ensure <code>node server.js</code> is running in your terminal.</li>
                <li>Open <strong>WhatsApp</strong> on your phone.</li>
                <li>Tap <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.</li>
                <li>Scan the code generated on the right.</li>
              </ol>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Shield size={14} />
              End-to-end encrypted via Local WhatsApp Web Session
            </div>
          </div>

          {/* Right: The Scanner */}
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
            {settings.isLinked ? (
              <div className="text-center">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Connected</h3>
                <p className="text-slate-500 mb-6">WhatsApp is linked and ready.</p>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-left mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">Number:</span>
                    <span className="font-mono font-medium">+{settings.linkedNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Session:</span>
                    <span className="font-medium">{settings.sessionName}</span>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 mx-auto"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            ) : (
              <div className="text-center w-full">
                {qrStatus === 'idle' && (
                  <div className="flex flex-col items-center">
                    <Smartphone size={64} className="text-slate-300 mb-4" />
                    <button
                      onClick={generateQRCode}
                      className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium shadow-sm flex items-center gap-2"
                    >
                      <QrCode size={20} />
                      Generate QR Code
                    </button>
                    <p className="mt-4 text-xs text-slate-400">Ensure server is running on port 3001</p>
                  </div>
                )}

                {qrStatus === 'loading' && (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500 text-sm">Fetching QR from server...</p>
                  </div>
                )}

                {qrStatus === 'authenticating' && (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
                    <h3 className="text-lg font-bold text-slate-700">Authenticating...</h3>
                    <p className="text-slate-500 text-sm mt-2 max-w-xs text-center mb-6">
                      Phone connected. Downloading recent messages...
                    </p>

                    {/* Manual Refresh Button (Emergency Escape) */}
                    <button
                      onClick={handleManualRefresh}
                      className="text-slate-500 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-slate-200 hover:border-red-200"
                    >
                      <RefreshCw size={16} />
                      Force Refresh / Reset
                    </button>
                  </div>
                )}

                {qrStatus === 'ready' && qrData && (
                  <div className="flex flex-col items-center animate-in zoom-in duration-300">
                    <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-sm mb-4">
                      <img src={qrData} alt="Scan Me" className="w-[250px] h-[250px]" />
                    </div>

                    {/* Status Text */}
                    <div className="flex items-center gap-2 text-sm text-slate-500 animate-pulse mb-4">
                      <RefreshCw size={14} className="animate-spin" />
                      Waiting for scan...
                    </div>

                    {/* Manual Refresh Button */}
                    <button
                      onClick={handleManualRefresh}
                      className="text-slate-500 hover:text-green-600 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-slate-200 hover:border-green-200"
                    >
                      <RefreshCw size={16} />
                      Refresh QR Code
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Official API Section */}
      {activeTab === 'official' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
            <span className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><LayoutGrid size={20} /></span>
            WhatsApp Cloud API Configuration
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number ID</label>
              <div className="relative">
                <input
                  type="text"
                  name="phoneNumberId"
                  value={settings.phoneNumberId}
                  onChange={handleApiChange}
                  placeholder="e.g. 104567890123456"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                />
                <Smartphone className="absolute left-3 top-2.5 text-slate-400" size={16} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Business Account ID</label>
              <div className="relative">
                <input
                  type="text"
                  name="businessAccountId"
                  value={settings.businessAccountId || ''}
                  onChange={handleApiChange}
                  placeholder="e.g. 102345678901234"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                />
                <LayoutGrid className="absolute left-3 top-2.5 text-slate-400" size={16} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Permanent Access Token</label>
              <div className="relative">
                <input
                  type="password"
                  name="accessToken"
                  value={settings.accessToken || ''}
                  onChange={handleApiChange}
                  placeholder="EAAG..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                />
                <Key className="absolute left-3 top-2.5 text-slate-400" size={16} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Verify Token</label>
              <div className="relative">
                <input
                  type="text"
                  name="verifyToken"
                  value={settings.verifyToken || ''}
                  onChange={handleApiChange}
                  placeholder="e.g. my_secret_verify_token"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                />
                <Shield className="absolute left-3 top-2.5 text-slate-400" size={16} />
              </div>
              <p className="text-xs text-slate-500 mt-1">Use this token when verifying the Webhook URL in your Meta App Dashboard.</p>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-sm text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <strong>Advanced Mode:</strong> This requires a Meta Developer Account and a configured Facebook App.
                Use this for high-volume enterprise messaging.
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveApi}
                className="bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <Save size={18} />
                Save API Config
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;