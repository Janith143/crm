import { DEFAULT_STATUSES, ContactSource } from './types';
import type { Teacher, Workflow, Message, Activity, Template } from './types';

export const MOCK_TEMPLATES: Template[] = [
  { id: 'tpl1', name: 'Welcome Message', content: 'Hi there! Welcome to Clazz.lk. How can I help you today?' },
  { id: 'tpl2', name: 'Onboarding Guide', content: 'Here is the link to our onboarding guide: https://clazz.lk/guide. Let me know if you have any questions!' },
  { id: 'tpl3', name: 'Meeting Request', content: 'Would you be available for a quick 15-minute call to discuss this further?' },
];

export const MOCK_TEACHERS: Teacher[] = [
  {
    id: 't1',
    name: 'Nimal Perera',
    phone: '+94 77 123 4567',
    location: 'Colombo, LK',
    source: ContactSource.FACEBOOK_ADS,
    status: DEFAULT_STATUSES.NEW_LEAD,
    tags: ['Teacher - Pending Signup', 'Physics'],
    avatarUrl: 'https://picsum.photos/200/200?random=1',
    lastActive: '10 mins ago',
    notes: 'Interested in A/L Physics. Needs follow up on registration docs.',
    unreadCount: 2,
  },
  {
    id: 't2',
    name: 'Sarah Silva',
    phone: '+94 71 987 6543',
    location: 'Kandy, LK',
    source: ContactSource.WEBSITE_CHAT,
    status: DEFAULT_STATUSES.VERIFIED,
    tags: ['Teacher - Needs Onboarding', 'English'],
    avatarUrl: 'https://picsum.photos/200/200?random=2',
    lastActive: '2 hours ago',
    assignedAgentId: 'agent1',
    notes: 'Verified documents. Scheduled for LMS training next Tuesday.',
    unreadCount: 0,
  },
  {
    id: 't3',
    name: 'Kamal Dias',
    phone: '+94 76 555 1111',
    location: 'Galle, LK',
    source: ContactSource.WHATSAPP,
    status: DEFAULT_STATUSES.ACTIVE_TEACHER,
    tags: ['Teacher - Active', 'Teacher - Premium', 'Maths', 'Selling Recordings'],
    avatarUrl: 'https://picsum.photos/200/200?random=3',
    lastActive: '1 day ago',
    notes: 'Top performing maths teacher. selling recordings well.',
    unreadCount: 0,
  },
  {
    id: 't4',
    name: 'Rani Kumari',
    phone: '+94 70 222 3333',
    location: 'Negombo, LK',
    source: ContactSource.FACEBOOK_ADS,
    status: DEFAULT_STATUSES.RESPONDED,
    tags: ['Biology', 'Attended Onboarding'],
    avatarUrl: 'https://picsum.photos/200/200?random=4',
    lastActive: '5 mins ago',
    notes: 'Attended onboarding but has not uploaded class yet.',
    unreadCount: 1,
  },
  {
    id: 't5',
    name: 'David Gunawardena',
    phone: '+94 75 444 8888',
    location: 'Kurunegala, LK',
    source: ContactSource.MANUAL,
    status: DEFAULT_STATUSES.UPLOADED_CLASS,
    tags: ['Chemistry', 'Review Pending', 'Unpublished'],
    avatarUrl: 'https://picsum.photos/200/200?random=5',
    lastActive: '3 days ago',
    notes: 'Uploaded Chemistry 101. Needs approval.',
    unreadCount: 0,
  },
  {
    id: 't6',
    name: 'Saman Ekanayake',
    phone: '+94 77 999 0000',
    location: 'Matara, LK',
    source: ContactSource.WHATSAPP,
    status: DEFAULT_STATUSES.INACTIVE,
    tags: ['History', 'Inactive'],
    avatarUrl: 'https://picsum.photos/200/200?random=6',
    lastActive: '30 days ago',
    notes: 'Stopped responding after initial signup.',
    unreadCount: 0,
  },
  {
    id: 't7',
    name: 'Kasun Bandara',
    phone: '+94 72 111 2222',
    location: 'Jaffna, LK',
    source: ContactSource.WEBSITE_CHAT,
    status: DEFAULT_STATUSES.FIRST_SALE,
    tags: ['ICT', 'First Sale Made'],
    avatarUrl: 'https://picsum.photos/200/200?random=7',
    lastActive: '1 hour ago',
    notes: 'Made first sale on Python course. Needs congrats message.',
    unreadCount: 0,
  }
];

