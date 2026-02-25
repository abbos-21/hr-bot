import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { jobsApi, botsApi } from '../api';
import toast from 'react-hot-toast';

export const JobsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const botIdFilter = searchParams.get('botId') || '';

  const [jobs, setJobs] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    botId: botIdFilter,
    title_en: '',
    desc_en: '',
    isActive: true,
  });

  useEffect(() => {
    Promise.all([
      jobsApi.list(botIdFilter || undefined),
      botsApi.list(),
    ]).then(([j, b]) => {
      setJobs(j);
      setBots(b);
    }).finally(() => setLoading(false));
  }, [botIdFilter]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.botId) return toast.error('Select a bot');
    try {
      const job = await jobsApi.create({
        botId: form.botId,
        isActive: form.isActive,
        translations: [{ lang: 'en', title: form.title_en, description: form.desc_en }],
      });
      setJobs((prev) => [job, ...prev]);
      setForm({ botId: botIdFilter, title_en: '', desc_en: '', isActive: true });
      setShowAdd(false);
      toast.success('Job created');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create job');
    }
  };

  const handleToggle = async (job: any) => {
    try {
      const updated = await jobsApi.update(job.id, { isActive: !job.isActive });
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...updated } : j)));
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    try {
      await jobsApi.delete(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success('Job deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">Manage job postings and survey flows</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New Job</button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create Job</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">Bot</label>
              <select
                value={form.botId}
                onChange={(e) => setForm((f) => ({ ...f, botId: e.target.value }))}
                className="input"
                required
              >
                <option value="">Select bot...</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Job Title (English)</label>
              <input
                type="text"
                value={form.title_en}
                onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
                className="input"
                placeholder="e.g. Senior React Developer"
                required
              />
            </div>
            <div>
              <label className="label">Description (English)</label>
              <textarea
                value={form.desc_en}
                onChange={(e) => setForm((f) => ({ ...f, desc_en: e.target.value }))}
                className="input"
                rows={3}
                placeholder="Job description..."
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">Active (visible to candidates)</label>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary">Create Job</button>
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4">💼</div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">No jobs yet</h3>
          <p className="text-gray-400 mb-4">Create your first job posting</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>New Job</button>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const title = job.translations?.[0]?.title || 'Untitled';
            return (
              <div key={job.id} className="card p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg">💼</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <span className={`badge ${job.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {job.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-sm text-gray-500">
                    <span>{job._count?.candidates || 0} candidates</span>
                    <span>{job._count?.questions || 0} questions</span>
                    <span>{job.translations?.length || 0} languages</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/jobs/${job.id}`} className="btn-secondary text-sm py-1.5">
                    Edit
                  </Link>
                  <button
                    onClick={() => handleToggle(job)}
                    className={`text-sm py-1.5 px-3 rounded-lg font-medium transition-colors ${
                      job.isActive
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {job.isActive ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="text-sm py-1.5 px-3 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
