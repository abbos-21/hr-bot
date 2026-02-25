import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { botsApi } from '../api';
import toast from 'react-hot-toast';

export const BotsPage: React.FC = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ token: '', name: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    botsApi.list().then(setBots).finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const bot = await botsApi.create(form);
      setBots((prev) => [bot, ...prev]);
      setForm({ token: '', name: '' });
      setShowAdd(false);
      toast.success('Bot added successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add bot');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (bot: any) => {
    try {
      const updated = await botsApi.update(bot.id, { isActive: !bot.isActive });
      setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, ...updated } : b)));
      toast.success(updated.isActive ? 'Bot activated' : 'Bot deactivated');
    } catch {
      toast.error('Failed to update bot');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bot? All data will be lost.')) return;
    try {
      await botsApi.delete(id);
      setBots((prev) => prev.filter((b) => b.id !== id));
      toast.success('Bot deleted');
    } catch {
      toast.error('Failed to delete bot');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bots</h1>
          <p className="text-gray-500 mt-1">Manage your Telegram recruitment bots</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Bot
        </button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Add New Bot</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">Bot Token</label>
              <input
                type="text"
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                className="input"
                placeholder="1234567890:ABCDEFabcdef..."
                required
              />
              <p className="text-xs text-gray-400 mt-1">Get token from @BotFather on Telegram</p>
            </div>
            <div>
              <label className="label">Bot Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                placeholder="My Recruitment Bot"
                required
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={adding}>
                {adding ? 'Adding...' : 'Add Bot'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : bots.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">No bots yet</h3>
          <p className="text-gray-400 mb-4">Add your first Telegram bot to get started</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>Add Bot</button>
        </div>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <div key={bot.id} className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl">
                🤖
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                  {bot.username && (
                    <span className="text-sm text-gray-400">@{bot.username}</span>
                  )}
                  <span className={`badge ${bot.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {bot.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex gap-4 mt-1 text-sm text-gray-500">
                  <span>{bot._count?.jobs || 0} jobs</span>
                  <span>{bot._count?.candidates || 0} candidates</span>
                  <span>{bot.languages?.length || 0} languages</span>
                  <span>Default: {bot.defaultLang}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/bots/${bot.id}`} className="btn-secondary text-sm py-1.5">
                  Manage
                </Link>
                <button
                  onClick={() => handleToggle(bot)}
                  className={`text-sm py-1.5 px-3 rounded-lg font-medium transition-colors ${
                    bot.isActive
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {bot.isActive ? 'Pause' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(bot.id)}
                  className="text-sm py-1.5 px-3 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
