import React, { useState, useMemo } from 'react';
import type { Teacher } from '../types';
import { type TeacherStatus, DEFAULT_STATUSES } from '../types';
import { Search, Tag, FileText, Filter, X, MessageCircle } from 'lucide-react';

interface TeacherFilterPageProps {
    teachers: Teacher[];
    onNavigateToInbox?: (teacherId: string) => void;
}

const TeacherFilterPage: React.FC<TeacherFilterPageProps> = ({ teachers, onNavigateToInbox }) => {
    const [tagFilter, setTagFilter] = useState('');
    const [noteFilter, setNoteFilter] = useState('');

    // Get all unique tags for autocomplete/dropdown suggestion
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        teachers.forEach(t => t.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags).sort();
    }, [teachers]);

    const filteredTeachers = useMemo(() => {
        return teachers.filter(t => {
            const matchesTag = tagFilter
                ? t.tags.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()))
                : true;

            const matchesNote = noteFilter
                ? t.notes.toLowerCase().includes(noteFilter.toLowerCase())
                : true;

            return matchesTag && matchesNote;
        });
    }, [teachers, tagFilter, noteFilter]);

    const clearFilters = () => {
        setTagFilter('');
        setNoteFilter('');
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Advanced Filter</h1>
                    <p className="text-slate-500">Search teachers by specific tags or internal comments.</p>
                </div>
                {(tagFilter || noteFilter) && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                    >
                        <X size={16} /> Clear Filters
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                        <Tag size={16} className="text-blue-500" /> Filter by Tag
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
                            placeholder="e.g. Selling Recordings"
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                        />
                        <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    </div>
                    {/* Tag Suggestions */}
                    {tagFilter && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {allTags
                                .filter(t => t.toLowerCase().includes(tagFilter.toLowerCase()) && t !== tagFilter)
                                .slice(0, 5)
                                .map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setTagFilter(tag)}
                                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-full transition-colors"
                                    >
                                        {tag}
                                    </button>
                                ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                        <FileText size={16} className="text-orange-500" /> Filter by Internal Notes
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={noteFilter}
                            onChange={(e) => setNoteFilter(e.target.value)}
                            placeholder="Search within comments..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                        />
                        <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    </div>
                </div>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Filter size={18} className="text-slate-400" />
                        Results <span className="text-slate-400 font-normal">({filteredTeachers.length})</span>
                    </h3>
                </div>

                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 font-semibold">Teacher</th>
                                <th className="px-6 py-3 font-semibold">Tags</th>
                                <th className="px-6 py-3 font-semibold">Internal Notes</th>
                                <th className="px-6 py-3 font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTeachers.length > 0 ? (
                                filteredTeachers.map(teacher => (
                                    <tr key={teacher.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={teacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`}
                                                    alt=""
                                                    className="w-8 h-8 rounded-full bg-slate-200 object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`;
                                                    }}
                                                />
                                                <div>
                                                    <div className="font-medium text-slate-900">{teacher.name}</div>
                                                    <button
                                                        onClick={() => onNavigateToInbox?.(teacher.id)}
                                                        className="text-xs text-slate-500 hover:text-green-600 flex items-center gap-1 transition-colors"
                                                    >
                                                        {teacher.phone} <MessageCircle size={10} />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                {teacher.tags.length > 0 ? teacher.tags.map(tag => (
                                                    <span key={tag} className={`px-2 py-0.5 text-[10px] rounded border ${tagFilter && tag.toLowerCase().includes(tagFilter.toLowerCase())
                                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                                        }`}>
                                                        {tag}
                                                    </span>
                                                )) : <span className="text-slate-400 text-xs italic">No tags</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {teacher.notes ? (
                                                <p className="text-slate-600 max-w-xs truncate" title={teacher.notes}>
                                                    {teacher.notes}
                                                </p>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">No notes</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
                        ${teacher.status === DEFAULT_STATUSES.ACTIVE_TEACHER ? 'bg-green-100 text-green-700' :
                                                    teacher.status === DEFAULT_STATUSES.NEW_LEAD ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                                                {teacher.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No teachers match your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TeacherFilterPage;
