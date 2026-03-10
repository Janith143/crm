import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Users, GitPullRequest, Send, Settings, Workflow, Filter, LogOut, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = async () => {
        logout();
        navigate('/login');
    };

    const hasPermission = (tab: string) => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        if (user.permissions?.includes('all')) return true;
        return user.permissions?.includes(tab);
    };

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
        { id: 'inbox', label: 'Inbox', icon: MessageSquare, path: '/inbox' },
        { id: 'pipeline', label: 'Pipeline', icon: GitPullRequest, path: '/pipeline' },
        { id: 'contacts', label: 'Contacts', icon: Users, path: '/contacts' },
        { id: 'broadcast', label: 'Broadcast', icon: Send, path: '/broadcast' },
        { id: 'automations', label: 'Automations', icon: Workflow, path: '/automations' },
        { id: 'filter', label: 'Filter', icon: Filter, path: '/filter' },
        { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
    ];

    if (user?.role === 'admin') {
        menuItems.push({ id: 'admin', label: 'Admin', icon: Shield, path: '/admin' });
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div className={`
                bg-slate-900 text-white flex flex-col transition-all duration-300
                fixed md:relative z-50 h-full
                ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                ${isCollapsed ? 'w-20' : 'w-64'}
            `}>
                <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} border-b border-slate-800`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">
                                C
                            </div>
                            <span className="font-bold text-lg">Clazz CRM</span>
                        </div>
                    )}
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors hidden md:block"
                    >
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors md:hidden"
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>

                <div className="flex-1 py-4 overflow-y-auto">
                    <nav className="space-y-1 px-2">
                        {menuItems.filter(item => hasPermission(item.id)).map((item) => (
                            <NavLink
                                key={item.id}
                                to={item.path}
                                onClick={() => onClose()} // Close on mobile when clicked
                                className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'} ${isCollapsed ? 'justify-center' : ''}`
                                }
                                title={isCollapsed ? item.label : ''}
                            >
                                <item.icon size={20} />
                                {!isCollapsed && <span>{item.label}</span>}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="p-4 border-t border-slate-800">
                    {!isCollapsed ? (
                        <>
                            <div className="flex items-center gap-3 mb-4 px-2">
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
                                    {user?.username?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{user?.username}</p>
                                    <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <LogOut size={20} />
                                <span>Logout</span>
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <div
                                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold cursor-default"
                                title={user?.username}
                            >
                                {user?.username?.substring(0, 2).toUpperCase()}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center justify-center p-2 w-full rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="Logout"
                            >
                                <LogOut size={20} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default Sidebar;
