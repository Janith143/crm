import React, { useState } from 'react';
import { type Teacher, type TeacherStatus, ContactSource, DEFAULT_STATUSES } from '../types';
import { Search, Filter, Folder, MoreHorizontal, Download, UserCheck, PlayCircle, BookX, UserX, Tag, CheckSquare, XCircle, Plus, X, Save, Phone, MapPin, Globe, EyeOff } from 'lucide-react';
import { usePipeline } from '../context/PipelineContext';

interface ContactsPageProps {
  teachers: Teacher[];
  setTeachers: (id: string, updates: Partial<Teacher>) => void;
}

const ContactsPage: React.FC<ContactsPageProps> = ({ teachers, setTeachers: updateTeacher }) => {
  const { stages } = usePipeline();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTeacher, setCurrentTeacher] = useState<Partial<Teacher>>({
    name: '',
    phone: '',
    location: '',
    source: ContactSource.MANUAL,
    status: DEFAULT_STATUSES.NEW_LEAD,
    tags: [],
    avatarUrl: 'https://picsum.photos/200/200',
    notes: '',
    unreadCount: 0,
    lastActive: 'Just now'
  });
  const [tagInput, setTagInput] = useState('');

  // Custom Segmentation Logic
  const getTeachersByFolder = (folderName: string, list = teachers) => {
    if (folderName === 'All') return list;

    // Check if it's a pipeline stage
    const stage = stages.find(s => s.name === folderName);
    if (stage) {
      return list.filter(t => t.status === stage.name);
    }

    // Fallback for tag-based folders
    if (folderName === 'Attended Onboarding') return list.filter(t => t.tags.includes('Attended Onboarding'));
    if (folderName === 'Selling Recordings') return list.filter(t => t.tags.includes('Selling Recordings'));

    return list;
  };

  // Generate folders dynamically from pipeline stages
  const folders = [
    { name: 'All', icon: <Folder size={16} />, count: getTeachersByFolder('All').length },
    // Add folders for each pipeline stage
    ...stages.map(stage => ({
      name: stage.name,
      icon: <Folder size={16} />,
      count: getTeachersByFolder(stage.name).length
    })),
    // Keep tag-based folders
    { name: 'Attended Onboarding', icon: <PlayCircle size={16} />, count: getTeachersByFolder('Attended Onboarding').length },
    { name: 'Selling Recordings', icon: <PlayCircle size={16} />, count: getTeachersByFolder('Selling Recordings').length },
  ];

  const currentFolderTeachers = getTeachersByFolder(activeFolder);
  const filteredTeachers = currentFolderTeachers.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.phone.includes(searchTerm);
    return matchesSearch;
  });

  // Actions
  const handleUpdateStatus = (id: string, status: TeacherStatus) => {
    updateTeacher(id, { status });
    setOpenActionMenuId(null);
  };

  const handleAddTagToTeacher = (id: string, tag: string) => {
    const teacher = teachers.find(t => t.id === id);
    if (teacher && !teacher.tags.includes(tag)) {
      updateTeacher(id, { tags: [...teacher.tags, tag] });
    }
    setOpenActionMenuId(null);
  };

  // Modal Handlers
  const openAddModal = () => {
    setIsEditing(false);
    setCurrentTeacher({
      id: Date.now().toString(),
      name: '',
      phone: '',
      location: '',
      source: ContactSource.MANUAL,
      status: stages[0]?.name || DEFAULT_STATUSES.NEW_LEAD,
      tags: [],
      avatarUrl: `https://picsum.photos/200/200?random=${Date.now()}`,
      notes: '',
      unreadCount: 0,
      lastActive: 'Just now'
    });
    setTagInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (teacher: Teacher) => {
    setIsEditing(true);
    setCurrentTeacher({ ...teacher });
    setTagInput('');
    setIsModalOpen(true);
    setOpenActionMenuId(null);
  };

  const handleSaveModal = () => {
    if (!currentTeacher.name || !currentTeacher.phone) return;

    if (isEditing && currentTeacher.id) {
      updateTeacher(currentTeacher.id, currentTeacher);
    } else {
      // Creating new contacts locally is not fully supported with WhatsApp sync yet
      // For now, we just log it or could add to a local-only list if we extended App.tsx
      console.warn("Creating new contacts manually is not fully persisted to WhatsApp yet.");
    }
    setIsModalOpen(false);
  };

  const addTagInModal = () => {
    if (tagInput.trim() && !currentTeacher.tags?.includes(tagInput.trim())) {
      setCurrentTeacher(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTagInModal = (tagToRemove: string) => {
    setCurrentTeacher(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tagToRemove)
    }));
  };

  return (
    <div className="flex h-full gap-6 relative">
      {/* Folders Sidebar */}
      <div className="w-64 shrink-0 hidden lg:block bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Segments</h2>
        <div className="space-y-1">
          {folders.map(folder => (
            <button
              key={folder.name}
              onClick={() => setActiveFolder(folder.name)}
              className={`w-full flex justify-between items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeFolder === folder.name
                ? 'bg-green-50 text-green-700 border border-green-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={activeFolder === folder.name ? 'text-green-600' : 'text-slate-400'}>
                  {folder.icon}
                </span>
                {folder.name}
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activeFolder === folder.name ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-500'
                }`}>
                {folder.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden" onClick={() => setOpenActionMenuId(null)}>
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search teachers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={openAddModal}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
              <Plus size={18} />
              Add Contact
            </button>
            <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">
              <Filter size={18} />
            </button>
            <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">
              <Download size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 font-semibold">Name</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Source</th>
                <th className="px-6 py-3 font-semibold">Tags</th>
                <th className="px-6 py-3 font-semibold">Location</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeachers.map(teacher => (
                <tr key={teacher.id} className="hover:bg-slate-50/80 transition-colors group cursor-default">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={teacher.avatarUrl}
                        alt=""
                        className="w-9 h-9 rounded-full bg-slate-200 object-cover border border-slate-100"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`;
                        }}
                      />
                      <div>
                        <div className="font-semibold text-slate-900">{teacher.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{teacher.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
                      ${teacher.status === DEFAULT_STATUSES.ACTIVE_TEACHER ? 'bg-green-100 text-green-700' :
                        teacher.status === DEFAULT_STATUSES.NEW_LEAD ? 'bg-blue-100 text-blue-700' :
                          teacher.status === DEFAULT_STATUSES.FIRST_SALE ? 'bg-purple-100 text-purple-700' :
                            teacher.status === DEFAULT_STATUSES.INACTIVE ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
                      {teacher.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="bg-slate-50 border border-slate-200 px-2 py-1 rounded text-xs flex items-center gap-1 w-fit">
                      {teacher.source === ContactSource.FACEBOOK_ADS ? <Globe size={10} /> :
                        teacher.source === ContactSource.WHATSAPP ? <Phone size={10} /> : <UserCheck size={10} />}
                      {teacher.source}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap max-w-[200px]">
                      {teacher.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded border border-slate-200 truncate max-w-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{teacher.location}</td>
                  <td className="px-6 py-4 text-right relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenActionMenuId(openActionMenuId === teacher.id ? null : teacher.id); }}
                      className="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {/* Action Dropdown */}
                    {openActionMenuId === teacher.id && (
                      <div className="absolute right-8 top-8 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden text-left">
                        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Quick Actions
                        </div>
                        <div className="p-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(teacher); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2 text-slate-700"
                          >
                            <UserCheck size={14} className="text-blue-500" /> Edit Details
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(teacher.id, DEFAULT_STATUSES.VERIFIED); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2 text-slate-700"
                          >
                            <CheckSquare size={14} className="text-green-600" /> Mark as Verified
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddTagToTeacher(teacher.id, 'Selling Recordings'); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2 text-slate-700"
                          >
                            <Tag size={14} className="text-orange-500" /> Add 'Selling Recordings'
                          </button>
                          <div className="border-t border-slate-100 my-1"></div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(teacher.id, DEFAULT_STATUSES.INACTIVE); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded flex items-center gap-2 text-red-600"
                          >
                            <XCircle size={14} /> Mark as Inactive
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <EyeOff size={32} className="mb-2 opacity-50" />
                      <p>No teachers found in this segment.</p>
                      <button onClick={openAddModal} className="mt-4 text-green-600 font-medium text-sm hover:underline">Add New Teacher</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">{isEditing ? 'Edit Contact' : 'Add New Contact'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full p-1 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Avatar & Basic Info */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  <img src={currentTeacher.avatarUrl} className="w-16 h-16 rounded-full bg-slate-200 border border-slate-200" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                    <input
                      type="text"
                      value={currentTeacher.name}
                      onChange={(e) => setCurrentTeacher({ ...currentTeacher, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="e.g. Nimal Perera"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone Number</label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={currentTeacher.phone}
                        onChange={(e) => setCurrentTeacher({ ...currentTeacher, phone: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="+94 77 123 4567"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={currentTeacher.location}
                      onChange={(e) => setCurrentTeacher({ ...currentTeacher, location: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="City, District"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                  <select
                    value={currentTeacher.status}
                    onChange={(e) => setCurrentTeacher({ ...currentTeacher, status: e.target.value as TeacherStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                  >
                    {stages.map(stage => (
                      <option key={stage.id} value={stage.name}>{stage.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tag Management */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tags</label>
                <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 min-h-[80px]">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {currentTeacher.tags?.map(tag => (
                      <span key={tag} className="bg-white border border-slate-200 px-2 py-1 rounded text-xs flex items-center gap-1 text-slate-700 shadow-sm">
                        {tag}
                        <button onClick={() => removeTagInModal(tag)} className="text-slate-400 hover:text-red-500 ml-1"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTagInModal()}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-green-500"
                      placeholder="Type new tag & press Enter"
                    />
                    <button onClick={addTagInModal} className="bg-slate-200 text-slate-600 px-3 rounded text-sm font-medium hover:bg-slate-300">+</button>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
                <textarea
                  value={currentTeacher.notes}
                  onChange={(e) => setCurrentTeacher({ ...currentTeacher, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent h-20 resize-none"
                  placeholder="Internal notes about this teacher..."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModal}
                className="px-6 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
              >
                <Save size={16} />
                {isEditing ? 'Save Changes' : 'Create Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsPage;