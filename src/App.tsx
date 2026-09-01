import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Bot, LayoutDashboard, Users, CreditCard, Settings, Plus, Trash2, CheckCircle2, XCircle, Gift, ChevronDown, ChevronUp, Eraser, Search, Edit3 } from 'lucide-react';
import type { Plan, User, Stats } from './types';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'plans' | 'users' | 'settings'>('dashboard');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row rtl">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-l border-gray-200 flex-shrink-0">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="bg-green-100 p-2 rounded-lg text-green-600">
            <Bot size={24} />
          </div>
          <h1 className="font-bold text-gray-800 text-lg">پنل مدیریت بله</h1>
        </div>
        <nav className="p-4 space-y-1">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<LayoutDashboard size={20} />} 
            label="داشبورد" 
          />
          <NavItem 
            active={activeTab === 'plans'} 
            onClick={() => setActiveTab('plans')} 
            icon={<CreditCard size={20} />} 
            label="پلن‌های اشتراک" 
          />
          <NavItem 
            active={activeTab === 'users'} 
            onClick={() => setActiveTab('users')} 
            icon={<Users size={20} />} 
            label="کاربران" 
          />
          <NavItem 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            icon={<Settings size={20} />} 
            label="تنظیمات بات" 
          />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'plans' && <PlansTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium",
        active 
          ? "bg-green-50 text-green-700" 
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// --- Dashboard ---

