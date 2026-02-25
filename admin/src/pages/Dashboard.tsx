import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../api';
import { useWebSocket } from '../hooks/useWebSocket';

interface Overview {
  totalCandidates: number;
  totalBots: number;
  totalJobs: number;
  byStatus: Record<string, number>;
  conversionRate: number;
}

const StatCard: React.FC<{ label: string; value: number | string; icon: string; color: string }> = ({
  label, value, icon, color
}) => (
  <div className="card p-6 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

export const DashboardPage: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await analyticsApi.overview();
      setOverview(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useWebSocket({
    NEW_APPLICATION: () => fetchData(),
    STATUS_CHANGE: () => fetchData(),
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your recruitment pipeline</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Candidates" value={overview?.totalCandidates || 0} icon="👥" color="bg-blue-50" />
        <StatCard label="Active Bots" value={overview?.totalBots || 0} icon="🤖" color="bg-purple-50" />
        <StatCard label="Open Jobs" value={overview?.totalJobs || 0} icon="💼" color="bg-green-50" />
        <StatCard label="Hire Rate" value={`${overview?.conversionRate || 0}%`} icon="🎯" color="bg-orange-50" />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Candidate Pipeline</h2>
          <div className="space-y-3">
            {overview && Object.entries(overview.byStatus).map(([status, count]) => {
              const total = overview.totalCandidates || 1;
              const pct = Math.round((count / total) * 100);
              const colors: Record<string, string> = {
                incomplete: 'bg-gray-300',
                applied: 'bg-blue-400',
                screening: 'bg-yellow-400',
                interviewing: 'bg-purple-400',
                offered: 'bg-orange-400',
                hired: 'bg-green-400',
                rejected: 'bg-red-400',
                archived: 'bg-gray-200',
              };
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium text-gray-700">{status}</span>
                    <span className="text-gray-500">{count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[status] || 'bg-blue-400'} rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'View all candidates', path: '/candidates', icon: '👥' },
              { label: 'Manage bots', path: '/bots', icon: '🤖' },
              { label: 'Post a job', path: '/jobs', icon: '💼' },
              { label: 'Analytics', path: '/analytics', icon: '📈' },
            ].map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
              >
                <span>{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
