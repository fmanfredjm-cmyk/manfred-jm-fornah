import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      navigate('/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center p-4 text-text-main">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-bg-surface border border-border-main rounded-xl flex items-center justify-center mb-4">
            <div className="w-5 h-5 bg-accent rounded-sm"></div>
          </div>
          <h2 className="text-2xl font-bold mb-2">ALPHABETS AI</h2>
          <p className="text-text-dim text-sm text-center">
            Sign in to access proprietary quant signals and portfolio management tools.
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-bg-surface border border-border-main p-6 rounded-xl shadow-2xl">
          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-2">
              Institution ID / Email
            </label>
            <input 
              type="text" 
              defaultValue="admin@alphabets.fund"
              className="w-full bg-bg-dark border border-border-main rounded-lg px-4 py-2.5 text-text-main focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="mb-6">
            <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-2">
              Passphrase
            </label>
            <input 
              type="password"
              defaultValue="********"
              className="w-full bg-bg-dark border border-border-main rounded-lg px-4 py-2.5 text-text-main focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-accent hover:opacity-90 text-[#0A0B0E] font-bold py-2.5 px-4 rounded-lg transition-opacity disabled:opacity-50 flex justify-center items-center"
          >
            {loading ? <span className="w-5 h-5 border-2 border-bg-dark/20 border-t-bg-dark rounded-full animate-spin"></span> : 'Authenticate'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-border-main uppercase tracking-widest font-mono">
            Restricted System. Authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  );
}
