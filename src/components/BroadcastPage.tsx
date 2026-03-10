import React, { useState } from 'react';
import { type Teacher, type TeacherStatus, DEFAULT_STATUSES } from '../types';
import { Users, Send, AlertCircle, Sparkles, CheckCircle, Folder, PlayCircle, UserCheck, UserX, BookX } from 'lucide-react';
import { generateBroadcastTemplate } from '../services/geminiService';
import { sendBroadcastMessage } from '../services/whatsappService';
import { usePipeline } from '../context/PipelineContext';

interface BroadcastPageProps {
  teachers: Teacher[];
}

const BroadcastPage: React.FC<BroadcastPageProps> = ({ teachers }) => {
  const { stages } = usePipeline();
  const [step, setStep] = useState(1);
  const [selectedSegment, setSelectedSegment] = useState<string>('All');
  const [messageText, setMessageText] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: number, failed: number } | null>(null);

  // Determine audience based on selected segment (pipeline stage or tag)
  const getAudience = (segment: string) => {
    if (segment === 'All') return teachers;
    // Check for pipeline stage
    const stage = stages.find(s => s.name === segment);
    if (stage) {
      return teachers.filter(t => t.status === stage.name);
    }
    // Tag based fallback
    if (segment === 'Attended Onboarding') return teachers.filter(t => t.tags.includes('Attended Onboarding'));
    if (segment === 'Selling Recordings') return teachers.filter(t => t.tags.includes('Selling Recordings'));
    return [];
  };

  const audience = getAudience(selectedSegment);

  // Build segments list dynamically from pipeline stages
  const segments = [
    { name: 'All', icon: <Folder size={18} className="text-slate-400" /> },
    // Pipeline stages
    ...stages.map(stage => ({
      name: stage.name,
      icon: <Folder size={18} className="text-blue-500" />
    })),
    // Tag based segments
    { name: 'Attended Onboarding', icon: <PlayCircle size={18} className="text-purple-500" /> },
    { name: 'Selling Recordings', icon: <PlayCircle size={18} className="text-orange-500" /> },
  ];

  const handleGenerateTemplate = async () => {
    if (!aiTopic) return;
    setIsGenerating(true);
    const template = await generateBroadcastTemplate(aiTopic, selectedSegment);
    setMessageText(template);
    setIsGenerating(false);
  };

  const handleSendBroadcast = async () => {
    setIsSending(true);

    // Extract phone numbers
    const recipients = audience.map(t => t.phone);

    // Send via service (handles real API if configured, otherwise simulates)
    const result = await sendBroadcastMessage(recipients, messageText);

    setIsSending(false);
    setSendResult({
      success: result.successful.length,
      failed: result.failed.length
    });
  };

  if (sendResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600">
          <CheckCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Broadcast Completed!</h2>
        <p className="text-slate-500 mb-6 max-w-md">
          Processed {audience.length} contacts.<br />
          <span className="text-green-600 font-bold">{sendResult.success} sent</span> • <span className="text-red-500 font-bold">{sendResult.failed} failed</span>
        </p>
        <button
          onClick={() => { setSendResult(null); setStep(1); setMessageText(''); }}
          className="bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Send Another Campaign
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">New Broadcast Campaign</h1>

      {/* Steps Indicator */}
      <div className="flex items-center mb-8">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-green-600' : 'text-slate-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 1 ? 'bg-green-100' : 'bg-slate-100'}`}>1</div>
          <span className="font-medium">Select Audience</span>
        </div>
        <div className="w-12 h-0.5 bg-slate-200 mx-4"></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-green-600' : 'text-slate-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= 2 ? 'bg-green-100' : 'bg-slate-100'}`}>2</div>
          <span className="font-medium">Compose Message</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {step === 1 && (
          <div className="p-8">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Who do you want to message?</h3>
            <p className="text-slate-500 text-sm mb-6">Select a folder or segment to target specific teachers.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {segments.map((seg) => {
                const count = getAudience(seg.name).length;
                return (
                  <button
                    key={seg.name}
                    onClick={() => setSelectedSegment(seg.name)}
                    className={`p-4 rounded-lg border text-left transition-all flex items-start gap-3 ${selectedSegment === seg.name ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="mt-1">{seg.icon}</div>
                    <div>
                      <div className="font-semibold text-slate-800">{seg.name}</div>
                      <div className="text-sm text-slate-500">{count} contacts</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="bg-blue-50 text-blue-700 p-4 rounded-lg flex items-start gap-3 text-sm">
              <Users size={18} className="mt-0.5" />
              <div>
                You are targeting <strong>{audience.length}</strong> teachers in the <strong>{selectedSegment}</strong> folder.
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={audience.length === 0}
                className="bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Next: Compose
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-8">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Draft your message</h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">AI Template Generator</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g., Monthly Webinar Invitation"
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={handleGenerateTemplate}
                      disabled={isGenerating || !aiTopic}
                      className="bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors flex items-center gap-2"
                    >
                      <Sparkles size={16} />
                      {isGenerating ? 'Thinking...' : 'Generate'}
                    </button>
                  </div>
                </div>

                <div className="mb-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Message Content</label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="w-full h-64 p-4 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 resize-none font-sans"
                    placeholder="Hi {{name}}, check out our new LMS features..."
                  />
                </div>
                <div className="text-xs text-slate-500">
                  Supported variables: <code className="bg-slate-100 px-1 rounded">{`{{name}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{phone}}`}</code>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-slate-100 rounded-xl p-6 flex flex-col items-center justify-center">
                <div className="w-[280px] bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
                  <div className="bg-[#008069] h-14 flex items-center px-4">
                    <div className="w-8 h-8 rounded-full bg-white/20 mr-3"></div>
                    <div className="h-3 w-24 bg-white/20 rounded"></div>
                  </div>
                  <div className="bg-[#efeae2] h-[350px] p-4 relative">
                    <div className="bg-white p-2 rounded-lg rounded-tl-none shadow-sm text-sm mb-2 whitespace-pre-wrap">
                      {messageText ? messageText.replace('{{name}}', 'Nimal') : <span className="text-slate-400 italic">Preview message here...</span>}
                      <div className="text-[10px] text-slate-400 text-right mt-1">10:30 AM</div>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-500">Preview on mobile device</p>
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center">
              <button
                onClick={() => setStep(1)}
                className="text-slate-500 hover:text-slate-800 font-medium px-4 py-2"
              >
                Back
              </button>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded text-xs border border-amber-100">
                  <AlertCircle size={14} />
                  <span>Meta needs to approve new templates</span>
                </div>
                <button
                  onClick={handleSendBroadcast}
                  disabled={!messageText.trim() || isSending}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? <Sparkles className="animate-spin" size={18} /> : <Send size={18} />}
                  {isSending ? 'Sending...' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BroadcastPage;