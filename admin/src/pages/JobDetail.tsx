import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { jobsApi, questionsApi, botsApi } from '../api';
import toast from 'react-hot-toast';

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'translations' | 'questions'>('translations');
  const [translationForm, setTranslationForm] = useState<Record<string, { title: string; description: string }>>({});
  const [showAddQ, setShowAddQ] = useState(false);
  const [qForm, setQForm] = useState({
    type: 'text',
    fieldKey: '',
    translations: {} as Record<string, string>,
    options: [] as { translations: Record<string, string> }[],
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([jobsApi.get(id), questionsApi.list({ jobId: id })]).then(async ([j, q]) => {
      setJob(j);
      setQuestions(q);
      const b = await botsApi.get(j.botId);
      setBot(b);
      // Init translations
      const tf: any = {};
      j.translations.forEach((t: any) => {
        tf[t.lang] = { title: t.title, description: t.description };
      });
      setTranslationForm(tf);
    }).finally(() => setLoading(false));
  }, [id]);

  const langs = bot?.languages || [];

  const handleSaveTranslations = async () => {
    if (!id) return;
    const translations = Object.entries(translationForm).map(([lang, { title, description }]) => ({
      lang, title, description,
    }));
    try {
      await jobsApi.update(id, { translations });
      toast.success('Translations saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    const translations = Object.entries(qForm.translations)
      .filter(([, text]) => text)
      .map(([lang, text]) => ({ lang, text }));

    const options = qForm.type === 'choice' ? qForm.options.map((opt, idx) => ({
      order: idx,
      translations: Object.entries(opt.translations)
        .filter(([, text]) => text)
        .map(([lang, text]) => ({ lang, text })),
    })) : [];

    try {
      const q = await questionsApi.create({
        botId: job.botId,
        jobId: id,
        type: qForm.type,
        order: questions.length,
        fieldKey: qForm.fieldKey || null,
        translations,
        options,
      });
      setQuestions((prev) => [...prev, q]);
      setQForm({ type: 'text', fieldKey: '', translations: {}, options: [] });
      setShowAddQ(false);
      toast.success('Question added');
    } catch {
      toast.error('Failed to add question');
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm('Delete question?')) return;
    try {
      await questionsApi.delete(qId);
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      toast.success('Question deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleToggleQuestion = async (q: any) => {
    try {
      await questionsApi.update(q.id, { isActive: !q.isActive });
      setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, isActive: !x.isActive } : x));
    } catch {
      toast.error('Failed to update');
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!job) return <div className="p-8 text-gray-400">Job not found</div>;

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/jobs" className="text-gray-400 hover:text-gray-600 text-sm">← Jobs</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">
          {job.translations?.[0]?.title || 'Untitled Job'}
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['translations', 'questions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'translations' && (
        <div className="space-y-4 max-w-2xl">
          {langs.length === 0 && (
            <div className="text-gray-400 text-sm">No languages configured for this bot.</div>
          )}
          {langs.map((lang: any) => {
            const tf = translationForm[lang.code] || { title: '', description: '' };
            return (
              <div key={lang.code} className="card p-5">
                <h3 className="font-medium text-gray-800 mb-3">{lang.name} ({lang.code})</h3>
                <div className="space-y-3">
                  <div>
                    <label className="label">Title</label>
                    <input
                      type="text"
                      value={tf.title}
                      onChange={(e) => setTranslationForm((prev) => ({
                        ...prev,
                        [lang.code]: { ...tf, title: e.target.value },
                      }))}
                      className="input"
                      placeholder="Job title..."
                    />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <textarea
                      value={tf.description}
                      onChange={(e) => setTranslationForm((prev) => ({
                        ...prev,
                        [lang.code]: { ...tf, description: e.target.value },
                      }))}
                      className="input"
                      rows={3}
                      placeholder="Job description..."
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <button className="btn-primary" onClick={handleSaveTranslations}>
            Save Translations
          </button>
        </div>
      )}

      {tab === 'questions' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">{questions.length} questions in this survey</p>
            <button className="btn-primary text-sm" onClick={() => setShowAddQ(true)}>+ Add Question</button>
          </div>

          {showAddQ && (
            <div className="card p-6 mb-4">
              <h3 className="font-semibold mb-4">New Question</h3>
              <form onSubmit={handleAddQuestion} className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="label">Type</label>
                    <select
                      value={qForm.type}
                      onChange={(e) => setQForm((f) => ({ ...f, type: e.target.value, options: [] }))}
                      className="input"
                    >
                      <option value="text">Text (open)</option>
                      <option value="choice">Choice (buttons)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="label">Field Key (optional)</label>
                    <select
                      value={qForm.fieldKey}
                      onChange={(e) => setQForm((f) => ({ ...f, fieldKey: e.target.value }))}
                      className="input"
                    >
                      <option value="">None</option>
                      <option value="fullName">Full Name</option>
                      <option value="age">Age</option>
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Question Text (per language)</label>
                  {langs.map((lang: any) => (
                    <div key={lang.code} className="flex gap-2 mb-2">
                      <span className="text-sm font-mono bg-gray-100 px-2 py-2 rounded w-10 text-center">{lang.code}</span>
                      <input
                        type="text"
                        value={qForm.translations[lang.code] || ''}
                        onChange={(e) => setQForm((f) => ({
                          ...f,
                          translations: { ...f.translations, [lang.code]: e.target.value },
                        }))}
                        className="input flex-1"
                        placeholder={`Question in ${lang.name}`}
                      />
                    </div>
                  ))}
                </div>

                {qForm.type === 'choice' && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="label mb-0">Options</label>
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:text-blue-800"
                        onClick={() => setQForm((f) => ({
                          ...f,
                          options: [...f.options, { translations: {} }],
                        }))}
                      >
                        + Add Option
                      </button>
                    </div>
                    {qForm.options.map((opt, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3 mb-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Option {idx + 1}</span>
                          <button
                            type="button"
                            className="text-red-500 text-xs hover:text-red-700"
                            onClick={() => setQForm((f) => ({
                              ...f,
                              options: f.options.filter((_, i) => i !== idx),
                            }))}
                          >
                            Remove
                          </button>
                        </div>
                        {langs.map((lang: any) => (
                          <div key={lang.code} className="flex gap-2 mb-1">
                            <span className="text-sm font-mono bg-gray-100 px-2 py-1.5 rounded w-10 text-center text-xs">{lang.code}</span>
                            <input
                              type="text"
                              value={opt.translations[lang.code] || ''}
                              onChange={(e) => setQForm((f) => {
                                const newOpts = [...f.options];
                                newOpts[idx] = {
                                  ...newOpts[idx],
                                  translations: { ...newOpts[idx].translations, [lang.code]: e.target.value },
                                };
                                return { ...f, options: newOpts };
                              })}
                              className="input flex-1 text-sm"
                              placeholder={`Option in ${lang.name}`}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="submit" className="btn-primary">Add Question</button>
                  <button type="button" className="btn-secondary" onClick={() => setShowAddQ(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-2">
            {questions.map((q, idx) => {
              const text = q.translations?.[0]?.text || 'Untitled';
              return (
                <div key={q.id} className={`card p-4 flex items-start gap-3 ${!q.isActive ? 'opacity-50' : ''}`}>
                  <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-500 mt-0.5">
                    #{idx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{text}</p>
                      <span className="badge bg-blue-50 text-blue-600 text-xs">{q.type}</span>
                      {q.fieldKey && <span className="badge bg-purple-50 text-purple-600 text-xs">{q.fieldKey}</span>}
                      {!q.isActive && <span className="badge bg-gray-100 text-gray-500 text-xs">Inactive</span>}
                    </div>
                    {q.type === 'choice' && (
                      <p className="text-xs text-gray-400 mt-1">
                        {q.options?.length || 0} options
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleQuestion(q)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {q.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
