import React, { useEffect, useState } from 'react';
import { authApi } from '../api';
import { useAuthStore } from '../store/auth';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export const AdminsPage: React.FC = () => {
  const { admin: currentAdmin } = useAuthStore();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'admin' });
  const [adding, setAdding] = useState(false);

  const isSuperAdmin = currentAdmin?.role === 'super_admin';

  useEffect(() => {
    authApi.getAdmins().then(setAdmins).finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const admin = await authApi.createAdmin(form);
      setAdmins((prev) => [...prev, admin]);
      setForm({ email: '', password: '', name: '', role: 'admin' });
      setShowAdd(false);
      toast.success('Admin created');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create admin');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (admin: any) => {
    if (!isSuperAdmin) return;
    try {
      const updated = await authApi.updateAdmin(admin.id, { isActive: !admin.isActive });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, ...updated } : a)));
    } catch {
      toast.error('Failed to update');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
          <p className="text-gray-500 mt-1">Manage admin accounts and permissions</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Admin</button>
        )}
      </div>

      {showAdd && isSuperAdmin && (
        <div className="card p-6 mb-6 max-w-lg">
          <h2 className="text-lg font-semibold mb-4">Create Admin</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="input"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="input"
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={adding}>
                {adding ? 'Creating...' : 'Create Admin'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Admin</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Role</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              {isSuperAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : (
              admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700">
                        {a.name?.[0]?.toUpperCase() || 'A'}
                      </div>
                      <div>
                        <p className="font-medium">
                          {a.name}
                          {a.id === currentAdmin?.id && (
                            <span className="ml-2 text-xs text-blue-500">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${a.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {a.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(a.createdAt), 'MMM d, yyyy')}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3">
                      {a.id !== currentAdmin?.id && (
                        <button
                          onClick={() => handleToggle(a)}
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            a.isActive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {a.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
