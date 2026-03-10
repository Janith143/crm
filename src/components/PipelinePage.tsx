import React, { type DragEvent, useState, useEffect } from 'react';
import { type Teacher, type TeacherStatus, DEFAULT_STATUSES } from '../types';
import { MoreHorizontal, Phone, MessageSquare, ArrowRight, Plus, X, Trash2, RotateCcw } from 'lucide-react';
import { fetchPipelineStages, createPipelineStage, deletePipelineStage, reorderPipelineStages } from '../services/api';
import { usePipeline } from '../context/PipelineContext';

interface PipelinePageProps {
  teachers: Teacher[];
  updateStatus: (id: string, status: TeacherStatus) => void;
}

interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string;
}

const PipelinePage: React.FC<PipelinePageProps> = ({ teachers, updateStatus }) => {
  const { refreshStages } = usePipeline();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');

  const loadStages = async () => {
    try {
      const fetchedStages = await fetchPipelineStages();
      setStages(fetchedStages);
      // Also refresh the context so other components get updated
      await refreshStages();
    } catch (error) {
      console.error("Failed to load pipeline stages", error);
    }
  };

  useEffect(() => {
    loadStages();
  }, []);

  const handleAddStage = async () => {
    if (!newStageName.trim()) return;
    try {
      await createPipelineStage({ name: newStageName, color: 'bg-slate-400' });
      setNewStageName('');
      setIsAddingStage(false);
      loadStages();
    } catch (error) {
      console.error("Failed to create stage", error);
    }
  };

  const handleDeleteStage = async (id: string) => {
    if (!confirm(`Are you sure you want to delete stage "${id}"? Teachers in this stage will remain but be hidden from this view.`)) return;
    try {
      await deletePipelineStage(id);
      loadStages();
    } catch (error) {
      console.error("Failed to delete stage", error);
    }
  };

  const handleResetStage = async (stageId: string) => {
    const teachersInStage = teachers.filter(t => t.status === stageId);
    if (teachersInStage.length === 0) return;

    if (!confirm(`Are you sure you want to move ${teachersInStage.length} teachers from "${stageId}" back to "${DEFAULT_STATUSES.NEW_LEAD}"?`)) return;

    try {
      // Update all teachers in parallel
      await Promise.all(teachersInStage.map(t => updateStatus(t.id, DEFAULT_STATUSES.NEW_LEAD)));
    } catch (error) {
      console.error("Failed to reset stage", error);
    }
  };

  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const onTeacherDragStart = (e: DragEvent<HTMLDivElement>, teacherId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("type", "TEACHER");
    e.dataTransfer.setData("teacherId", teacherId);
    e.dataTransfer.effectAllowed = "move";
    console.log("Drag Start: TEACHER", teacherId);
  };

  const onColumnDragStart = (e: DragEvent<HTMLDivElement>, stageId: string) => {
    e.dataTransfer.setData("type", "COLUMN");
    e.dataTransfer.setData("stageId", stageId);
    e.dataTransfer.effectAllowed = "move";
    console.log("Drag Start: COLUMN", stageId);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const onDragLeave = () => {
    setDragOverStageId(null);
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>, targetStageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStageId(null);
    const type = e.dataTransfer.getData("type");
    console.log("Drop: Type", type, "Target", targetStageId);

    if (type === "TEACHER") {
      const teacherId = e.dataTransfer.getData("teacherId");
      if (teacherId) {
        updateStatus(teacherId, targetStageId);
      }
    } else if (type === "COLUMN") {
      const draggedStageId = e.dataTransfer.getData("stageId");
      console.log("Drop Column:", draggedStageId, "->", targetStageId);
      if (draggedStageId && draggedStageId !== targetStageId) {
        const newStages = [...stages];
        const draggedIndex = newStages.findIndex(s => s.id === draggedStageId);
        const targetIndex = newStages.findIndex(s => s.id === targetStageId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          const [removed] = newStages.splice(draggedIndex, 1);
          newStages.splice(targetIndex, 0, removed);

          const updatedStages = newStages.map((s, index) => ({ ...s, position: index + 1 }));
          setStages(updatedStages);

          try {
            await reorderPipelineStages(updatedStages.map(s => s.id));
          } catch (error) {
            console.error("Failed to reorder stages", error);
            loadStages(); // Revert on error
          }
        }
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Teacher Sales Pipeline</h1>
          <p className="text-slate-500 text-sm">Visual conversion tracking from Lead to Active Teacher.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAddingStage ? (
            <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm animate-in fade-in slide-in-from-right-4">
              <input
                autoFocus
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Stage Name"
                className="px-2 py-1 text-sm border-none focus:outline-none w-32 text-slate-800 bg-transparent placeholder:text-slate-400"
                onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
              />
              <button onClick={handleAddStage} className="p-1 text-green-600 hover:bg-green-50 rounded"><Plus size={16} /></button>
              <button onClick={() => setIsAddingStage(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded"><X size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setIsAddingStage(true)} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
              <Plus size={16} />
              Add Stage
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <div className="flex gap-4 h-full min-w-max px-1">
          {stages.map(stage => (
            <div
              key={stage.id}
              draggable
              onDragStart={(e) => onColumnDragStart(e, stage.id)}
              className={`w-72 flex flex-col bg-slate-100 rounded-xl h-full max-h-full border transition-colors group/column cursor-grab active:cursor-grabbing ${dragOverStageId === stage.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                }`}
              onDragOver={(e) => onDragOver(e, stage.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, stage.id)}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-slate-200/50 flex justify-between items-center bg-slate-50 rounded-t-xl cursor-grab active:cursor-grabbing">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${stage.color || 'bg-slate-400'}`} />
                  {stage.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm">
                    {teachers.filter(t => t.status === stage.id).length}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleResetStage(stage.id); }}
                    className="p-1 text-slate-400 hover:text-blue-500 transition-opacity"
                    title="Reset Stage (Move all to New Lead)"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteStage(stage.id); }}
                    className="p-1 text-slate-400 hover:text-red-500 transition-opacity"
                    title="Delete Stage"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 cursor-default" onMouseDown={(e) => e.stopPropagation()}>
                {teachers.filter(t => t.status === stage.id).map(teacher => (
                  <div
                    key={teacher.id}
                    draggable
                    onDragStart={(e) => onTeacherDragStart(e, teacher.id)}
                    className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 cursor-grab hover:shadow-md transition-all active:cursor-grabbing group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={teacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover bg-slate-100 border border-slate-100"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`;
                          }}
                        />
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 leading-tight">{teacher.name}</h4>
                          <p className="text-[10px] text-slate-500">{teacher.lastActive}</p>
                        </div>
                      </div>
                    </div>

                    {teacher.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {teacher.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-slate-50 text-slate-600 text-[10px] rounded border border-slate-100 truncate max-w-[100px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-slate-50 mt-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{teacher.source}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors">
                          <Phone size={14} />
                        </button>
                        <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-green-600 transition-colors">
                          <MessageSquare size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PipelinePage;