export const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: 'wf1',
    name: 'New Teacher Onboarding Flow',
    trigger: 'New Lead Created via Facebook Ads',
    steps: [
      'Auto Greeting: "Welcome to Clazz.lk!"',
      'Ask: "What subject do you teach?"',
      'Action: Add Subject Tag based on reply',
      'Send: LMS Onboarding Guide PDF'
    ],
    active: true,
    stats: { triggered: 154, completed: 120 },
  },
  {
    id: 'wf2',
    name: 'No Response Follow-up',
    trigger: 'No reply for 24 hours',
    steps: [
      'Send Follow-up: "Did you get a chance to see our guide?"',
      'Notify Agent if no reply in 48h'
    ],
    active: true,
    stats: { triggered: 45, completed: 42 },
  },
];

export const INITIAL_MESSAGES: Record<string, Message[]> = {
  't1': [
    { id: 'm1', senderId: 'system', text: 'Welcome to Clazz.lk! How can we help you start teaching?', timestamp: '10:00 AM', isIncoming: false, status: 'read', type: 'text' },
    { id: 'm2', senderId: 't1', text: 'Hi, I want to teach Physics.', timestamp: '10:05 AM', isIncoming: true, status: 'read', type: 'text' },
    { id: 'm3', senderId: 't1', text: 'What are the fees?', timestamp: '10:06 AM', isIncoming: true, status: 'read', type: 'text' },
  ],
  't4': [
    { id: 'm4', senderId: 't4', text: 'Do you support Zoom integration?', timestamp: '09:30 AM', isIncoming: true, status: 'read', type: 'text' },
  ]
};

export const MOCK_ACTIVITIES: Record<string, Activity[]> = {
  't1': [
    { id: 'a1', type: 'message', title: 'Incoming Message', description: 'What are the fees?', timestamp: '10:06 AM', user: 'Nimal Perera' },
    { id: 'a2', type: 'message', title: 'Incoming Message', description: 'Hi, I want to teach Physics.', timestamp: '10:05 AM', user: 'Nimal Perera' },
    { id: 'a3', type: 'status_change', title: 'Status Changed', description: 'Changed from New Lead to Responded', timestamp: '10:04 AM', user: 'System Automation' },
    { id: 'a4', type: 'message', title: 'Outgoing Message', description: 'Welcome to Clazz.lk! How can we help you start teaching?', timestamp: '10:00 AM', user: 'System' },
    { id: 'a5', type: 'status_change', title: 'New Lead Created', description: 'Imported from Facebook Lead Ads', timestamp: '09:59 AM', user: 'Facebook Integration' },
  ],
  't2': [
    { id: 'a6', type: 'note', title: 'Agent Note', description: 'Verified ID card and Address proof. Ready for training.', timestamp: 'Yesterday', user: 'Support Agent' },
    { id: 'a7', type: 'file', title: 'File Received', description: 'id_copy.pdf', timestamp: 'Yesterday', user: 'Sarah Silva' },
    { id: 'a8', type: 'status_change', title: 'Status Update', description: 'Marked as Verified', timestamp: 'Yesterday', user: 'Support Agent' },
    { id: 'a9', type: 'call', title: 'Outgoing Call', description: 'Onboarding call - 15 mins', timestamp: 'Yesterday', user: 'Support Agent' },
  ],
  't3': [
    { id: 'a10', type: 'status_change', title: 'Status Update', description: 'Promoted to Teacher - Premium', timestamp: '2 days ago', user: 'System' },
    { id: 'a11', type: 'file', title: 'File Sent', description: 'Contract_Agreement.pdf', timestamp: '1 week ago', user: 'Support Agent' }
  ]
};

export const MOCK_PIPELINE_STAGES = [
  { id: DEFAULT_STATUSES.NEW_LEAD, name: 'New Lead', position: 1, color: 'bg-blue-400' },
  { id: DEFAULT_STATUSES.RESPONDED, name: 'Responded', position: 2, color: 'bg-indigo-400' },
  { id: DEFAULT_STATUSES.VERIFIED, name: 'Verified', position: 3, color: 'bg-purple-400' },
  { id: DEFAULT_STATUSES.REGISTERED, name: 'Registered', position: 4, color: 'bg-pink-400' },
  { id: DEFAULT_STATUSES.UPLOADED_CLASS, name: 'Uploaded Class', position: 5, color: 'bg-orange-400' },
  { id: DEFAULT_STATUSES.FIRST_SALE, name: 'First Sale', position: 6, color: 'bg-yellow-400' },
  { id: DEFAULT_STATUSES.ACTIVE_TEACHER, name: 'Active Teacher', position: 7, color: 'bg-green-400' },
  { id: DEFAULT_STATUSES.INACTIVE, name: 'Inactive', position: 8, color: 'bg-slate-400' }
];