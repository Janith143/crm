import React, { useState } from 'react';
import { type Teacher, type TeacherStatus, DEFAULT_STATUSES } from '../types';
import { Users, Send, AlertCircle, Sparkles, CheckCircle, Folder, PlayCircle, UserCheck, UserX, BookX, Image as ImageIcon, X } from 'lucide-react';
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
  const [messageTemplates, setMessageTemplates] = useState<string[]>(['']);
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
  const [aiTopic, setAiTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: number, failed: number } | null>(null);

  // Rate Limiting States
  const [batchSize, setBatchSize] = useState<number>(10);
  const [delayMinutes, setDelayMinutes] = useState<number>(10);
  const [delaySeconds, setDelaySeconds] = useState<number>(0);
  const [messageDelaySeconds, setMessageDelaySeconds] = useState<number>(2);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number; status: string; nextBatchTime: Date | null } | null>(null);

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
    const newTemplates = [...messageTemplates];
    newTemplates[activeTemplateIndex] = template;
    setMessageTemplates(newTemplates);
    setIsGenerating(false);
  };

  const handleSendBroadcast = async () => {
    const validTemplates = messageTemplates.filter(t => t.trim() !== '');
    if (validTemplates.length === 0) return;

    setIsSending(true);
    setProgress({ sent: 0, total: audience.length, status: 'Initializing...', nextBatchTime: null });

    // Extract phone numbers
    const recipients = audience.map(t => t.phone);

    // Send via service (handles real API if configured, otherwise simulates)
    const result = await sendBroadcastMessage(
      recipients,
      validTemplates,
      batchSize,
      delayMinutes,
      delaySeconds,
      messageDelaySeconds,
      attachment,
      (sent: number, total: number, status: string, nextBatchTime: Date | null) => {
        setProgress({ sent, total, status, nextBatchTime });
      }
    );

    setIsSending(false);
    setProgress(null);
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
          onClick={() => { setSendResult(null); setStep(1); setMessageTemplates(['']); setActiveTemplateIndex(0); setProgress(null); setAttachment(null); }}
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
                  <div className="flex justify-between items-end mb-2">
                    <label className="block text-sm font-medium text-slate-700">Message Variations</label>
                    <button
                      onClick={() => {
                        setMessageTemplates([...messageTemplates, '']);
                        setActiveTemplateIndex(messageTemplates.length);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      + Add Variation
                    </button>
                  </div>

                  {messageTemplates.length > 1 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                      {messageTemplates.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveTemplateIndex(idx)}
                          className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap ${activeTemplateIndex === idx
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                          Variation {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={messageTemplates[activeTemplateIndex]}
                    onChange={(e) => {
                      const newTemplates = [...messageTemplates];
                      newTemplates[activeTemplateIndex] = e.target.value;
                      setMessageTemplates(newTemplates);
                    }}
                    className="w-full h-48 p-4 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 resize-none font-sans"
                    placeholder="Hi {{name}}, check out our new LMS features..."
                  />
                  {messageTemplates.length > 1 && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => {
                          const newTemplates = messageTemplates.filter((_, i) => i !== activeTemplateIndex);
                          setMessageTemplates(newTemplates);
                          setActiveTemplateIndex(Math.max(0, activeTemplateIndex - 1));
                        }}
                        className="text-xs text-red-500 hover:text-red-600 font-medium"
                      >
                        Remove Variation
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-500 mb-6">
                  Supported variables: <code className="bg-slate-100 px-1 rounded">{`{{name}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{phone}}`}</code><br />
                  <span className="text-amber-600">If multiple variations are added, contacts will receive them in a rotating cycle to prevent bans.</span>
                </div>

                {/* Photo Attachment */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Photo Attachment (Optional)</label>
                  {!attachment ? (
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        id="broadcast-image-upload"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setAttachment(e.target.files[0]);
                          }
                        }}
                        disabled={isSending}
                      />
                      <label htmlFor="broadcast-image-upload" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                        <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                          <ImageIcon size={20} />
                        </div>
                        <span className="text-sm font-medium text-slate-600">Click to upload an image</span>
                        <span className="text-xs text-slate-400">JPG, PNG, GIF up to 5MB</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="w-12 h-12 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                        <img src={URL.createObjectURL(attachment)} alt="Attachment preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{attachment.name}</p>
                        <p className="text-xs text-slate-500">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button
                        onClick={() => setAttachment(null)}
                        disabled={isSending}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        title="Remove attachment"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-slate-100 rounded-xl p-6 flex flex-col items-center justify-center">
                <div className="w-[280px] bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
                  <div className="bg-[#008069] h-14 flex items-center px-4">
                    <div className="w-8 h-8 rounded-full bg-white/20 mr-3"></div>
                    <div className="h-3 w-24 bg-white/20 rounded"></div>
                  </div>
                  <div className="bg-[#efeae2] h-[350px] p-4 relative overflow-y-auto custom-scrollbar">
                    <div className="bg-white p-2 text-slate-800 rounded-lg rounded-tl-none shadow-sm text-sm mb-2 whitespace-pre-wrap">
                      {attachment && (
                        <div className="w-full h-32 bg-slate-100 rounded mb-2 overflow-hidden border border-slate-200">
                          <img src={URL.createObjectURL(attachment)} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {messageTemplates[activeTemplateIndex] ? messageTemplates[activeTemplateIndex].replace(/{{name}}/g, 'Nimal').replace(/{{phone}}/g, '0712345678') : <span className="text-slate-400 italic">Preview message here...</span>}
                      <div className="text-[10px] text-slate-400 text-right mt-1">10:30 AM</div>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-500">Preview on mobile device</p>
              </div>
            </div>

            {/* Rate Limiting Options */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                Anti-Ban Rate Limiting
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Contacts per batch</label>
                  <input
                    type="number"
                    min="1"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
                    disabled={isSending}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Messages to send at once.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Delay between batches</label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={delayMinutes}
                          onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 0)}
                          disabled={isSending}
                          className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        <div className="absolute right-3 top-2 text-xs text-slate-400">min</div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={delaySeconds}
                          onChange={(e) => setDelaySeconds(parseInt(e.target.value) || 0)}
                          disabled={isSending}
                          className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        <div className="absolute right-2 top-2 text-xs text-slate-400">sec</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Wait time before next batch.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Message gap (seconds)</label>
                  <input
                    type="number"
                    min="1"
                    value={messageDelaySeconds}
                    onChange={(e) => setMessageDelaySeconds(parseInt(e.target.value) || 1)}
                    disabled={isSending}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Delay between individual messages.</p>
                </div>
              </div>
            </div>

            {/* Progress Display */}
            {isSending && progress && (
              <div className="mt-6 p-4 border border-blue-200 bg-blue-50 rounded-lg animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-blue-800">Sending Broadcast...</span>
                  <span className="text-sm font-bold text-blue-800">
                    {progress.sent} / {progress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(2, (progress.sent / progress.total) * 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-start text-xs text-blue-600">
                  <div className="animate-pulse flex-1 pr-4">{progress.status}</div>
                  {progress.nextBatchTime && (
                    <div className="font-medium text-right shrink-0">
                      Next batch at:<br />
                      {progress.nextBatchTime.toLocaleTimeString()}
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200/50 text-xs font-semibold text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={14} className="animate-pulse" />
                  DO NOT close this browser tab until the broadcast is completely finished!
                </div>
              </div>
            )}

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
                  disabled={!messageTemplates.some(t => t.trim() !== '') || isSending}
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