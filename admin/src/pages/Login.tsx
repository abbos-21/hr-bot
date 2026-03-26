import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useT } from "../i18n";
import toast from "react-hot-toast";

export const LoginPage: React.FC = () => {
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginValue, password);
      navigate("/");
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("login.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-white px-4 py-2 mb-4">
            <img
              src="/logo.png"
              alt="HR Base"
              className="h-24 object-cover w-64"
            />
          </div>
        </div>
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            {t("login.signIn")}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t("login.login")}</label>
              <input
                type="text"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                className="input"
                placeholder={t("login.loginPlaceholder")}
                required
              />
            </div>
            <div>
              <label className="label">{t("login.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder={t("login.passwordPlaceholder")}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
