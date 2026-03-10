import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import DashboardHome from './components/DashboardHome';
import InboxPage from './components/InboxPage';
import PipelinePage from './components/PipelinePage';
import ContactsPage from './components/ContactsPage';
import BroadcastPage from './components/BroadcastPage';
import AutomationPage from './components/AutomationPage';
import TeacherFilterPage from './components/TeacherFilterPage';
import LoginPage from './components/LoginPage';
import AdminPage from './components/AdminPage';
import SettingsPage from './components/SettingsPage';
import { Toaster } from 'react-hot-toast';
import { fetchMetadata, updateMetadata } from './services/api';
import { getWhatsAppChats, getProfilePicture, getBackendStatus } from './services/whatsappService';
import { DEFAULT_STATUSES, ContactSource } from './types';
import type { Teacher } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PipelineProvider } from './context/PipelineContext';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { socket } from './services/socket';

// Initialize Socket.IO
// Socket initialization moved to services/socket.ts

// Initialize QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; qrCode?: string | null; isBackendOffline?: boolean }>({ connected: false });
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Profile Picture Lazy Loading State
  const [profilePicQueue, setProfilePicQueue] = useState<string[]>([]);
  const [isFetchingProfilePic, setIsFetchingProfilePic] = useState(false);
  const [profilePicCache, setProfilePicCache] = useState<Record<string, string>>({});
  const queueRef = useRef<string[]>([]); // Ref to track queue without triggering effects unnecessarily
  const cacheRef = useRef<Record<string, string>>({});

  // Sync cacheRef with state
  useEffect(() => {
    cacheRef.current = profilePicCache;
  }, [profilePicCache]);

  // Load merged data from WhatsApp + LocalStorage
  const queryClient = useQueryClient();

  // Fetch Teachers using React Query
  const { data: fetchedTeachers = [], refetch: refetchTeachers, isLoading, error } = useQuery({
    queryKey: ['teachers'],
    queryFn: async () => {
      console.log('🔄 Fetching teachers...');
      if (!isAuthenticated) return [];
      try {
        // Now returns merged data (chats + metadata) from server
        const chats = await getWhatsAppChats();
        console.log('📥 Chats with metadata:', chats?.length);
        if (chats.length > 0) {
          console.log('Sample Chat:', JSON.stringify(chats[0], null, 2));
        }

        // Map to Teacher type if needed, but server already returns compatible structure
        // We just need to ensure defaults
        const teachers: Teacher[] = chats.map((chat: any) => ({
          id: chat.id,
          name: chat.name || 'Unknown',
          phone: chat.id.replace('@c.us', ''),
          location: chat.location || '',
          source: chat.source || ContactSource.WHATSAPP,
          status: chat.status || DEFAULT_STATUSES.NEW_LEAD,
          tags: chat.tags || [],
          email: chat.email || '',
          avatarUrl: cacheRef.current[chat.id] || chat.avatarUrl || '', // Use cache or server provided
          unreadCount: chat.unreadCount || 0,
          lastActive: chat.timestamp || 0,
          notes: chat.notes || '',
          assignedAgentId: chat.assignedAgentId,
          lastMessage: chat.lastMessage
        }));

        return teachers.sort((a, b) => (Number(b.lastActive) || 0) - (Number(a.lastActive) || 0));
      } catch (err) {
        console.error('❌ Error in queryFn:', err);
        throw err;
      }
    },
    enabled: isAuthenticated
  });

  // Sync teachers state for child components (legacy support until full refactor)
  useEffect(() => {
    console.log('⚡ Effect triggered. fetchedTeachers:', fetchedTeachers.length);
    if (fetchedTeachers.length > 0) {
      setTeachers(fetchedTeachers as Teacher[]);

      // Populate Profile Pic Queue for missing avatars
      const missingPics = fetchedTeachers
        .filter((t: any) => !t.avatarUrl && !cacheRef.current[t.id])
        .map((t: any) => t.id);

      if (missingPics.length > 0) {
        setProfilePicQueue(prev => {
          // Avoid duplicates
          const newQueue = [...prev, ...missingPics.filter((id: string) => !prev.includes(id))];
          return newQueue;
        });
      }
    }
  }, [fetchedTeachers]);

  // Check Backend Status
  useEffect(() => {
    const checkStatus = async () => {
      const status = await getBackendStatus();
      if (status) {
        setConnectionStatus({ connected: status.connected, qrCode: status.qrCode || null, isBackendOffline: false });
      } else {
        setConnectionStatus({ connected: false, isBackendOffline: true });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Request Notification Permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Real-time Updates via Socket.IO
  useEffect(() => {
    socket.on('message_new', (msg: any) => {
      console.log('🔔 New Message Received (Socket):', msg);

      // Optimistic Update: Move chat to top and update details
      setTeachers(prev => {
        const otherTeachers = prev.filter(t => t.id !== msg.chatId);
        const targetTeacher = prev.find(t => t.id === msg.chatId);

        if (targetTeacher) {
          return [{
            ...targetTeacher,
            lastMessage: {
              body: msg.text || (msg.hasMedia ? '📷 Media' : ''),
              type: msg.type,
              status: msg.status,
              fromMe: msg.senderId === 'agent'
            },
            lastActive: String(Date.now() / 1000), // Update timestamp
            unreadCount: (selectedTeacherId === msg.chatId) ? 0 : (targetTeacher.unreadCount + 1)
          }, ...otherTeachers];
        } else {
          // New chat (not in list yet) - trigger refetch to get full metadata
          queryClient.invalidateQueries({ queryKey: ['teachers'] });
          return prev;
        }
      });

      // Play Notification Sound
      const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); // Short beep
      audio.play().catch(e => console.warn("Audio play failed", e));

      // Trigger System Notification
      // Don't notify if we are already looking at this chat and window is focused
      if (document.visibilityState === 'visible' && selectedTeacherId === msg.chatId) {
        return;
      }

      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          const notification = new Notification(`New message from ${msg.senderId === 'agent' ? 'You' : 'Teacher'}`, {
            body: msg.text || (msg.hasMedia ? '📷 Media' : 'New message'),
            icon: '/icon-192.png',
            tag: msg.chatId
          });
          notification.onclick = () => {
            window.focus();
            setSelectedTeacherId(msg.chatId);
            navigate('/inbox');
          };
        }
      }
    });

    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket - Refetching Data');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });


    return () => {
      socket.off('message_new');
      socket.off('connect');
    };
  }, []);

  // Process Profile Picture Queue
  useEffect(() => {
    let active = true;
    const processQueue = async () => {
      if (profilePicQueue.length === 0 || isFetchingProfilePic) return;

      setIsFetchingProfilePic(true);
      const chatId = profilePicQueue[0];

      // Timeout promise to prevent hanging
      const fetchPromise = getProfilePicture(chatId);
      const timeoutPromise = new Promise<{ error: string }>((resolve) =>
        setTimeout(() => resolve({ error: 'Timeout' }), 10000)
      );

      try {
        const result: any = await Promise.race([fetchPromise, timeoutPromise]);

        // Even if the effect cleaned up, we want to update the state if the component is still mounted.
        // But here 'active' tracks this specific effect run.
        // The issue is that profilePicQueue changes might trigger re-runs.
        // We should check if the result matches the current head of the queue?
        // Or just proceed. The critical part is updating the cache and state.

        if (result.url) {
          // Update Cache
          setProfilePicCache(prev => {
            const newCache = { ...prev, [chatId]: result.url };
            cacheRef.current = newCache;
            return newCache;
          });
          // Update Teachers State Directly
          setTeachers(prev => {
            return prev.map(t => t.id === chatId ? { ...t, avatarUrl: result.url } : t);
          });
        } else if (result.notFound || result.error) {
          const defaultAvatar = `https://ui-avatars.com/api/?name=User&background=random`;
          setProfilePicCache(prev => ({ ...prev, [chatId]: defaultAvatar }));
          setTeachers(prev => prev.map(t => t.id === chatId ? { ...t, avatarUrl: defaultAvatar } : t));
        }
      } catch (error) {
        console.error(`Failed to fetch profile pic for ${chatId}`, error);
        const defaultAvatar = `https://ui-avatars.com/api/?name=User&background=random`;
        setProfilePicCache(prev => ({ ...prev, [chatId]: defaultAvatar }));
        setTeachers(prev => prev.map(t => t.id === chatId ? { ...t, avatarUrl: defaultAvatar } : t));
      } finally {
        // Always remove from queue and reset fetching state
        setProfilePicQueue(prev => prev.filter(id => id !== chatId));
        queueRef.current = queueRef.current.filter(id => id !== chatId);

        setTimeout(() => {
          setIsFetchingProfilePic(false);
        }, 200);
      }
    };

    processQueue();

    return () => { active = false; };
  }, [profilePicQueue, isFetchingProfilePic]);

  const updateTeacherStatus = async (id: string, newStatus: string) => {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;

    // Optimistic update
    setTeachers(prev => prev.map(t =>
      t.id === id ? { ...t, status: newStatus } : t
    ));

    // API Call
    try {
      // Send full object to avoid overwriting other fields with NULL
      const payload = { ...teacher, status: newStatus };
      await updateMetadata(id, payload);
    } catch (error) {
      console.error("Failed to update status", error);
      // Revert if needed
      setTeachers(prev => prev.map(t =>
        t.id === id ? { ...t, status: teacher.status } : t
      ));
    }
  };

  const handleUpdateTeacher = async (id: string, updates: Partial<Teacher>) => {
    const currentTeacher = teachers.find(t => t.id === id);

    setTeachers(prev => prev.map(t =>
      t.id === id ? { ...t, ...updates } : t
    ));

    try {
      // Send full object to prevent overwriting other fields with NULL
      const payload = currentTeacher ? { ...currentTeacher, ...updates } : updates;
      await updateMetadata(id, payload);
    } catch (error) {
      console.error("Failed to update teacher", error);
    }
  };

  const navigateToInbox = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    navigate('/inbox');
  };

  const handleDashboardNavigate = (tab: string) => {
    const path = tab === 'dashboard' ? '/' : `/${tab}`;
    navigate(path);
  };

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-hidden p-4 flex flex-col relative w-full">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between mb-4">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <span className="font-bold text-lg text-slate-800">Clazz CRM</span>
          <div className="w-10"></div> {/* Spacer for centering */}
        </div>
        {/* Connection Status Banner */}
        {connectionStatus.isBackendOffline && (
          <div className="bg-red-600 text-white px-4 py-2 text-sm font-bold text-center shadow-md z-50">
            ⚠️ Backend Server is Offline. Please ensure 'node server.js' is running.
          </div>
        )}
        {!connectionStatus.isBackendOffline && !connectionStatus.connected && (
          <div className="bg-amber-500 text-white px-4 py-2 text-sm font-bold text-center shadow-md z-50 flex items-center justify-center gap-2">
            <span>⚠️ WhatsApp Not Connected. Chats may not load.</span>
            {connectionStatus.qrCode && (
              <button
                onClick={() => {
                  const win = window.open("", "QR Code", "width=400,height=400");
                  if (win) {
                    win.document.write(`<img src="${connectionStatus.qrCode}" style="width:100%"/>`);
                    win.document.title = "Scan WhatsApp QR";
                  }
                }}
                className="bg-white text-amber-600 px-2 py-0.5 rounded text-xs uppercase hover:bg-amber-50"
              >
                View QR
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-hidden relative">
          <Routes>
            <Route path="/" element={<DashboardHome teachers={teachers} onNavigate={handleDashboardNavigate} />} />
            <Route path="/inbox" element={<InboxPage teachers={teachers} onUpdateTeacher={handleUpdateTeacher} selectedTeacherId={selectedTeacherId} />} />
            <Route path="/pipeline" element={<PipelinePage teachers={teachers} updateStatus={updateTeacherStatus} />} />
            <Route path="/contacts" element={<ContactsPage teachers={teachers} setTeachers={handleUpdateTeacher} />} />
            <Route path="/broadcast" element={<BroadcastPage teachers={teachers} />} />
            <Route path="/automations" element={<AutomationPage />} />
            <Route path="/filter" element={<TeacherFilterPage teachers={teachers} onNavigateToInbox={navigateToInbox} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          {/* Debug: Test Notification Button */}
          <button
            onClick={() => {
              if (Notification.permission !== 'granted') {
                Notification.requestPermission().then(perm => {
                  if (perm === 'granted') {
                    new Notification("Test Notification", { body: "This is a test!", icon: "/icon-192.png" });
                  } else {
                    alert("Permission denied!");
                  }
                });
              } else {
                new Notification("Test Notification", { body: "This is a test!", icon: "/icon-192.png" });
              }
            }}
            className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-full text-xs shadow-lg z-50 hover:bg-blue-700"
          >
            Test Notification
          </button>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <PipelineProvider>
        <QueryClientProvider client={queryClient}>
          <Router>
            <AppContent />
            <Toaster position="top-right" />
          </Router>
        </QueryClientProvider>
      </PipelineProvider>
    </AuthProvider>
  );
};

export default App;