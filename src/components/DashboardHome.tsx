
import React from 'react';
import { type Teacher, type TeacherStatus, type StatCardProps, DEFAULT_STATUSES } from '../types';
import { Users, UserPlus, MessageCircle, ArrowUpRight, ArrowRight, GitPullRequest } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardHomeProps {
  teachers: Teacher[];
  onNavigate: (tab: string) => void;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({ teachers, onNavigate }) => {
  // Calculate Stats
  const totalTeachers = teachers.length;
  const newLeads = teachers.filter(t => t.status === DEFAULT_STATUSES.NEW_LEAD).length;
  const activeTeachers = teachers.filter(t => t.status === DEFAULT_STATUSES.ACTIVE_TEACHER).length;
  const registeredTeachers = teachers.filter(t => t.status === DEFAULT_STATUSES.REGISTERED).length;
  const totalUnread = teachers.reduce((sum, t) => sum + (t.unreadCount || 0), 0);

  // Calculate Percentages
  const getPercent = (count: number) => totalTeachers > 0 ? Math.round((count / totalTeachers) * 100) : 0;

  // Calculate Daily Activity (Last 7 Days)
  const chartData = React.useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - i));
      return d;
    });

    return last7Days.map(date => {
      const dayName = days[date.getDay()];
      // Count teachers active on this day (comparing date string parts)
      const count = teachers.filter(t => {
        if (!t.lastActive) return false;
        // Handle unix timestamp or ISO string
        const activeDate = !isNaN(Number(t.lastActive))
          ? new Date(Number(t.lastActive) * 1000)
          : new Date(t.lastActive);

        return activeDate.toDateString() === date.toDateString();
      }).length;

      return { name: dayName, active: count };
    });
  }, [teachers]);

  return (
    <div className="space-y-6 h-full overflow-y-auto custom-scrollbar pr-2">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500">Welcome back, here's what's happening at Clazz.lk today.</p>
        </div>
        <button
          onClick={() => onNavigate('broadcast')}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
        >
          <MessageCircle size={18} />
          New Broadcast
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="New Leads"
          value={newLeads}
          icon={<UserPlus className="text-blue-600" />}
          trend={`${getPercent(newLeads)}% of total`}
          trendUp
        />
        <StatCard
          title="Active Teachers"
          value={activeTeachers}
          icon={<Users className="text-green-600" />}
          trend={`${getPercent(activeTeachers)}% of total`}
          trendUp
        />
        <StatCard
          title="Registered"
          value={registeredTeachers}
          icon={<GitPullRequest className="text-purple-600" />}
          trend={`${getPercent(registeredTeachers)}% of total`}
          trendUp
        />
        <StatCard
          title="Unread Messages"
          value={totalUnread}
          icon={<MessageCircle className="text-orange-600" />}
          trend="Needs attention"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-4">Daily Activity (Last 7 Days)</h3>
          <div className="h-64 w-full min-h-[250px]" style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="active" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={40} name="Active Contacts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
          <h3 className="font-semibold text-slate-800 mb-4">Recent Leads</h3>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 max-h-[250px]">
            {teachers.slice(0, 5).map(teacher => (
              <div key={teacher.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100 cursor-pointer">
                <img
                  src={teacher.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`}
                  alt=""
                  className="w-10 h-10 rounded-full bg-slate-200 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=random`;
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{teacher.name}</p>
                  <p className="text-xs text-slate-500 truncate">{teacher.status} • {teacher.source}</p>
                </div>
                <button className="text-slate-400 hover:text-green-600">
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate('contacts')}
            className="mt-4 w-full py-2 text-sm text-center text-green-600 font-medium hover:bg-green-50 rounded-lg transition-colors"
          >
            View All Contacts
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, trendUp }: StatCardProps) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
    <div className="flex items-center justify-between mb-3">
      <span className="text-slate-500 text-sm font-medium">{title}</span>
      <div className="p-2 bg-slate-50 rounded-lg">
        {icon}
      </div>
    </div>
    <div className="flex items-end justify-between">
      <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        {trend && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${trendUp ? 'text-green-600' : 'text-slate-500'} `}>
            {trendUp && <ArrowUpRight size={12} />}
            <span>{trend}</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default DashboardHome;