function DashboardTab() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then(res => res.json())
  });

  if (isLoading) return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-6 py-1"><div className="h-2 bg-slate-200 rounded"></div></div></div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-bold text-gray-800">نمای کلی داشبورد</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="کل کاربران" value={stats?.totalUsers || 0} icon={<Users size={24} className="text-blue-500" />} bg="bg-blue-50" />
        <StatCard title="اشتراک‌های فعال" value={stats?.activeSubscriptions || 0} icon={<CheckCircle2 size={24} className="text-green-500" />} bg="bg-green-50" />
        <StatCard title="تعداد پلن‌ها" value={stats?.totalPlans || 0} icon={<CreditCard size={24} className="text-purple-500" />} bg="bg-purple-50" />
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, bg }: { title: string, value: number, icon: React.ReactNode, bg: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={cn("p-4 rounded-xl", bg)}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

// --- Plans ---

function PlansTab() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => fetch('/api/plans').then(res => res.json())
  });

  const [isAdding, setIsAdding] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', price: '', durationDays: '', description: '' });

  const addMutation = useMutation({
    mutationFn: (plan: any) => fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan)
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setIsAdding(false);
      setNewPlan({ name: '', price: '', durationDays: '', description: '' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] })
  });

  if (isLoading) return <div>در حال بارگذاری...</div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">مدیریت پلن‌ها</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          {isAdding ? <XCircle size={18} /> : <Plus size={18} />}
          {isAdding ? 'انصراف' : 'افزودن پلن جدید'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">جزئیات پلن جدید</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input 
              type="text" placeholder="نام پلن (مثل: یک ماهه)" 
              className="border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none"
              value={newPlan.name} onChange={e => setNewPlan({...newPlan, name: e.target.value})}
            />
            <input 
              type="number" placeholder="قیمت (تومان)" 
              className="border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none"
              value={newPlan.price} onChange={e => setNewPlan({...newPlan, price: e.target.value})}
            />
            <input 
              type="number" placeholder="مدت زمان (روز)" 
              className="border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none"
              value={newPlan.durationDays} onChange={e => setNewPlan({...newPlan, durationDays: e.target.value})}
            />
            <input 
              type="text" placeholder="توضیحات کوتاه" 
              className="border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none"
              value={newPlan.description} onChange={e => setNewPlan({...newPlan, description: e.target.value})}
            />
          </div>
          <button 
            onClick={() => addMutation.mutate({ 
              name: newPlan.name, 
              price: Number(newPlan.price), 
              durationDays: Number(newPlan.durationDays), 
              description: newPlan.description 
            })}
            disabled={!newPlan.name || !newPlan.price || !newPlan.durationDays}
            className="bg-gray-800 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
          >
            ذخیره پلن
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans?.map(plan => (
          <div key={plan.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group hover:border-green-200 transition-colors">
            <button 
              onClick={() => deleteMutation.mutate(plan.id)}
              className="absolute top-4 left-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={18} />
            </button>
            <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
            <p className="text-3xl font-black text-gray-900 mt-2">{plan.price.toLocaleString('fa-IR')} <span className="text-sm font-normal text-gray-500">تومان</span></p>
            <p className="text-gray-600 mt-4 text-sm">{plan.description}</p>
            <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between text-sm text-gray-500">
              <span>مدت اعتبار:</span>
              <span className="font-semibold text-gray-800">{plan.durationDays} روز</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Users ---

function UsersTab() {
  const queryClient = useQueryClient();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  
  // Custom dialog states
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  
  const [editSub, setEditSub] = useState<{userId: string, subId: string, planName: string} | null>(null);
  const [editDays, setEditDays] = useState('30');
  
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(res => res.json())
  });

  const editMutation = useMutation({
    mutationFn: ({ userId, subId, addDays }: { userId: string, subId: string, addDays: number }) => 
      fetch(`/api/users/${userId}/subscriptions/${subId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addDays })
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditSub(null);
      setCleanupMessage("اشتراک با موفقیت ویرایش و تمدید شد!");
    }
  });

  const cleanupMutation = useMutation({
    mutationFn: () => 
      fetch('/api/users/cleanup-subscriptions', { method: 'POST' })
        .then(res => res.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCleanupModalOpen(false);
      setCleanupMessage(`پاکسازی انجام شد. ${data.removedCount} اشتراک منقضی‌شده حذف گردید.`);
    }
  });

  if (isLoading) return <div>در حال بارگذاری...</div>;

  const filteredUsers = users?.filter(user => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const searchStr = `${user.firstName} ${user.lastName} ${user.username} ${user.id} ${user.subscriptions?.map(s => `${s.planName} ${s.id}`).join(' ')}`.toLowerCase();
    return searchStr.includes(q);
  }) || [];

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">لیست کاربران ربات</h2>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="جستجوی کاربر یا شناسه اشتراک..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          <button 
            onClick={() => setCleanupModalOpen(true)}
            disabled={cleanupMutation.isPending}
            className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Eraser size={16} />
            {cleanupMutation.isPending ? 'در حال پاکسازی...' : 'حذف اشتراک‌های منقضی'}
          </button>
        </div>
      </div>

      {/* Message Alert Modal */}
      {cleanupMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">عملیات موفق</h3>
            <p className="text-gray-600 text-sm">{cleanupMessage}</p>
            <button 
              onClick={() => setCleanupMessage(null)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-medium"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}

      {/* Cleanup Confirm Modal */}
      {cleanupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">پاکسازی اشتراک‌ها</h3>
            <p className="text-gray-600 text-sm">آیا از حذف تمام اشتراک‌های منقضی‌شده کاربران اطمینان دارید؟ این عمل غیرقابل بازگشت است.</p>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setCleanupModalOpen(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg py-2 font-medium"
              >
                انصراف
              </button>
              <button 
                onClick={() => cleanupMutation.mutate()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-medium"
              >
                بله، حذف کن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subscription Modal */}
      {editSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <Edit3 size={24} />
              <h3 className="text-lg font-bold text-gray-900">ویرایش اشتراک</h3>
            </div>
            <p className="text-gray-600 text-sm">تعداد روزهایی که می‌خواهید به اشتراک «{editSub.planName}» اضافه کنید را وارد کنید:</p>
            <input 
              type="number"
              value={editDays}
              onChange={(e) => setEditDays(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
            />
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setEditSub(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg py-2 font-medium"
              >
                انصراف
              </button>
              <button 
                onClick={() => {
                  if (editDays && !isNaN(Number(editDays))) {
                    editMutation.mutate({ userId: editSub.userId, subId: editSub.subId, addDays: Number(editDays) });
                  }
                }}
                disabled={editMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-medium"
              >
                {editMutation.isPending ? 'در حال ثبت...' : 'تمدید اشتراک'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm text-gray-600">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-4">کاربر</th>
                <th className="px-6 py-4">شناسه بله</th>
                <th className="px-6 py-4">وضعیت اشتراک</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                    رکوردی یافت نشد.
                  </td>
                </tr>
              )}
              {filteredUsers.map(user => {
                const legacyActive = user.subscriptionEnd && new Date(user.subscriptionEnd) > new Date();
                const subs = user.subscriptions || [];
                const activeSubsCount = subs.filter(s => new Date(s.endDate) > new Date()).length + (legacyActive && subs.length === 0 ? 1 : 0);
                const hasSubs = subs.length > 0 || legacyActive;
                const isExpanded = expandedUser === user.id;
                
                return (
                  <React.Fragment key={user.id}>
                    <tr className={cn("border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer", isExpanded && "bg-gray-50")} onClick={() => hasSubs && setExpandedUser(isExpanded ? null : user.id)}>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {user.firstName} {user.lastName} 
                        {user.username && <span className="text-gray-400 text-xs mr-2">@{user.username}</span>}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{user.id}</td>
                      <td className="px-6 py-4">
                        {hasSubs ? (
                          <div className="flex items-center gap-2">
                            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", activeSubsCount > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                              {activeSubsCount > 0 ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                              {activeSubsCount > 0 ? `${activeSubsCount} اشتراک فعال` : "همه منقضی"}
                            </span>
                            <button className="text-gray-400 hover:text-gray-600 transition-colors">
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">بدون اشتراک</span>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded Content */}
                    {isExpanded && hasSubs && (
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        <td colSpan={3} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {subs.length > 0 ? subs.map((sub, i) => (
                              <div key={i} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm space-y-2 relative group">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditSub({ userId: user.id, subId: sub.id, planName: sub.planName });
                                    setEditDays('30');
                                  }}
                                  className="absolute top-3 left-3 bg-blue-50 text-blue-600 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-100 flex items-center justify-center"
                                  title="ویرایش اشتراک"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <div className="flex items-start justify-between border-b border-gray-100 pb-2 mb-2 pr-2 gap-2">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-gray-800 text-sm">{sub.planName}</span>
                                    <span className="text-[10px] text-gray-400 font-mono mt-0.5">{sub.id}</span>
                                  </div>
                                  <span className={cn("text-xs px-2 py-0.5 rounded-full whitespace-nowrap", new Date(sub.endDate) > new Date() ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                                    {new Date(sub.endDate) > new Date() ? "فعال" : "منقضی"}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 flex justify-between">
                                  <span>تاریخ پایان:</span>
                                  <span className="font-medium text-gray-700 dir-ltr">{new Date(sub.endDate).toLocaleDateString('fa-IR')}</span>
                                </div>
                                {sub.joinLink && (
                                  <div className="pt-2">
                                    <a href={sub.joinLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline text-xs break-all flex items-center gap-1">
                                      🔗 {sub.joinLink}
                                    </a>
                                  </div>
                                )}
                              </div>
                            )) : legacyActive ? (
                              <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm space-y-2">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                                  <span className="font-bold text-gray-800 text-sm">اشتراک (قدیمی)</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">فعال</span>
                                </div>
                                <div className="text-xs text-gray-500 flex justify-between">
                                  <span>تاریخ پایان:</span>
                                  <span className="font-medium text-gray-700 dir-ltr">{new Date(user.subscriptionEnd!).toLocaleDateString('fa-IR')}</span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Settings ---

function SettingsTab() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then(res => res.json())
  });

  const [form, setForm] = useState({ cardNumber: '', adminChatId: '' });

  React.useEffect(() => {
    if (settings) {
      setForm({ cardNumber: settings.cardNumber || '', adminChatId: settings.adminChatId || '' });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (newSettings: any) => 
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setMessage('✅ تنظیمات با موفقیت ذخیره شد.');
      setTimeout(() => setMessage(''), 3000);
    }
  });

  if (isLoading) return <div>در حال بارگذاری...</div>;

  return (
    <div className="space-y-6 animate-in fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800">تنظیمات پرداخت و مدیر</h2>
      
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">شماره کارت جهت واریز</label>
          <input 
            type="text" 
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none text-left"
            placeholder="مثال: 1234-5678-9012-3456"
            value={form.cardNumber}
            onChange={e => setForm({...form, cardNumber: e.target.value})}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">شناسه بله مدیر (برای دریافت فیش‌ها)</label>
          <p className="text-xs text-gray-500 mb-2">شناسه خود را می‌توانید از بخش "کاربران" (جلوی نام خودتان) کپی کنید.</p>
          <input 
            type="text" 
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 outline-none text-left"
            placeholder="مثال: 12345678"
            value={form.adminChatId}
            onChange={e => setForm({...form, adminChatId: e.target.value})}
          />
        </div>

        <button 
          onClick={() => updateMutation.mutate(form)}
          className="bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
        >
          ذخیره تنظیمات
        </button>

        {message && (
          <div className={cn("mt-4 p-4 rounded-lg text-sm font-medium", message.includes('✅') ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
            {message}
          </div>
        )}
      </div>

      <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-2">راهنمای استفاده:</h3>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-2 leading-relaxed">
          <li>شناسه مدیر را حتماً وارد کنید تا فیش‌های واریزی کاربران مستقیماً به پی‌وی بله شما ارسال شود.</li>
          <li>پس از ارسال فیش، دکمه‌های تایید و رد برای شما ظاهر می‌شود.</li>
          <li>در صورت تایید، ربات از شما یک لینک می‌خواهد. شما لینک اشتراک (مثلاً لینک کانال VIP) را می‌فرستید و ربات آن را به کاربر تحویل می‌دهد.</li>
        </ul>
      </div>
    </div>
  );
}
