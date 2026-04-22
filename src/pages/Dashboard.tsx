import { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShieldAlert, TrendingUp, Download, Activity, Newspaper, Send, MessageSquare } from 'lucide-react';
import ExportModal from '../components/ExportModal';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

export default function Dashboard() {
  const [data, setData] = useState<{bankroll: number, history: any[], activeBets: any[]}>({ bankroll: 0, history: [], activeBets: [] });
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  
  // AI Chat State
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Daily Combo State
  const [dailyCombo, setDailyCombo] = useState<{legs: any[], totalOdds: string, impliedProbability: string} | null>(null);

  const fetchDailyCombo = async () => {
    try {
      const res = await fetch('/api/daily-combo');
      const json = await res.json();
      setDailyCombo(json);
    } catch(e) {
      console.error(e);
    }
  };

  // Match Analysis State
  const [analysisModalData, setAnalysisModalData] = useState<{isOpen: boolean, match?: any, analysisText?: string, isLoading?: boolean}>({isOpen: false});

  const handleMatchAnalysisClick = async (sig: any) => {
    setAnalysisModalData({ isOpen: true, match: sig, isLoading: true });
    
    try {
      const res = await fetch('/api/analyze-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home: sig.home, away: sig.away })
      });
      const json = await res.json();
      
      if (res.ok && json.analysis) {
        setAnalysisModalData({ isOpen: true, match: sig, analysisText: json.analysis, isLoading: false });
      } else {
        setAnalysisModalData({ isOpen: true, match: sig, analysisText: "Failed to generate analysis. Please try again.", isLoading: false });
      }
    } catch(e) {
      setAnalysisModalData({ isOpen: true, match: sig, analysisText: "Connection error contacting AI.", isLoading: false });
    }
  };

  const handleAskAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatQuestion.trim() || isAiLoading) return;
    
    const question = chatQuestion;
    setChatQuestion("");
    setChatHistory(prev => [...prev, { role: 'user', text: question }]);
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      const json = await res.json();
      
      if (res.ok && json.answer) {
        setChatHistory(prev => [...prev, { role: 'ai', text: json.answer }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, the AI engine encountered an error parsing the market data." }]);
      }
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "Connection error contacting AI." }]);
    } finally {
      setIsAiLoading(false);
    }
  };
  
  type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    fetch('/api/portfolio')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      });

    fetchDailyCombo();

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

      {dailyCombo && dailyCombo.legs.length > 0 && (
        <section className="mt-2 mb-4 bg-gradient-to-r from-[rgba(16,185,129,0.05)] to-transparent border border-[rgba(16,185,129,0.2)] rounded-xl p-5 shadow-[0_0_15px_rgba(16,185,129,0.03)] border-l-4 border-l-accent">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                <span className="text-xl">🤖</span> Daily AI "Sure" Accumulator
              </h2>
              <p className="text-sm text-text-dim mt-1">High-probability accumulator (2.0 - 20.0 odds) dynamically generated from active signals.</p>
            </div>
            
            <div className="flex gap-4">
              <div className="flex flex-col items-center justify-center bg-bg-dark rounded px-4 py-2 border border-border-main">
                <span className="text-[10px] uppercase text-text-dim tracking-wider">Total Odds</span>
                <span className="font-mono font-bold text-accent text-lg">{dailyCombo.totalOdds}</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-bg-dark rounded px-4 py-2 border border-border-main">
                <span className="text-[10px] uppercase text-text-dim tracking-wider">Win Prob</span>
                <span className="font-mono font-bold text-text-main text-lg">{dailyCombo.impliedProbability}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {dailyCombo.legs.map((leg, i) => (
              <div key={leg.id} className="min-w-[200px] flex-shrink-0 bg-bg-surface border border-border-main rounded-lg p-3 relative flex flex-col justify-between">
                <div className="absolute top-2 right-2 text-xs font-mono bg-bg-dark px-1.5 py-0.5 rounded text-text-dim">Leg {i + 1}</div>
                <div className="text-[11px] text-text-dim uppercase mb-1 mt-4 line-clamp-1 pr-6">{leg.match}</div>
                <div className="font-medium text-sm text-text-main">{leg.pick}</div>
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-border-main/50">
                  <span className="font-mono text-accent text-sm">@{leg.odds}</span>
                  <span className="text-xs text-text-dim">Prob {leg.prob}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Real Football Fixtures section */}
      <section className="mb-4">
        <div className="text-base font-semibold mb-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            <span>Real Football Fixtures & Analysis</span>
          </div>
          <div className="text-xs text-text-dim bg-bg-dark px-2 py-1 rounded border border-border-main">
            {signals.length} Active Games
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {signals.slice(0, 12).map((sig) => (
            <div key={`fixture-${sig.id}`} className="bg-bg-surface border border-border-main rounded-xl p-4 flex flex-col gap-3 group hover:border-accent/50 transition-colors">
              <div className="flex justify-between items-start">
                 <div className="text-[10px] font-mono text-text-dim uppercase bg-bg-dark px-1.5 py-0.5 rounded">{sig.league || 'ENG'}</div>
                 {sig.isLive && (
                   <span className="flex items-center gap-1 bg-[#ef4444]/10 text-[#ef4444] px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse"></span> LIVE
                   </span>
                 )}
              </div>
              <div className="flex justify-between items-center gap-2 mt-1">
                <div className="text-sm font-semibold truncate flex-1 text-right">{sig.home}</div>
                <div className="text-xs text-text-dim px-2">v</div>
                <div className="text-sm font-semibold truncate flex-1 text-left">{sig.away}</div>
              </div>
              
              <div className="flex justify-between text-xs mt-1 bg-bg-dark rounded p-2 border border-border-main">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-text-dim uppercase">1</span>
                  <span className="font-mono mt-0.5 text-accent">{sig.odds}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-text-dim uppercase">Prob</span>
                  <span className="font-mono mt-0.5 text-text-main">{sig.prob}</span>
                </div>
                <div className="flex flex-col items-center">
                   <span className="text-[9px] text-text-dim uppercase">EV</span>
                   <span className="font-mono mt-0.5 text-accent">+{sig.ev}</span>
                </div>
              </div>

              <button 
                onClick={() => handleMatchAnalysisClick(sig)}
                className="mt-auto w-full py-2 bg-bg-dark hover:bg-accent hover:text-bg-dark text-text-dim text-xs font-semibold rounded uppercase tracking-wider transition-colors flex items-center justify-center gap-2 group-hover:border-accent"
              >
                <Newspaper className="w-3 h-3" /> Get Deep Match Analysis
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 flex-1 min-h-0">
        <div className="flex flex-col gap-6">
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

          <section className="w-full">
            <div className="text-base font-semibold mb-4 flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-accent" />
              <span>Real-time Market News</span>
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

          <div className="bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)] p-3 rounded-lg text-[11px] text-risk-high leading-relaxed mt-1">
            <strong>PROBABILISTIC DISCLAIMER:</strong> This platform is a decision-support tool using statistical modeling. Past performance is not indicative of future results. Betting carries significant risk of capital loss.
          </div>

          {/* AI Strategy Assistant */}
          <div className="mt-4 flex flex-col h-[500px] bg-bg-dark border border-border-main rounded-xl overflow-hidden shadow-lg object-contain">
             <div className="bg-bg-surface border-b border-border-main p-3 flex items-center gap-2">
               <MessageSquare className="w-4 h-4 text-accent" />
               <span className="text-sm font-semibold uppercase tracking-wider text-text-dim">Market Strategy AI</span>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
               {chatHistory.length === 0 ? (
                 <div className="text-center text-text-dim text-xs mt-10">
                    <p className="mb-2">I am plugged into the live EV stream.</p>
                    <p>Ask me about specific matches, potential arbitrage edges, or general probabilistic concepts.</p>
                 </div>
               ) : (
                 chatHistory.map((msg, i) => (
                   <div key={i} className={cn("text-sm", msg.role === 'user' ? "flex justify-end" : "flex justify-start")}>
                     <div className={cn(
                       "max-w-[85%] rounded-lg p-3",
                       msg.role === 'user' ? "bg-accent/10 border border-accent/20 text-text-main" : "bg-bg-surface border border-border-main text-text-dim markdown-body"
                     )}>
                       {msg.role === 'user' ? msg.text : <ReactMarkdown>{msg.text}</ReactMarkdown>}
                     </div>
                   </div>
                 ))
               )}
               {isAiLoading && (
                 <div className="flex justify-start text-sm">
                   <div className="bg-bg-surface border border-border-main text-text-dim max-w-[85%] rounded-lg p-3 animate-pulse">
                     Analyzing live market state...
                   </div>
                 </div>
               )}
             </div>

             <div className="p-3 border-t border-border-main bg-bg-surface">
               <form onSubmit={handleAskAI} className="relative flex items-center">
                 <input 
                   type="text" 
                   className="w-full bg-bg-dark border border-border-main rounded-md py-2 pl-3 pr-10 text-sm focus:outline-none focus:border-accent text-text-main placeholder-text-dim/50" 
                   placeholder="Ask about active signals..."
                   value={chatQuestion}
                   onChange={e => setChatQuestion(e.target.value)}
                   disabled={isAiLoading}
                 />
                 <button 
                   type="submit" 
                   disabled={isAiLoading || !chatQuestion.trim()}
                   className="absolute right-2 p-1 text-text-dim hover:text-accent disabled:opacity-50 disabled:hover:text-text-dim transition-colors"
                 >
                   <Send className="w-4 h-4" />
                 </button>
               </form>
             </div>
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
      
      {analysisModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center py-10 justify-center bg-bg-dark/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-bg-surface border border-border-main rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 m-4 shadow-2xl relative custom-scrollbar">
             <button 
               onClick={() => setAnalysisModalData({isOpen: false})}
               className="absolute top-4 right-4 text-text-dim hover:text-text-main p-2"
             >
               ✕
             </button>
             
             <div className="mb-6 border-b border-border-main pb-4">
               <h2 className="text-2xl font-bold flex items-center gap-2">
                 <Activity className="w-6 h-6 text-accent" /> 
                 Deep Match Analysis
               </h2>
               {analysisModalData.match && (
                 <p className="text-text-dim mt-2 text-lg">
                   {analysisModalData.match.home} <span className="text-sm px-2">vs</span> {analysisModalData.match.away}
                 </p>
               )}
             </div>

             <div className="prose prose-invert prose-headings:text-text-main prose-p:text-text-dim prose-strong:text-accent max-w-none">
                {analysisModalData.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-text-dim animate-pulse">Our AI Quantitative Engine is running match simulations and gathering real-time data...</div>
                  </div>
                ) : (
                  <div className="markdown-body text-sm leading-relaxed">
                     <ReactMarkdown>{analysisModalData.analysisText || ''}</ReactMarkdown>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
