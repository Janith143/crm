export const MOCK_AUTOMATION_RULES = [
    { id: '1', name: 'Welcome', trigger_text: 'hello', response_text: 'Hi there! How can I help you today?', active: 1, match_type: 'contains', hit_count: 0 },
    { id: '2', name: 'Pricing', trigger_text: 'price', response_text: 'Our pricing starts at $10/month.', active: 1, match_type: 'contains', hit_count: 0 }
];

export const MOCK_TEACHER_METADATA = [
    {
        id: '94771234567@c.us',
        name: 'Mr. Perera',
        source: 'Facebook Ads',
        status: 'New Lead',
        tags: JSON.stringify(['math', 'grade-10']),
        notes: 'Interested in revision classes',
        location: 'Colombo',
        email: 'perera@example.com'
    }
];

export const MOCK_PIPELINE_STAGES = [
    { id: 'New Lead', name: 'New Lead', position: 1, color: 'bg-blue-500' },
    { id: 'Responded', name: 'Responded', position: 2, color: 'bg-slate-400' },
    { id: 'Verified', name: 'Verified', position: 3, color: 'bg-slate-400' },
    { id: 'Registered', name: 'Registered', position: 4, color: 'bg-slate-400' },
    { id: 'Uploaded Class', name: 'Uploaded Class', position: 5, color: 'bg-orange-400' },
    { id: 'First Sale', name: 'First Sale', position: 6, color: 'bg-purple-500' },
    { id: 'Active Teacher', name: 'Active Teacher', position: 7, color: 'bg-green-600' }
];
