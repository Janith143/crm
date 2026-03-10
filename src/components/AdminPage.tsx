import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Edit, Save, X, Shield } from 'lucide-react';
import { API_BASE } from '../services/api';

interface User {
    id: string;
    username: string;
    role: 'admin' | 'agent';
    permissions: string[];
    created_at: string;
}

const AVAILABLE_TABS = ['dashboard', 'inbox', 'pipeline', 'contacts', 'broadcast', 'automations', 'admin'];

const AdminPage: React.FC = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'admin' | 'agent'>('agent');
    const [permissions, setPermissions] = useState<string[]>(['dashboard', 'inbox']);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                // Parse permissions if string
                const parsedUsers = data.users.map((u: any) => ({
                    ...u,
                    permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions
                }));
                setUsers(parsedUsers);
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        }
    };

    const handleSaveUser = async () => {
        const token = localStorage.getItem('token');
        const url = editingUser
            ? `${API_BASE}/users/${editingUser.id}`
            : `${API_BASE}/users`;

        const method = editingUser ? 'PUT' : 'POST';
        const body: any = { permissions };

        if (!editingUser) {
            body.username = username;
            body.password = password;
            body.role = role;
        } else if (password) {
            body.password = password;
        }

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                fetchUsers();
                closeModal();
            }
        } catch (error) {
            console.error("Failed to save user", error);
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_BASE}/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchUsers();
        } catch (error) {
            console.error("Failed to delete user", error);
        }
    };

    const openModal = (user?: User) => {
        if (user) {
            setEditingUser(user);
            setUsername(user.username);
            setRole(user.role);
            setPermissions(user.permissions || []);
            setPassword(''); // Don't show password
        } else {
            setEditingUser(null);
            setUsername('');
            setPassword('');
            setRole('agent');
            setPermissions(['dashboard', 'inbox']);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    const togglePermission = (tab: string) => {
        if (permissions.includes(tab)) {
            setPermissions(permissions.filter(p => p !== tab));
        } else {
            setPermissions([...permissions, tab]);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6 p-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
                    <p className="text-slate-500">Manage agents, roles, and access permissions.</p>
                </div>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    <Plus size={18} /> Add User
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 font-semibold">Username</th>
                            <th className="px-6 py-3 font-semibold">Role</th>
                            <th className="px-6 py-3 font-semibold">Permissions</th>
                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 font-medium text-slate-900">{u.username}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-1">
                                        {u.permissions?.includes('all') ? (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] border border-slate-200">ALL ACCESS</span>
                                        ) : (
                                            u.permissions?.map(p => (
                                                <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] border border-slate-200 uppercase">{p}</span>
                                            ))
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => openModal(u)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                        {u.username !== 'admin' && (
                                            <button onClick={() => handleDeleteUser(u.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-slate-800">{editingUser ? 'Edit User' : 'Create New User'}</h3>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>

                        <div className="space-y-4">
                            {!editingUser && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                                        placeholder="Username"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                                    placeholder="Password"
                                />
                            </div>

                            {!editingUser && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value as 'admin' | 'agent')}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                                    >
                                        <option value="agent">Agent</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Permissions (Sidebar Tabs)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {AVAILABLE_TABS.map(tab => (
                                        <label key={tab} className="flex items-center gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={permissions.includes(tab) || permissions.includes('all')}
                                                onChange={() => togglePermission(tab)}
                                                disabled={permissions.includes('all')}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-slate-700 capitalize">{tab}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={closeModal} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button onClick={handleSaveUser} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save User</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;
