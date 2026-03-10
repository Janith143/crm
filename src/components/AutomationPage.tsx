import React, { useState, useEffect } from 'react';
import type { Workflow as WorkflowType, AutomationRule, WorkflowStep } from '../types';
import { Workflow, Plus, Play, Pause, Zap, Clock, ArrowRight, X, Trash2, GitBranch, CornerDownRight } from 'lucide-react';
import { fetchAutomations, createAutomation, updateAutomation, deleteAutomation } from '../services/api';

const AutomationPage = () => {
  const [workflows, setWorkflows] = useState<WorkflowType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowType | null>(null);

  const loadWorkflows = async () => {
    try {
      const rules = await fetchAutomations();
      const mappedWorkflows: WorkflowType[] = rules.map((r: AutomationRule) => ({
        id: r.id,
        name: r.name,
        trigger: r.trigger,
        steps: r.steps && typeof r.steps[0] === 'object' ? r.steps as unknown as WorkflowStep[] : (r.steps as unknown as string[] || [r.response]).map((s, i) => ({ id: i.toString(), content: s, options: [] })),
        active: r.active,
        stats: { triggered: r.hitCount, completed: r.hitCount }
      }));
      setWorkflows(mappedWorkflows);
    } catch (error) {
      console.error("Failed to load automations", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  // Form State
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([{ id: '0', content: '', options: [] }]);

  const openCreateModal = () => {
    setEditingWorkflow(null);
    setName('');
    setTrigger('');
    setSteps([{ id: '0', content: '', options: [] }]);
    setIsModalOpen(true);
  };

  const openEditModal = (wf: WorkflowType) => {
    setEditingWorkflow(wf);
    setName(wf.name);
    setTrigger(wf.trigger);
    // Ensure steps are in the new format
    if (wf.steps && typeof wf.steps[0] === 'string') {
      setSteps((wf.steps as unknown as string[]).map((s, i) => ({ id: i.toString(), content: s, options: [] })));
    } else {
      setSteps(wf.steps as unknown as WorkflowStep[]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name || !trigger || steps.some(s => !s.content.trim())) return;

    const ruleData = {
      name,
      trigger,
      response: steps[0].content, // Backward compatibility
      steps,
      matchType: 'contains'
    };

    try {
      if (editingWorkflow) {
        await updateAutomation(editingWorkflow.id, ruleData);
      } else {
        await createAutomation(ruleData);
      }
      await loadWorkflows();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save automation", error);
    }
  };

  const toggleWorkflow = async (id: string) => {
    const wf = workflows.find(w => w.id === id);
    if (!wf) return;
    try {
      await updateAutomation(id, { active: !wf.active });
      loadWorkflows();
    } catch (error) {
      console.error("Failed to toggle automation", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await deleteAutomation(id);
      loadWorkflows();
    } catch (error) {
      console.error("Failed to delete automation", error);
    }
  };

  const handleStepChange = (index: number, content: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], content };
    setSteps(newSteps);
  };

  const addOption = (stepIndex: number) => {
    const newSteps = [...steps];
    if (!newSteps[stepIndex].options) newSteps[stepIndex].options = [];
    newSteps[stepIndex].options!.push({ keyword: '', nextStepId: '' });
    setSteps(newSteps);
  };

  const updateOption = (stepIndex: number, optionIndex: number, field: 'keyword' | 'nextStepId', value: string) => {
    const newSteps = [...steps];
    if (newSteps[stepIndex].options) {
      newSteps[stepIndex].options![optionIndex] = { ...newSteps[stepIndex].options![optionIndex], [field]: value };
      setSteps(newSteps);
    }
  };

  const removeOption = (stepIndex: number, optionIndex: number) => {
    const newSteps = [...steps];
    if (newSteps[stepIndex].options) {
      newSteps[stepIndex].options = newSteps[stepIndex].options!.filter((_, i) => i !== optionIndex);
      setSteps(newSteps);
    }
  };

  const addStep = () => {
    const newId = steps.length.toString();
    setSteps([...steps, { id: newId, content: '', options: [] }]);
  };
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index));

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading workflows...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar pr-2">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Automation Workflows</h1>
          <p className="text-slate-500">Manage auto-replies, onboarding sequences, and lead nurturing.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors"
        >
          <Plus size={18} />
          Create Workflow
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-sm">
          <div className="flex items-center gap-2 mb-2 opacity-90">
            <Zap size={20} />
            <span className="font-medium">Total Triggers</span>
          </div>
          <div className="text-3xl font-bold mb-4">2,450</div>
          <div className="text-sm opacity-80 bg-white/10 p-2 rounded inline-block">
            +15% this month
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-sm">
          <div className="flex items-center gap-2 mb-2 opacity-90">
            <Clock size={20} />
            <span className="font-medium">Time Saved</span>
          </div>
          <div className="text-3xl font-bold mb-4">45 hrs</div>
          <div className="text-sm opacity-80 bg-white/10 p-2 rounded inline-block">
            Automated tasks
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 text-slate-800 shadow-sm border border-slate-200">
          <h3 className="font-semibold mb-4">Most Active Workflow</h3>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-sm font-medium">New Teacher Onboarding</div>
            <div className="text-xs text-slate-500 mt-1">Triggered 154 times</div>
          </div>
        </div>
      </div>

      <h3 className="font-semibold text-slate-800 mt-8 mb-4">Active Workflows</h3>
      <div className="space-y-4">
        {workflows.map(wf => (
          <div key={wf.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${wf.active ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                  <Workflow size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-lg">{wf.name}</h4>
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="font-medium text-slate-700">Trigger:</span> {wf.trigger}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${wf.active ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  {wf.active ? 'Running' : 'Paused'}
                </span>
                <button onClick={() => handleDelete(wf.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={20} /></button>
              </div>
            </div>

            {/* Visual Steps */}
            <div className="relative flex items-center gap-2 overflow-x-auto pb-4 pt-2">
              {wf.steps.map((step, index) => {
                const stepObj = (typeof step === 'string' ? { id: index.toString(), content: step, options: [] } : step) as WorkflowStep;
                return (
                  <React.Fragment key={index}>
                    <div className="shrink-0 w-48 bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 relative group hover:border-blue-300 hover:shadow-sm transition-all cursor-default">
                      <span className="absolute -top-2.5 left-3 bg-white text-[10px] font-bold text-slate-400 px-1 border border-slate-200 rounded">Step {index + 1}</span>
                      {stepObj.content}
                      {/* Show options indicator if any */}
                      {stepObj.options && stepObj.options.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-1">
                          {stepObj.options.map((opt, i) => (
                            <span key={i} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{opt.keyword}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {index < wf.steps.length - 1 && (
                      <ArrowRight size={16} className="text-slate-300 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
              <div className="flex gap-8">
                <div>
                  <div className="text-lg font-bold text-slate-800">{wf.stats.triggered}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Total Runs</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-800">{Math.round((wf.stats.completed / wf.stats.triggered) * 100)}%</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Completion Rate</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(wf)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200"
                >
                  Edit Flow
                </button>
                <button
                  onClick={() => toggleWorkflow(wf.id)}
                  className={`p-2 rounded-lg border ${wf.active ? 'text-orange-500 border-orange-200 hover:bg-orange-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}
                >
                  {wf.active ? <Pause size={18} /> : <Play size={18} />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl text-slate-800">
                {editingWorkflow ? 'Edit Workflow' : 'Create New Workflow'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Workflow Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., New Lead Follow-up"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Trigger Condition</label>
                <input
                  type="text"
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  placeholder="e.g., New Message contains 'Price'"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Workflow Steps</label>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={index} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Step {index + 1} (ID: {step.id})</span>
                        {steps.length > 1 && (
                          <button onClick={() => removeStep(index)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                        )}
                      </div>

                      <textarea
                        value={step.content}
                        onChange={e => handleStepChange(index, e.target.value)}
                        placeholder={`Message for Step ${index + 1}...`}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm mb-3"
                        rows={2}
                      />

                      {/* Options */}
                      <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                        {step.options?.map((opt, optIndex) => (
                          <div key={optIndex} className="flex gap-2 items-center">
                            <GitBranch size={14} className="text-slate-400" />
                            <input
                              type="text"
                              placeholder="If user replies..."
                              value={opt.keyword}
                              onChange={(e) => updateOption(index, optIndex, 'keyword', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                            />
                            <ArrowRight size={14} className="text-slate-400" />
                            <select
                              value={opt.nextStepId}
                              onChange={(e) => updateOption(index, optIndex, 'nextStepId', e.target.value)}
                              className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                            >
                              <option value="">Go to...</option>
                              {steps.map((s, i) => (
                                <option key={i} value={s.id}>Step {i + 1}</option>
                              ))}
                            </select>
                            <button onClick={() => removeOption(index, optIndex)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                          </div>
                        ))}
                        <button onClick={() => addOption(index)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-2">
                          <Plus size={12} /> Add Branch Option
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addStep}
                  className="mt-3 text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                  <Plus size={16} /> Add Next Step
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm"
              >
                {editingWorkflow ? 'Save Changes' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationPage;