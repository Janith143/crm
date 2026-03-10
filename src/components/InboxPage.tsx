
import React, { useState, useEffect, useRef } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { type Teacher, type Message, ContactSource, type TeacherStatus, type Template, type Activity } from '../types';
import { MOCK_ACTIVITIES, MOCK_TEMPLATES } from '../constants';
import { Send, Paperclip, Smile, Mic, MoreVertical, Check, CheckCheck, Sparkles, User, MessageSquare, Phone, Video, Search, FileText, Activity as ActivityIcon, Download, AlertTriangle, X, LayoutTemplate, Trash2, Plus, Reply, Forward, Maximize, Minimize, Minus, ChevronLeft, Clock } from 'lucide-react';

import { generateMessageDraft } from '../services/geminiService';
import { sendWhatsAppMessage, getStoredSettings, getWhatsAppMessages, API_BASE_URL } from '../services/whatsappService';
import { API_BASE } from '../services/api';
import * as XLSX from 'xlsx';

import { usePipeline } from '../context/PipelineContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { socket } from '../services/socket';

interface InboxPageProps {
  teachers: Teacher[];
  onUpdateTeacher: (id: string, updates: Partial<Teacher>) => void;
  selectedTeacherId?: string | null;
}

const InboxPage: React.FC<InboxPageProps> = ({ teachers, onUpdateTeacher, selectedTeacherId }) => {
  const { stages } = usePipeline();
  const queryClient = useQueryClient();
  const [activeTeacherId, setActiveTeacherId] = useState<string | null>(selectedTeacherId || null);
  // const [messages, setMessages] = useState<Record<string, Message[]>>({}); // Removed in favor of React Query cache
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'details'>('list');

  const activeTeacher = teachers.find(t => t.id === activeTeacherId);

  useEffect(() => {
    if (selectedTeacherId) {
      setActiveTeacherId(selectedTeacherId);
      setMobileView('chat');
    }
  }, [selectedTeacherId]);

  // Fetch Real Messages using React Query
  const { data: fetchedMessages } = useQuery({
    queryKey: ['messages', activeTeacherId],
    queryFn: async () => {
      if (!activeTeacherId || !activeTeacher) return [];
      console.log("Fetching messages for:", activeTeacher?.id);
      const msgs = await getWhatsAppMessages(activeTeacher.id);
      return msgs || [];
    },
    enabled: !!activeTeacherId && !!activeTeacher,
    refetchInterval: false, // Disable polling
  });
  const [activities, setActivities] = useState<Record<string, Activity[]>>({});
  const [input, setInput] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Tag editing state
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New Chat Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  // Emoji & Mic State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Message Actions State
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardSearch, setForwardSearch] = useState('');

  // Edit Profile State
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    location: '',
    notes: ''
  });

  // Image Viewer State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const handleEditProfile = () => {
    if (activeTeacher) {
      setEditFormData({
        name: activeTeacher.name,
        email: activeTeacher.email || '',
        location: activeTeacher.location || '',
        notes: activeTeacher.notes || ''
      });
      setIsEditProfileModalOpen(true);
    }
  };

  const handleSaveProfile = () => {
    if (activeTeacher) {
      onUpdateTeacher(activeTeacher.id, editFormData);
      setIsEditProfileModalOpen(false);
    }
  };

  const handleExportToExcel = () => {
    const data = teachers.map(t => {
      const teacher = t as any;
      return {
        Name: t.name,
        Phone: t.id.replace('@c.us', ''),
        Status: t.status,
        Source: t.source,
        Email: t.email || '',
        Location: t.location || '',
        Notes: t.notes || '',
        Tags: (t.tags || []).join(', '),
        PipelineStage: stages.find(s => s.id === teacher.pipelineStageId)?.name || 'Unassigned',
        UnreadCount: t.unreadCount || 0,
        LastActive: teacher.lastSeen ? new Date(teacher.lastSeen).toLocaleString() : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teachers");
    XLSX.writeFile(wb, "Teachers_Export.xlsx");
    setIsMoreMenuOpen(false);
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeTeacherId || !confirm("Delete this message for everyone?")) return;
    try {
      await fetch(`${API_BASE}/messages/${activeTeacherId}/${msgId}`, { method: 'DELETE' });
      // Optimistic update
      // Optimistic update
      queryClient.setQueryData(['messages', activeTeacherId], (old: Message[] | undefined) => {
        const current = old || [];
        return current.filter(m => m.id !== msgId);
      });
    } catch (error) {
      console.error("Failed to delete message", error);
    }
  };

  const handleReplyMessage = (msg: Message) => {
    console.log("Replying to message:", msg);
    setReplyingTo(msg);
  };

  const handleForwardMessage = (msg: Message) => {
    setForwardingMessage(msg);
    setIsForwardModalOpen(true);
  };

  const confirmForward = async (toChatId: string) => {
    if (!forwardingMessage || !activeTeacherId) return;
    try {
      await fetch(`${API_BASE}/messages/${forwardingMessage.id}/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toChatId, fromChatId: activeTeacherId })
      });
      alert("Message forwarded!");
      setIsForwardModalOpen(false);
      setForwardingMessage(null);
    } catch (error) {
      console.error("Failed to forward message", error);
      alert("Failed to forward message");
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInput(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], "voice_note.webm", { type: 'audio/webm' });

        setIsSending(true);
        const result = await sendWhatsAppMessage(activeTeacher?.id || '', '', audioFile);

        if (result.success) {
          const newMessage: Message = {
            id: Date.now().toString(),
            senderId: 'agent',
            text: '🎤 Voice Note',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isIncoming: false,
            status: 'sent',
            type: 'ptt',
          };
          if (activeTeacherId) {
            queryClient.setQueryData(['messages', activeTeacherId], (old: Message[] | undefined) => {
              const current = old || [];
              return [...current, newMessage];
            });
          }
        } else {
          setApiError(result.error || "Failed to send voice note");
        }
        setIsSending(false);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Load Templates
  useEffect(() => {
    fetch(`${API_BASE}/templates`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTemplates(data.templates);
        }
      })
      .catch(err => console.error("Failed to load templates", err));
  }, []);

  const handleAddTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTemplateName, content: newTemplateContent })
      });
      const data = await response.json();
      if (data.success) {
        setTemplates([...templates, data.template]);
        setNewTemplateName('');
        setNewTemplateContent('');
      }
    } catch (error) {
      console.error("Failed to create template", error);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      const response = await fetch(`${API_BASE}/templates/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setTemplates(templates.filter(t => t.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete template", error);
    }
  };

  // Note State
  const [noteInput, setNoteInput] = useState('');


  const currentMessages = fetchedMessages || [];
  const currentActivities = activeTeacherId ? (activities[activeTeacherId] || []) : [];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  // Reset initial load state when switching teachers
  useEffect(() => {
    isInitialLoad.current = true;
    scrollToBottom(false); // Instant scroll for new chat
  }, [activeTeacherId]);

  // Smart scroll on new messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // If it's the initial load for this chat, always scroll to bottom
    if (isInitialLoad.current && currentMessages.length > 0) {
      scrollToBottom(false);
      isInitialLoad.current = false;
      return;
    }

    // Check if user is near bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    // Only auto-scroll if user is already near bottom
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [currentMessages]);

  // Fetch Real Messages using React Query - Moved to top
  // const { data: fetchedMessages } = useQuery({...});

  // Sync fetched messages to local state
  // Sync fetched messages to local state - REMOVED
  // We now use fetchedMessages directly and update the query cache for real-time events

  // Mark as Read Logic
  const markAsRead = async (chatId: string) => {
    try {
      await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST' });
      // Optimistic update: set unreadCount to 0 for this teacher
      onUpdateTeacher(chatId, { unreadCount: 0 });
    } catch (error) {
      console.error("Failed to mark as read", error);
    }
  };

  // Trigger Mark as Read on selection
  useEffect(() => {
    if (activeTeacherId) {
      markAsRead(activeTeacherId);
    }
  }, [activeTeacherId]);

  // Ref to track active teacher for socket events without re-binding
  const activeTeacherIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTeacherIdRef.current = activeTeacherId;
  }, [activeTeacherId]);

  // Real-time Message Updates
  useEffect(() => {
    const handleNewMessage = (msg: any) => {
      // Update cache for this chat
      queryClient.setQueryData(['messages', msg.chatId], (old: Message[] | undefined) => {
        const current = old || [];
        // Avoid duplicates
        if (current.some((m: Message) => m.id === msg.id)) return current;

        // If 'pending' exists with same ID (or close match?), replace it?
        // Our 'handleSend' uses the real ID now, so exact match should work if we updated it correctly.

        return [...current, {
          id: msg.id,
          senderId: msg.senderId,
          text: msg.text,
          timestamp: msg.timestamp,
          isIncoming: msg.isIncoming,
          status: msg.status,
          type: msg.type,
          hasMedia: msg.hasMedia,
          mediaType: msg.mediaType
        }];
      });

      const currentActiveId = activeTeacherIdRef.current;
      if (currentActiveId && msg.chatId === currentActiveId) {
        markAsRead(currentActiveId);
        scrollToBottom();
      }
    };

    const handleMessageUpdate = (update: any) => {
      // update = { id, status, ack }
      // We can update ANY message because queryClient.setQueryData takes a key. 
      // But we don't know the chatId just from the update object usually, unless we pass it.
      // So we iterate active chat. Ideally server should send chatId with update.

      const currentActiveId = activeTeacherIdRef.current;
      if (!currentActiveId) return;

      queryClient.setQueryData(['messages', currentActiveId], (old: Message[] | undefined) => {
        const current = old || [];
        return current.map((m: Message) =>
          m.id === update.id ? { ...m, status: update.status } : m
        );
      });
    };

    socket.on('message_new', handleNewMessage);
    socket.on('message_update', handleMessageUpdate);

    return () => {
      socket.off('message_new', handleNewMessage);
      socket.off('message_update', handleMessageUpdate);
    };
  }, []); // Empty dependency array = stable listeners


  // Fetch Activities
  useEffect(() => {
    if (activeTeacherId) {
      fetch(`${API_BASE}/activities/${activeTeacherId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setActivities(prev => ({
              ...prev,
              [activeTeacherId]: data.activities
            }));
          }
        })
        .catch(err => console.error("Failed to fetch activities", err));
    }
  }, [activeTeacherId]);

  const handleSend = async () => {
    if (!input.trim() || !activeTeacherId || !activeTeacher) return;

    console.log("Sending message. Replying to:", replyingTo); // Debug log

    setIsSending(true);
    setApiError(null);

    // 1. Determine if we should send via Real API / QR
    const settings = getStoredSettings();
    const isQrConnected = settings.connectionType === 'qr' && settings.isLinked;
    const isApiConfigured = settings.connectionType === 'official' && settings.accessToken && settings.phoneNumberId;

    let realId = Date.now().toString(); // Default to timestamp

    if (isQrConnected || isApiConfigured) {
      const result = await sendWhatsAppMessage(activeTeacher.id, input, undefined, replyingTo?.id);
      if (!result.success) {
        setApiError(result.error || "Failed to send WhatsApp message");
        setIsSending(false);
        return; // Don't add to UI if failed
      }

      // Use real ID if available, otherwise fallback to timestamp
      // The response structure depends on whatsapp-web.js, usually response.id._serialized or response.id.id
      // Backend uses id.id for socket events and DB, so we must prefer that to avoid duplicates.
      const responseId = (result.data as any)?.response?.id;
      const responseStatus = (result.data as any)?.status; // 'queued' or undefined

      realId = responseId?.id || responseId?._serialized || ((result.data as any)?.messageId) || Date.now().toString();

      console.log(`[handleSend] RealID: ${realId}, ResponseID:`, responseId, "Status:", responseStatus);

      // 2. Add to UI (Optimistic update or success)
      queryClient.setQueryData(['messages', activeTeacherId], (old: Message[] | undefined) => {
        const current = old || [];
        // Check if already added by socket event
        if (current.some(m => m.id === realId)) return current;

        const newMessage: Message = {
          id: realId,
          senderId: 'agent',
          text: input,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isIncoming: false,
          status: responseStatus === 'queued' ? 'pending' : 'sent',
          type: 'text',
          quotedMessage: replyingTo ? {
            id: replyingTo.id,
            body: replyingTo.text,
            senderId: replyingTo.senderId
          } : undefined
        };

        return [...current, newMessage];
      });
    } else {
      // Offline/Demo mode logic if needed, or just warn
      alert("Not connected to WhatsApp");
    }


    setInput('');
    setReplyingTo(null);
    setIsSending(false);
  };

  const handleSmartReply = async () => {
    if (!activeTeacher) return;
    setIsDrafting(true);
    const lastIncoming = [...currentMessages].reverse().find(m => m.isIncoming)?.text || "No previous message";

    const draft = await generateMessageDraft(activeTeacher.name, activeTeacher.notes, lastIncoming);
    setInput(draft);
    setIsDrafting(false);
  };

  const handleAddTag = () => {
    if (!activeTeacher) return;
    const trimmed = newTag.trim();
    if (trimmed && !activeTeacher.tags.includes(trimmed)) {
      onUpdateTeacher(activeTeacher.id, { tags: [...activeTeacher.tags, trimmed] });
    }
    setNewTag('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeTeacher) return;
    onUpdateTeacher(activeTeacher.id, { tags: activeTeacher.tags.filter(t => t !== tagToRemove) });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeTeacher) {
      const file = e.target.files[0];
      setIsSending(true);

      const result = await sendWhatsAppMessage(activeTeacher.id, input, file, replyingTo?.id);

      if (result.success) {
        // Optimistic update for file
        const newMessage: Message = {
          id: Date.now().toString(),
          senderId: 'agent',
          text: input,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isIncoming: false,
          status: 'sent',
          type: 'image', // Simplified type for now
        };

        queryClient.setQueryData(['messages', activeTeacher.id], (old: Message[] | undefined) => {
          const current = old || [];
          return [...current, newMessage];
        });
        setInput('');
        setReplyingTo(null);
      } else {
        setApiError(result.error || "Failed to send file");
      }
      setIsSending(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStartNewChat = () => {
    if (!newChatPhone) return;
    // Basic validation
    const phone = newChatPhone.replace(/[^0-9]/g, '');
    if (phone.length < 10) {
      alert("Please enter a valid phone number");
      return;
    }

    // Check if already exists
    const existing = teachers.find(t => t.phone.includes(phone));
    if (existing) {
      setActiveTeacherId(existing.id);
    } else {
      // Create temporary teacher object for new chat
      // Note: In a real app, we would add this to the global state via a proper addTeacher method.
      // For now, we rely on the user sending a message to "create" the chat in the backend.
      alert("To start a new chat, please send a message to this number from your WhatsApp mobile app first, or wait for the next sync if you just added them.");
    }
    setIsNewChatModalOpen(false);
    setNewChatPhone('');
  };



  const handleSelectTemplate = (content: string) => {
    setInput(content);
    setIsTemplateModalOpen(false);
  };

  const handleAddNote = async () => {
    if (!noteInput.trim() || !activeTeacherId) return;

    const newActivity: Activity = {
      id: Date.now().toString(),
      type: 'note',
      title: 'Internal Note',
      description: noteInput,
      timestamp: new Date().toLocaleString(), // Store full date for DB
      user: 'You', // In a real app, get current user
    };

    // Optimistic Update for Activities
    setActivities(prev => ({
      ...prev,
      [activeTeacherId]: [newActivity, ...(prev[activeTeacherId] || [])]
    }));

    // Update Teacher Notes (Sync with Filter)
    if (activeTeacher) {
      const currentNotes = activeTeacher.notes || '';
      const updatedNotes = currentNotes ? `${currentNotes}\n• ${noteInput}` : `• ${noteInput}`;
      onUpdateTeacher(activeTeacherId, { notes: updatedNotes });
    }

    setNoteInput('');

    // Save Activity to DB
    try {
      await fetch(`${API_BASE}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newActivity,
          teacherId: activeTeacherId
        })
      });
    } catch (error) {
      console.error("Failed to save activity", error);
    }
  };

  return (
    <div className="flex h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="absolute inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4">Start New Chat</h3>
            <input
              type="text"
              placeholder="Phone Number (e.g., 94771234567)"
              value={newChatPhone}
              onChange={(e) => setNewChatPhone(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800 bg-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsNewChatModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleStartNewChat} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Start Chat</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {isTemplateModalOpen && (
        <div className="absolute inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <LayoutTemplate size={20} className="text-blue-600" />
                Message Templates
              </h3>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="flex gap-6 flex-1 overflow-hidden">
              {/* List */}
              <div className="w-1/2 flex flex-col border-r border-slate-100 pr-6 overflow-y-auto">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Saved Templates</h4>
                <div className="space-y-2">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="group flex items-start justify-between p-3 bg-slate-50 hover:bg-blue-50 rounded-lg border border-slate-100 hover:border-blue-100 transition-colors cursor-pointer" onClick={() => handleSelectTemplate(tpl.content)}>
                      <div>
                        <div className="font-medium text-slate-800 text-sm mb-1">{tpl.name}</div>
                        <div className="text-xs text-slate-500 line-clamp-2">{tpl.content}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {templates.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No templates saved yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Create New */}
              <div className="w-1/2 flex flex-col pl-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Create New</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={e => setNewTemplateName(e.target.value)}
                      placeholder="e.g., Price List Reply"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Message Content</label>
                    <textarea
                      value={newTemplateContent}
                      onChange={e => setNewTemplateContent(e.target.value)}
                      placeholder="Type your message template here..."
                      rows={6}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-slate-800 bg-white"
                    />
                  </div>
                  <button
                    onClick={handleAddTemplate}
                    disabled={!newTemplateName || !newTemplateContent}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Save Template
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Chat List Sidebar (Left) */}
      {!isFullScreen && (
        <div className={`border-r border-slate-200 flex-col shrink-0 ${mobileView === 'list' ? 'flex w-full' : 'hidden md:flex w-80'}`}>
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-slate-800 text-lg">Inbox</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="p-1.5 hover:bg-slate-200 rounded text-slate-500"
                  title="New Chat"
                >
                  <MessageSquare size={18} />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-500"
                    title="More Options"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {isMoreMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 w-48">
                      <button
                        onClick={handleExportToExcel}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"
                      >
                        <Download size={16} />
                        Export to Excel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:border-green-500 text-slate-800"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <span className="text-xs font-medium bg-green-100 text-green-700 px-3 py-1 rounded-full cursor-pointer whitespace-nowrap">All Chats</span>
              <span className="text-xs font-medium bg-white text-slate-600 px-3 py-1 rounded-full cursor-pointer border border-slate-200 hover:bg-slate-50 whitespace-nowrap">Unread</span>
              <span className="text-xs font-medium bg-white text-slate-600 px-3 py-1 rounded-full cursor-pointer border border-slate-200 hover:bg-slate-50 whitespace-nowrap">Awaiting</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {teachers.filter(teacher => {
              if (!searchQuery) return true;
              const query = searchQuery.toLowerCase();
              const lastMsg = teacher.lastMessage as any;
              const lastMsgBody = lastMsg?.body || '';

              return (
                teacher.name.toLowerCase().includes(query) ||
                teacher.phone.includes(query) ||
                lastMsgBody.toLowerCase().includes(query)
              );
            }).map(teacher => {
              // Combine types or cast to any to handle both Message and the partial lastMessage from API
              // Combine types or cast to any to handle both Message and the partial lastMessage from API
              const lastMsg = teacher.lastMessage as any;

              let displayTime = 'Now';
              if (lastMsg?.timestamp) {
                displayTime = typeof lastMsg.timestamp === 'string' ? lastMsg.timestamp : new Date(Number(teacher.lastActive) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              } else if (teacher.lastActive) {
                displayTime = new Date(Number(teacher.lastActive) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              }

              return (
                <div
                  key={teacher.id}
                  onClick={() => {
                    setActiveTeacherId(teacher.id);
                    setMobileView('chat');
                  }}
                  className={`p-3 flex items-center gap-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${activeTeacherId === teacher.id ? 'bg-slate-100 border-l-4 border-l-green-600' : 'border-l-4 border-l-transparent'
                    }`}
                >
                  <img
                    src={teacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`}
                    alt=""
                    className="w-12 h-12 rounded-full bg-slate-200 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`;
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className={`text-sm truncate ${teacher.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{teacher.name}</h3>
                      <span className={`text-[10px] ${teacher.unreadCount > 0 ? 'text-green-600 font-bold' : 'text-slate-400'}`}>{displayTime}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className={`text-xs truncate max-w-[140px] flex items-center gap-1 ${teacher.unreadCount > 0 ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                        {/* Check both isIncoming (Message) and fromMe (lastMessage) */}
                        {((lastMsg?.isIncoming === false) || (lastMsg?.fromMe === true)) && (
                          (lastMsg?.status === 'read' || lastMsg?.status === 3) ? <CheckCheck size={14} className="text-purple-700" /> : <Check size={14} className="text-slate-400" />
                        )}
                        {lastMsg?.text || lastMsg?.body || 'Start a conversation'}
                      </p>
                      {teacher.unreadCount > 0 && (
                        <span className="bg-green-500 text-white text-[10px] font-bold h-5 min-w-[1.25rem] px-1 rounded-full flex items-center justify-center shadow-sm">
                          {teacher.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Chat Area (Center) */}
      {activeTeacher ? (
        <div className={`flex-1 flex-col bg-[#efeae2] relative min-w-0 ${mobileView === 'chat' ? 'flex fixed inset-0 z-20' : 'hidden md:flex'}`}>
          {/* Chat Header */}
          <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-10 shadow-sm">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
              if (window.innerWidth < 768) {
                setMobileView('details');
              } else {
                setShowRightSidebar(!showRightSidebar);
              }
            }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileView('list');
                }}
                className="md:hidden p-1 -ml-2 mr-1 text-slate-500"
              >
                <ChevronLeft size={24} />
              </button>
              <img
                src={activeTeacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeTeacher.name)}&background=random`}
                alt=""
                className="w-10 h-10 rounded-full bg-slate-200 border border-slate-100"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activeTeacher.name)}&background=random`;
                }}
              />
              <div>
                <h3 className="font-bold text-slate-800">{activeTeacher.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  {activeTeacher.source} • {activeTeacher.phone}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <button
                className="hover:bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => {
                  if (activeTeacher?.phone) {
                    const phoneNumber = activeTeacher.phone.replace('@c.us', '');
                    window.open(`tel:${phoneNumber}`, '_self');
                  }
                }}
                title="System Audio Call"
              >
                <Phone size={20} />
              </button>
              <button
                className="hover:bg-green-50 p-2 rounded-full transition-colors text-green-600"
                onClick={() => {
                  if (activeTeacher?.phone) {
                    const phoneNumber = activeTeacher.phone.replace('@c.us', '');
                    window.open(`https://wa.me/${phoneNumber}`, '_blank');
                  }
                }}
                title="WhatsApp Audio Call"
              >
                <Phone size={20} />
              </button>
              {/* Video call disabled as requested */}
              <div className="h-6 w-[1px] bg-slate-200"></div>
              <button
                className={`hover:bg-slate-100 p-2 rounded-full transition-colors border border-slate-300 mx-1 ${isFullScreen ? 'text-green-600 bg-green-50' : ''}`}
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
              >
                {isFullScreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
              <button
                className="hover:bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => {
                  if (window.innerWidth < 768) {
                    setMobileView('details');
                  } else {
                    setShowRightSidebar(!showRightSidebar);
                  }
                }}
              >
                <ActivityIcon size={20} className={showRightSidebar ? 'text-green-600' : ''} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
          >
            {currentMessages.map((msg, idx) => (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`flex ${msg.isIncoming ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-2 px-3 shadow-sm text-sm relative group ${msg.isIncoming ? 'bg-white rounded-tl-none text-slate-800' : 'bg-[#d9fdd3] rounded-tr-none text-slate-900'
                    }`}
                >
                  {/* Quoted Message */}
                  {msg.quotedMessage && (
                    <div className={`mb-1 p-2 rounded border-l-4 text-xs cursor-pointer ${msg.isIncoming ? 'bg-slate-50 border-slate-300' : 'bg-green-50 border-green-600'
                      }`}
                      onClick={() => {
                        // Optional: Scroll to original message
                        const el = document.getElementById(`msg-${msg.quotedMessage?.id}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      <div className="font-bold text-slate-600 mb-0.5">
                        {msg.quotedMessage.senderId === 'agent' ? 'You' : activeTeacher.name}
                      </div>
                      <div className="line-clamp-2 text-slate-500">
                        {msg.quotedMessage.body}
                      </div>
                    </div>
                  )}
                  {/* Message Actions (Hover) */}
                  <div className={`absolute top-0 ${msg.isIncoming ? '-right-20' : '-left-20'} hidden group-hover:flex items-center gap-1 bg-white shadow-sm rounded-lg p-1 border border-slate-100`}>
                    <button onClick={() => handleReplyMessage(msg)} className="p-1 hover:bg-slate-100 rounded text-slate-500" title="Reply">
                      <Reply size={14} />
                    </button>
                    <button onClick={() => handleForwardMessage(msg)} className="p-1 hover:bg-slate-100 rounded text-slate-500" title="Forward">
                      <Forward size={14} />
                    </button>
                    <button onClick={() => handleDeleteMessage(msg.id)} className="p-1 hover:bg-red-50 rounded text-red-500" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Media Rendering */}
                  {msg.hasMedia && activeTeacher && (
                    <div className="mb-2">
                      {(msg.mediaType === 'image' || msg.mediaType === 'sticker') && (
                        <div className="relative group/image inline-block">
                          <img
                            src={`${API_BASE}/messages/${activeTeacher.phone}/${msg.id}/media`}
                            alt="Media"
                            className={`rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity ${msg.mediaType === 'sticker' ? 'w-32' : 'w-64'}`}
                            loading="lazy"
                            onClick={() => {
                              setSelectedImage(`${API_BASE}/messages/${activeTeacher.phone}/${msg.id}/media`);
                              setZoomLevel(1);
                            }}
                          />
                          <a
                            href={`${API_BASE}/messages/${activeTeacher.phone}/${msg.id}/media`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute bottom-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity backdrop-blur-sm"
                            title="Download"
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      )}
                      {msg.mediaType === 'video' && (
                        <video
                          src={`${API_BASE}/messages/${activeTeacher.phone}/${msg.id}/media`}
                          controls
                          className="rounded-lg max-w-full w-64"
                        />
                      )}
                      {(msg.mediaType === 'ptt' || msg.mediaType === 'audio') && (
                        <audio
                          src={`${API_BASE}/messages/${activeTeacher.phone}/${msg.id}/media`}
                          controls
                          className="w-64"
                        />
                      )}
                      {msg.mediaType === 'document' && (
                        <div className="flex items-center gap-2 bg-slate-100 p-2 rounded border border-slate-200">
                          <FileText size={20} className="text-slate-500" />
                          <a
                            href={`${API_BASE}/messages/${activeTeacher.phone}/${msg.id}/media`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate"
                          >
                            Download Document
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                  <div className="flex justify-end items-center gap-1 mt-1 select-none">
                    <span className="text-[10px] text-slate-500/80">{msg.timestamp}</span>
                    {!msg.isIncoming && (
                      msg.status === 'pending' ? <Clock size={12} className="text-slate-400" /> :
                        msg.status === 'read' ? <CheckCheck size={12} className="text-purple-700" /> :
                          msg.status === 'received' ? <CheckCheck size={12} className="text-slate-400" /> :
                            <Check size={12} className="text-slate-400" />
                    )}

                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
            {/* API Error Notification */}
            {apiError && (
              <div className="mb-2 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center justify-between">
                <span className="flex items-center gap-1"><AlertTriangle size={14} /> {apiError}</span>
                <button onClick={() => setApiError(null)} className="text-red-800 hover:text-red-950 font-bold">X</button>
              </div>
            )}

            {/* Smart Reply Suggestion */}
            <div className="flex justify-between items-center mb-2">
              <button
                onClick={handleSmartReply}
                disabled={isDrafting}
                className="text-xs text-purple-600 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-full border border-purple-200 transition-colors shadow-sm"
              >
                <Sparkles size={12} />
                {isDrafting ? 'Generating Draft...' : 'Draft AI Reply'}
              </button>
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                className="text-xs text-blue-600 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full border border-blue-200 transition-colors shadow-sm"
              >
                <LayoutTemplate size={12} />
                Templates
              </button>
            </div>
          </div>

          <div className="flex items-end gap-2 relative flex-col items-stretch">
            {replyingTo && (
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border-l-4 border-green-500 mb-1 w-full">
                <div className="flex flex-col text-xs">
                  <span className="font-bold text-green-600">{replyingTo.isIncoming ? activeTeacher?.name : 'You'}</span>
                  <span className="text-slate-500 truncate max-w-xs">{replyingTo.text || 'Media'}</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 w-full">
              {showEmojiPicker && (
                <div className="absolute bottom-16 left-0 z-50">
                  <EmojiPicker onEmojiClick={onEmojiClick} />
                </div>
              )}
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-200'}`}
              >
                <Smile size={24} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-500 hover:bg-slate-200 rounded-full transition-colors"
              >
                <Paperclip size={24} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,application/pdf"
              />
              <div className="flex-1 bg-white rounded-lg border border-slate-300 flex items-center px-3 py-2 focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-all">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent focus:outline-none text-slate-800 text-sm"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={async (e) => {
                    const items = e.clipboardData.items;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.indexOf('image') !== -1) {
                        e.preventDefault();
                        const file = items[i].getAsFile();
                        if (file && activeTeacher) {
                          setIsSending(true);
                          // Reuse existing file sending logic
                          const result = await sendWhatsAppMessage(activeTeacher.phone, input, file, replyingTo?.id);

                          if (result.success) {
                            // Extract real ID
                            const realId = (result.data as any)?.response?.id?._serialized || (result.data as any)?.response?.id?.id || Date.now().toString();

                            queryClient.setQueryData(['messages', activeTeacher.id], (old: Message[] | undefined) => {
                              const current = old || [];
                              if (current.some(m => m.id === realId)) return current;

                              const newMessage: Message = {
                                id: realId,
                                senderId: 'agent',
                                text: input,
                                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                isIncoming: false,
                                status: 'sent',
                                type: 'image',
                                hasMedia: true,
                                mediaType: 'image'
                              };

                              return [...current, newMessage];
                            });
                            setInput('');
                            setReplyingTo(null);
                          } else {
                            setApiError(result.error || "Failed to send pasted image");
                          }
                          setIsSending(false);
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
            {input.trim() ? (
              <button onClick={handleSend} disabled={isSending} className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors shadow-sm transform active:scale-95 disabled:opacity-50">
                <Send size={20} />
              </button>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-2 rounded-full transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-slate-500 hover:bg-slate-200'}`}
              >
                {isRecording ? <div className="w-6 h-6 flex items-center justify-center"><div className="w-3 h-3 bg-white rounded-sm" /></div> : <Mic size={24} />}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
          <MessageSquare size={48} className="mb-4 opacity-20" />
          <p>Select a conversation to start chatting</p>
        </div>
      )}

      {/* 3. Unified History / CRM Sidebar (Right) */}
      {((showRightSidebar && window.innerWidth >= 768) || mobileView === 'details') && !isFullScreen && activeTeacher && (
        <div className={`bg-white border-l border-slate-200 overflow-y-auto flex-col shrink-0 ${mobileView === 'details' ? 'flex fixed inset-0 z-30 w-full' : 'hidden md:flex w-80'}`}>
          <div className="p-6 border-b border-slate-100 flex flex-col items-center text-center bg-slate-50 relative">
            {/* Mobile Back Button */}
            <button
              onClick={() => setMobileView('chat')}
              className="absolute left-4 top-4 p-2 text-slate-500 md:hidden"
            >
              <ChevronLeft size={24} />
            </button>
            <img
              src={activeTeacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeTeacher.name)}&background=random`}
              alt=""
              className="w-20 h-20 rounded-full mb-3 shadow-sm border-2 border-white"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activeTeacher.name)}&background=random`;
              }}
            />
            <h3 className="font-bold text-lg text-slate-800">{activeTeacher.name}</h3>
            <p className="text-slate-500 text-sm mb-3">{activeTeacher.phone}</p>

            {/* Pipeline Stage Selector */}
            <div className="w-full mb-4">
              <label className="block text-xs font-medium text-slate-500 mb-1 text-left">Pipeline Stage</label>
              <select
                value={activeTeacher.status}
                onChange={(e) => onUpdateTeacher(activeTeacher.id, { status: e.target.value })}
                className="w-full p-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              >
                {stages.map(stage => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 w-full justify-center">
              <button className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50">Profile</button>
              <button onClick={handleEditProfile} className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50">Edit</button>
            </div>
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teacher Details</h4>
              {activeTeacher.assignedAgentId && (
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
                  Assigned: Agent 1
                </span>
              )}
            </div>

            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Source:</span>
                <span className="font-medium">{activeTeacher.source}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Location:</span>
                <span className="font-medium">{activeTeacher.location}</span>
              </div>
            </div>

            <div className="mb-2">
              <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase mb-2 ${activeTeacher.status === 'Active Teacher' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                }`}>
                {activeTeacher.status}
              </span>
              <div className="flex flex-wrap gap-1">
                {activeTeacher.tags.map(tag => (
                  <span key={tag} className="group px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded border border-slate-200 flex items-center gap-1 cursor-default">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="hidden group-hover:block hover:text-red-500"><X size={10} /></button>
                  </span>
                ))}

                {isAddingTag ? (
                  <input
                    type="text"
                    autoFocus
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                      if (e.key === 'Escape') {
                        setIsAddingTag(false);
                        setNewTag('');
                      }
                    }}
                    onBlur={handleAddTag}
                    className="w-20 px-1 py-0.5 text-[10px] border border-green-500 rounded outline-none bg-white shadow-sm text-slate-800"
                  />
                ) : (
                  <button
                    onClick={() => setIsAddingTag(true)}
                    className="px-2 py-0.5 border border-dashed border-slate-300 text-slate-400 text-[10px] rounded hover:border-slate-400 hover:text-slate-500"
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 p-4 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex justify-between items-center">
              <span>Unified History</span>
              <button className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm hover:bg-slate-50">Filter</button>
            </h4>

            <div className="space-y-6 relative before:absolute before:left-3.5 before:top-2 before:h-full before:w-0.5 before:bg-slate-200/60 pb-8">
              {/* Unified Activity Timeline */}
              {currentActivities.map((activity, idx) => (
                <div key={activity.id} className="relative pl-8">
                  <div className={`absolute left-0 top-0 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center z-10 shadow-sm ${activity.type === 'status_change' ? 'bg-orange-100 text-orange-600' :
                    activity.type === 'note' ? 'bg-yellow-100 text-yellow-600' :
                      activity.type === 'file' ? 'bg-blue-100 text-blue-600' :
                        activity.type === 'call' ? 'bg-purple-100 text-purple-600' :
                          'bg-green-100 text-green-600'
                    }`}>
                    {activity.type === 'status_change' && <ActivityIcon size={12} />}
                    {activity.type === 'note' && <FileText size={12} />}
                    {activity.type === 'file' && <Paperclip size={12} />}
                    {activity.type === 'call' && <Phone size={12} />}
                    {activity.type === 'message' && <MessageSquare size={12} />}
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-700">{activity.title}</span>
                      <span className="text-[10px] text-slate-400">{activity.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-600 mb-2 leading-relaxed">{activity.description}</p>

                    {/* Show file preview/download if it's a file */}
                    {activity.type === 'file' && (
                      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 mb-2">
                        <FileText size={16} className="text-blue-500" />
                        <span className="text-xs text-slate-600 truncate flex-1">document.pdf</span>
                        <Download size={14} className="text-slate-400 cursor-pointer hover:text-slate-600" />
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 flex items-center gap-1 border-t border-slate-50 pt-1 mt-1">
                      <User size={10} />
                      {activity.user}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Note Input */}
              <div className="relative pl-8 mt-4">
                <div className="absolute left-0 top-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white text-slate-500">
                  <FileText size={12} />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNote();
                      }
                    }}
                    placeholder="Add an internal note..."
                    className="w-full text-xs p-2 pr-8 rounded border border-slate-200 focus:outline-none focus:border-green-500 shadow-sm text-slate-800 bg-white"
                  />
                  <button
                    onClick={handleAddNote}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-green-600 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

      )
      }
      {/* Forward Modal */}
      {
        isForwardModalOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
              <h3 className="font-bold text-lg text-slate-800 mb-4">Forward Message</h3>
              <input
                type="text"
                placeholder="Search teachers..."
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800 bg-white"
              />
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 custom-scrollbar">
                {teachers.filter(t => t.name.toLowerCase().includes(forwardSearch.toLowerCase())).map(teacher => (
                  <button
                    key={teacher.id}
                    onClick={() => confirmForward(teacher.phone)}
                    className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors text-left"
                  >
                    <img src={teacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`} className="w-8 h-8 rounded-full bg-slate-200" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{teacher.name}</p>
                      <p className="text-xs text-slate-500">{teacher.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => setIsForwardModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        )
      }
      {/* Edit Profile Modal */}
      {isEditProfileModalOpen && activeTeacher && (
        <div className="absolute inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4">Edit Teacher Profile</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone (Read-only)</label>
                <input
                  type="text"
                  value={activeTeacher.phone}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="teacher@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  value={editFormData.location}
                  onChange={e => setEditFormData({ ...editFormData, location: e.target.value })}
                  placeholder="City, District"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={editFormData.notes}
                  onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={3}
                  placeholder="Internal notes about this teacher..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-slate-800 bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setIsEditProfileModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveProfile} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save Changes</button>
            </div>
          </div>
        </div>
      )}


      {/* Image Viewer Modal */}
      {
        selectedImage && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
            {/* Controls */}
            <div className="absolute top-4 right-4 flex gap-2 z-[101] bg-black/50 backdrop-blur-md p-2 rounded-full shadow-lg" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                className="p-2 hover:bg-white/20 text-white rounded-full transition-colors"
                title="Zoom Out"
              >
                <Minus size={20} />
              </button>
              <span className="flex items-center text-white font-mono text-sm min-w-[3rem] justify-center font-bold">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                className="p-2 hover:bg-white/20 text-white rounded-full transition-colors"
                title="Zoom In"
              >
                <Plus size={20} />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-2 hover:bg-white/20 text-white rounded-full transition-colors ml-2 border-l border-white/20 pl-4"
                title="Reset Zoom"
              >
                <Maximize size={20} />
              </button>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 hover:bg-red-500/80 text-white rounded-full transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Image Container */}
            <div
              className="overflow-auto w-full h-full flex items-center justify-center p-4"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={selectedImage}
                alt="Full Screen"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transition: 'transform 0.2s ease-out',
                  maxHeight: '90vh',
                  maxWidth: '90vw',
                  objectFit: 'contain'
                }}
                className="rounded-lg shadow-2xl"
                draggable={false}
              />
            </div>
          </div>
        )
      }
    </div >
  );
};

export default InboxPage;