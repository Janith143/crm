import React from 'react';
// Force HMR update

export type TeacherStatus = string;

// Default statuses for reference
export const DEFAULT_STATUSES = {
  NEW_LEAD: 'New Lead',
  RESPONDED: 'Responded',
  VERIFIED: 'Verified',
  REGISTERED: 'Registered',
  UPLOADED_CLASS: 'Uploaded Class',
  FIRST_SALE: 'First Sale',
  ACTIVE_TEACHER: 'Active Teacher',
  INACTIVE: 'Inactive'
};

export enum ContactSource {
  FACEBOOK_ADS = 'Facebook Ads',
  WEBSITE_CHAT = 'Website Chat',
  WHATSAPP = 'WhatsApp',
  MANUAL = 'Manual',
}

export interface Message {
  id: string;
  senderId: string; // 'system' | 'agent' | teacherId
  text: string;
  timestamp: string;
  isIncoming: boolean;
  status: 'sent' | 'delivered' | 'read' | 'received' | 'pending';

  type: string;
  hasMedia?: boolean;
  mediaType?: string;
  quotedMessage?: {
    id: string;
    body: string;
    senderId: string;
  };
}

export interface Activity {
  id: string;
  type: 'message' | 'note' | 'status_change' | 'call' | 'file' | 'email';
  title: string;
  description?: string;
  timestamp: string;
  user: string; // 'System', 'Agent Name', or Teacher Name
  icon?: React.ReactNode;
}

export interface Teacher {
  id: string;
  name: string;
  phone: string;
  location: string;
  source: ContactSource;
  status: TeacherStatus;
  tags: string[];
  email?: string;
  avatarUrl: string;
  lastActive: string;
  assignedAgentId?: string;
  notes: string;
  unreadCount: number;
  lastMessage?: {
    body: string;
    type: string;
    fromMe: boolean;
    status: number; // ack
  };
}

export interface Workflow {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  active: boolean;
  stats: {
    triggered: number;
    completed: number;
  };
}

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
}

export interface WhatsAppSettings {
  connectionType: 'official' | 'qr';
  // Official API
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  webhookUrl?: string;
  verifyToken?: string;
  appId?: string;
  appSecret?: string;
  // QR / Web Session
  isLinked?: boolean;
  linkedNumber?: string;
  sessionName?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  response: string;
  active: boolean;
  matchType: 'exact' | 'contains';
  hitCount: number;
  steps?: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  content: string;
  options?: {
    keyword: string;
    nextStepId: string;
  }[];
}

export interface Template {
  id: string;
  name: string;
  content: string;
}