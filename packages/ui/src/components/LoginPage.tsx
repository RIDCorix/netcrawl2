import { motion } from 'framer-motion';
import { useState } from 'react';
import { Terminal, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface LoginPageProps {
  onLogin: (token: string, user: { id: string; email: string; displayName: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email, password }
        : { email, password, displayName };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      localStorage.setItem('netcrawl-token', data.token);
      onLogin(data.token, data.user);
    } catch {
      setError('Cannot connect to server');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(74,222,128,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          width: 380, padding: 32,
          background: 'rgba(15,15,25,0.9)',
          border: '1px solid rgba(74,222,128,0.15)',
          borderRadius: 16,
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginBottom: 8,
          }}>
            <Terminal size={24} style={{ color: '#4ade80' }} />
            <span style={{
              fontSize: 24, fontWeight: 800, letterSpacing: '0.12em',
              background: 'linear-gradient(135deg, #4ade80, #22d3ee)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              NETCRAWL
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#4b6479', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            the programmable idle game
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                background: mode === m ? 'rgba(74,222,128,0.08)' : 'transparent',
                borderBottom: mode === m ? '2px solid #4ade80' : '2px solid transparent',
                color: mode === m ? '#4ade80' : '#4b6479',
                fontSize: 11, fontWeight: mode === m ? 700 : 400,
                fontFamily: 'inherit', letterSpacing: '0.05em',
                transition: 'all 0.15s',
              }}
            >
              {m === 'login' ? 'SIGN IN' : 'REGISTER'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              style={inputStyle}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            style={inputStyle}
          />

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444', fontSize: 11,
            }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px 0', borderRadius: 8, border: 'none', cursor: loading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #4ade80, #22d3ee)',
              color: '#0a0a0f', fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit', letterSpacing: '0.05em',
              opacity: loading ? 0.6 : 1,
              marginTop: 4,
            }}
          >
            {mode === 'login' ? <LogIn size={14} /> : <UserPlus size={14} />}
            {loading ? 'CONNECTING...' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(74,222,128,0.15)',
  background: 'rgba(255,255,255,0.03)',
  color: '#d6deeb',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.15s',
};
