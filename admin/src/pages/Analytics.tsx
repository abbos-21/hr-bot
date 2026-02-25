import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { analyticsApi, botsApi } from '../api';

const FUNNEL_COLORS = ['#94a3b8', '#60a5fa', '#fbbf24', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#cbd5e1'];

export const AnalyticsPage: React.FC = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [perJob, setPerJob] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    botsApi.list().then(setBots);
  }, []);

  useEffect(() => {
    setLoading(true);
    const bot = selectedBot || undefined;
    Promise.all([
      analyticsApi.overview(bot),
      analyticsApi.activity(bot, days),
      analyticsApi.funnel(bot),
      analyticsApi.perJob(bot),
    ]).then(([o, a, f, p]) => {
      setOverview(o);
      setActivity(a);
      setFunnel(f);
      setPerJob(p);
    }).finally(() => setLoading(false));
  }, [selectedBot, days]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Recruitment metrics and insights</p>
        </div>
        <div className="flex gap-3">
          <select
            value={selectedBot}
            onChange={(e) => setSelectedBot(e.target.value)}
            className="input w-44"
          >
            <option value="">All bots</option>
            {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="input w-36"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading analytics...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <p className="text-sm text-gray-500">Total Applicants</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{overview?.totalCandidates || 0}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500">Completion Rate</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {overview?.totalCandidates > 0
                  ? Math.round(((overview.totalCandidates - (overview.byStatus?.incomplete || 0)) / overview.totalCandidates) * 100)
                  : 0}%
              </p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500">Hired</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{overview?.byStatus?.hired || 0}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500">Hire Rate</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">{overview?.conversionRate || 0}%</p>
            </div>
          </div>

          {/* Activity chart */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Application Activity</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="applications" stroke="#3b82f6" strokeWidth={2} dot={false} name="Applications" />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funnel */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Recruitment Funnel</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={funnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {funnel.map((_, idx) => (
                      <Cell key={idx} fill={FUNNEL_COLORS[idx % FUNNEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Per job */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Candidates per Job</h2>
              {perJob.length === 0 ? (
                <div className="text-gray-400 text-sm text-center py-8">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={perJob}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="title"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.length > 12 ? v.slice(0, 12) + '…' : v}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total candidates" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Status breakdown table */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Status Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-500">Status</th>
                    <th className="text-right py-2 font-medium text-gray-500">Count</th>
                    <th className="text-right py-2 font-medium text-gray-500">% of Total</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {overview && Object.entries(overview.byStatus).map(([status, count]: any) => {
                    const total = overview.totalCandidates || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <tr key={status} className="border-b border-gray-50">
                        <td className="py-2 capitalize font-medium">{status}</td>
                        <td className="py-2 text-right">{count}</td>
                        <td className="py-2 text-right text-gray-500">{pct}%</td>
                        <td className="py-2 pl-4">
                          <div className="h-1.5 bg-gray-100 rounded-full w-24">
                            <div
                              className="h-full bg-blue-400 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
