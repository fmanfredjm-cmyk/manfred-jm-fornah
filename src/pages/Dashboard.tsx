import { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShieldAlert, TrendingUp, Download, Activity, Newspaper } from 'lucide-react';
import ExportModal from '../components/ExportModal';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const [data, setData] = useState<{bankroll: number, history: any[], activeBets: any[]}>({ bankroll: 0, history: [], activeBets: [] });
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  
  type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    fetch('/api/portfolio')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      });

    // Fetch News Feed
    fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news')
      .then(res => res.json())
      .then(async (json) => {
        if (json.articles && json.articles.length > 0) {
          setNews(json.articles.slice(0, 5));
        } else {
           // Fallback to general soccer news if eng.1 empty
           const gbRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/news');
           const gbJson = await gbRes.json();
           setNews(gbJson.articles?.slice(0, 5) || []);
        }
        setNewsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load news", err);
        setNewsLoading(false);
      });
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000;

    const connectWebSocket = () => {
      setConnectionState(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'SIGNALS_UPDATE') {
            setSignals(message.data);
          } else if (message.type === 'PORTFOLIO_UPDATE' || message.type === 'ARBS_UPDATE') {
            // Optional: Handle other live streams if needed
          }
        } catch (err) {
          console.error('Error parsing WS message', err);
        }
      };

      ws.onclose = () => {
        setConnectionState('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++;
          connectWebSocket();
        }, delay);
      };
      
      ws.onerror = () => {
        setConnectionState('reconnecting');
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  const stats = useMemo(() => {
    if (!signals.length) return { prob: 0, ev: 0 };
    const probSum = signals.reduce((acc, sig) => acc + parseFloat(sig.prob), 0);
    const evSum = signals.reduce((acc, sig) => acc + parseFloat(sig.ev), 0);
    return {
      prob: (probSum / signals.length).toFixed(1),
      ev: (evSum / signals.length).toFixed(1)
    };
  }, [signals]);

  if (loading) return <div className="text-text-dim animate-pulse">Initializing dashboard...</div>;

  return (
    <div className="flex flex-col gap-6 max-w-[calc(100vw-288px)]">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Quant Dashboard</h1>
          <p className="text-sm text-text-dim">Real-time football market probabilistic analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 bg-bg-surface border border-border-main hover:bg-bg-surface-alt transition-colors px-3 py-1.5 rounded-md font-medium text-text-dim hover:text-accent text-sm"
          >
            <Download className="w-4 h-4" /> Export Data
          </button>
          
          <div className={cn(
            "font-mono text-[10px] px-2 py-1 border rounded uppercase flex items-center gap-1.5 transition-colors",
            connectionState === 'connected' ? "bg-accent-dim text-accent border-accent" :
            connectionState === 'connecting' || connectionState === 'reconnecting' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
            "bg-red-500/10 text-red-500 border-red-500/30"
          )}>
            <Activity className={cn("w-3 h-3", connectionState === 'connected' && "animate-pulse")} />
            {connectionState === 'connected' ? 'Live Probability Stream Active' : 
             connectionState === 'failed' ? 'Stream Offline' : 'Connecting Stream...'}
          </div>
        </div>
      </header>

      <ExportModal 
        isOpen={showExport} 
        onClose={() => setShowExport(false)} 
        type="portfolio" 
        dataPayload={data.history}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-bg-surface border border-border-main rounded-xl p-5">
          <div className="text-[12px] text-text-dim mb-2 uppercase tracking-[0.05em]">Current Bankroll</div>
          <div className="text-2xl font-bold font-mono">${data.bankroll.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          <div className="text-[12px] text-accent mt-1">+4.2% (30d)</div>
        </div>
        
        <div className="bg-bg-surface border border-border-main rounded-xl p-5">
          <div className="text-[12px] text-text-dim mb-2 uppercase tracking-[0.05em]">Active Exposure</div>
          <div className="text-2xl font-bold font-mono">
            ${data.activeBets.filter(b => b.status === 'EXECUTED').reduce((acc, b) => acc + b.stakePlaced, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </div>
          <div className="text-[12px] text-text-dim mt-1">{(data.activeBets.filter(b => b.status === 'EXECUTED').reduce((acc, b) => acc + b.stakePlaced, 0) / data.bankroll * 100).toFixed(1) || '0.0'}% of total</div>
        </div>

        <div className="bg-bg-surface border border-border-main rounded-xl p-5 transition-colors relative overflow-hidden group">
          <div className={cn("absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity", connectionState === 'connected' && 'animate-pulse')} />
          <div className="text-[12px] text-text-dim mb-2 uppercase tracking-[0.05em] relative z-10">Win Probability</div>
          <div className="text-2xl font-bold font-mono relative z-10">{stats.prob}%</div>
          <div className="text-[12px] text-accent mt-1 relative z-10">Live stream avg ({signals.length} mkts)</div>
        </div>
        
        <div className="bg-bg-surface border border-border-main rounded-xl p-5 transition-colors relative overflow-hidden group">
          <div className={cn("absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity", connectionState === 'connected' && 'animate-pulse')} />
          <div className="text-[12px] text-text-dim mb-2 uppercase tracking-[0.05em] relative z-10">Avg Expected Value</div>
          <div className="text-2xl font-bold font-mono relative z-10">+{stats.ev}%</div>
          <div className="text-[12px] text-accent mt-1 relative z-10">Live stream avg</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 flex-1 min-h-0">
        <section>
          <div className="text-base font-semibold mb-4 flex justify-between items-center">
            <span>Historical ROI Performance</span>
          </div>
          <div className="bg-bg-surface border border-border-main rounded-xl p-5 h-96 min-h-[0]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={data.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-main)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-dim)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-main)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--color-accent)' }}
                />
                <Line type="monotone" dataKey="balance" stroke="var(--color-accent)" strokeWidth={2} dot={{ fill: 'var(--color-accent)', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="text-base font-semibold mb-1">Risk Management Parameters</div>
          <div className="bg-bg-surface p-4 rounded-xl border border-border-main">
            <div className="flex justify-between mb-2 text-[13px]">
              <span>Kelly Multiplier</span>
              <span className="font-mono">0.25 (Fractional)</span>
            </div>
            <div className="flex justify-between mb-2 text-[13px]">
              <span>Max Single Exposure</span>
              <span className="font-mono">2.0%</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span>Daily Stop Loss</span>
              <span className="font-mono">5.0%</span>
            </div>
          </div>

          <div className="bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)] p-3 rounded-lg text-[11px] text-risk-high leading-relaxed mt-auto">
            <strong>PROBABILISTIC DISCLAIMER:</strong> This platform is a decision-support tool using statistical modeling. Past performance is not indicative of future results. Betting carries significant risk of capital loss.
          </div>
        </section>
      </div>

      <section className="mt-2">
        <div className="text-base font-semibold mb-4 flex justify-between items-center">
          <span>Daily Profit & Loss Analysis</span>
          <div className="text-sm font-mono flex items-center gap-4">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent"></span> Win</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400"></span> Loss</div>
          </div>
        </div>
        <div className="bg-bg-surface border border-border-main rounded-xl p-5 h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-main)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--color-text-dim)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-text-dim)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val > 0 ? `+$${val}` : `-$${Math.abs(val)}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-main)', borderRadius: '8px' }}
                itemStyle={{ fontWeight: 'bold' }}
                cursor={{ fill: 'var(--color-bg-dark)' }}
                formatter={(value: number) => {
                  return [
                    <span style={{ color: value >= 0 ? 'var(--color-accent)' : '#f87171' }}>
                      {value >= 0 ? `+$${value.toLocaleString()}` : `-$${Math.abs(value).toLocaleString()}`}
                    </span>,
                    'Daily P&L'
                  ];
                }}
              />
              <Bar dataKey="dailyPnL" radius={[4, 4, 0, 0]}>
                {data.history.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.dailyPnL >= 0 ? 'var(--color-accent)' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-2 mb-8">
        <div className="text-base font-semibold mb-4 flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-accent" />
          <span>Real-time Market News (ENG.1)</span>
        </div>
        <div className="bg-bg-surface border border-border-main rounded-xl overflow-hidden">
          {newsLoading ? (
            <div className="p-6 text-center text-text-dim animate-pulse">Scanning news wires...</div>
          ) : news.length > 0 ? (
             <div className="divide-y divide-border-main">
               {news.map((item, idx) => (
                 <a 
                   key={idx} 
                   href={item.links?.web?.href || '#'} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="block p-5 hover:bg-bg-surface-alt transition-colors group"
                 >
                   <div className="flex flex-col gap-1">
                     <div className="flex items-center gap-2 mb-1">
                       <span className="text-[10px] font-mono text-accent uppercase tracking-wider">{item.byline || 'Wire'}</span>
                       <span className="text-[10px] text-text-dim">• {new Date(item.published).toLocaleDateString()} {new Date(item.published).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                     </div>
                     <h3 className="text-sm font-semibold text-text-main group-hover:text-accent transition-colors">{item.headline}</h3>
                     <p className="text-xs text-text-dim leading-relaxed line-clamp-2 mt-1">{item.description}</p>
                   </div>
                 </a>
               ))}
             </div>
          ) : (
            <div className="p-6 text-center text-text-dim">No recent market news found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
