import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import arkLogo from "@/assets/ark-logo.jpeg";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const success = await login(email, password);
      if (success) {
        // Navigation is handled by AuthRedirect at "/" based on actual role from profile
        navigate("/");
      } else {
        setError("Invalid credentials. Please try again.");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-navy p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-ark-pink/5 rounded-full blur-3xl" />
      </div>
      <div className="glass-card w-full max-w-md p-8 animate-slide-up relative z-10">
        <div className="flex flex-col items-center mb-8">
          <img src={arkLogo} alt="ARK Learning Arena" className="w-24 h-24 rounded-2xl mb-4 shadow-lg" />
          <h1 className="text-2xl font-display font-bold text-foreground">ARK Learning Arena</h1>
          <p className="text-muted-foreground text-sm mt-1">Institutional Intelligence System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email"
                className="w-full bg-muted/50 border border-border rounded-lg pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all" required />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"
                className="w-full bg-muted/50 border border-border rounded-lg pl-10 pr-12 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-ark-danger text-sm text-center">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full gradient-accent text-accent-foreground font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-accent/20 disabled:opacity-50">
            {submitting ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
