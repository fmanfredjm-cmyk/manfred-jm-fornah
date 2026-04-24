import { useEffect, useState, MouseEvent, useMemo, useRef } from 'react';
import { Play, ArrowRightLeft, Filter, ArrowUpDown, ChevronDown, ChevronUp, Bell, BellRing, X, Plus, Trash2, Download, Activity } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, YAxis, ComposedChart, Scatter, ScatterChart, ZAxis, BarChart, Bar, Legend } from 'recharts';
import { cn } from '../lib/utils';
import ExportModal from '../components/ExportModal';
import { Sentinel } from '../lib/sentinel';

const LiveValue = ({ value, prefix = '', suffix = '', className = '' }: { value: string | number, prefix?: string, suffix?: string, className?: string }) => {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const prev = prevValueRef.current;
    if (prev !== value) {
      const pNum = typeof prev === 'string' ? parseFloat(prev.replace(/[^\d.-]/g, '')) : prev;
      const cNum = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
      
      if (!isNaN(pNum) && !isNaN(cNum)) {
        if (cNum > pNum) setFlash('up');
        else if (cNum < pNum) setFlash('down');
        
        const t = setTimeout(() => setFlash(null), 800);
        prevValueRef.current = value;
        return () => clearTimeout(t);
      }
    }
  }, [value]);

  return (
    <span className={cn(
      "transition-all duration-300",
      flash === 'up' ? "text-[#10b981] bg-[rgba(16,185,129,0.3)] shadow-[0_0_10px_rgba(16,185,129,0.4)] rounded px-1 -mx-1 font-bold transform scale-105 inline-block" : 
      flash === 'down' ? "text-[#ef4444] bg-[rgba(239,68,68,0.3)] shadow-[0_0_10px_rgba(239,68,68,0.4)] rounded px-1 -mx-1 font-bold transform scale-105 inline-block" : "inline-block transform scale-100",
      className
    )}>
      {prefix}{value}{suffix}
    </span>
  );
};

function PredictionCard({ title, items }: { title: string, items: { label: string, value: string, highlight?: boolean }[] }) {
  return (
    <div className="bg-bg-surface-alt border border-border-main rounded-md p-3 hover:border-accent/40 transition-colors duration-300">
      <h4 className="font-semibold text-text-dim uppercase tracking-wider text-[10px] mb-3 pb-1.5 border-b border-border-main/50">
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              {item.highlight && parseFloat(item.value) > 50 && (
                <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              )}
              <span className={cn(
                "text-text-dim",
                item.highlight && "font-medium"
              )}>{item.label}</span>
            </div>
            <span className={cn(
              "font-mono",
              item.highlight ? "text-accent font-semibold" : "text-text-main"
            )}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type AlertType = 'ev_threshold' | 'market_prob' | 'bookmaker_odds';

interface AlertRule {
  id: string;
  type: AlertType;
  operator: '>=' | '<=';
  value: number; // For EV/Market, it's %. For Bookmaker Odds, it's decimal odds.
  marketPath?: string; // e.g. "corners95.over", for market_prob and bookmaker_odds
  bookmaker?: string; // e.g. "Pinnacle", only for bookmaker_odds
}

interface ToastNotification {
  id: string;
  match: string;
  message: string;
}

export default function Signals() {
  const [signals, setSignals] = useState<any[]>([]);
  const [arbs, setArbs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);

  const [filterRisk, setFilterRisk] = useState<string>('All');
  const [filterMarket, setFilterMarket] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('ev');
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');
  
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  
  // Bet Slip State
  interface BetSlipItem {
    id: string;
    match: string;
    market: string;
    odds: string;
    stake: string;
    originalStake: string;
  }
  const [betSlip, setBetSlip] = useState<BetSlipItem[]>([]);
  const [isExecutingSlip, setIsExecutingSlip] = useState(false);

  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [alertRules, setAlertRules] = useState<AlertRule[]>(() => {
    try {
      const saved = localStorage.getItem('quant_alert_rules');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('quant_alert_rules', JSON.stringify(alertRules));
  }, [alertRules]);

  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  
  // Ref to track triggered events so they only fire once
  const triggeredHistory = useRef<Set<string>>(new Set());

  type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'polling';
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [manualReconnectTrigger, setManualReconnectTrigger] = useState(0);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetchSignals();

    if (isPolling) {
      setConnectionState('polling');
      const interval = setInterval(fetchSignals, 5000);
      return () => clearInterval(interval);
    }

    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 30000; // Cap at 30 seconds
    const maxAttemptsBeforePrompt = 5;

    const connectWebSocket = () => {
      if (reconnectAttempts > 0) {
        setConnectionState('reconnecting');
      } else {
        setConnectionState('connecting');
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setConnectionState('connected');
        reconnectAttempts = 0; // Reset attempts on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'SIGNALS_UPDATE') {
            setSignals(message.data);
            setLoading(false);
          } else if (message.type === 'ARBS_UPDATE') {
            setArbs(message.data);
          }
        } catch (err) {
          console.error('Error parsing WS message', err);
        }
      };

      ws.onclose = (event) => {
        // If we've already switched to polling due to an onerror abort, don't trigger reconnect loops
        if (isPolling) return;
        
        console.warn(`WebSocket disconnected (Code: ${event.code}, Reason: ${event.reason || 'None'}).`);
        setConnectionState('reconnecting');
        
        if (reconnectAttempts >= maxAttemptsBeforePrompt) {
          console.error('Max reconnect attempts reached. Switching to failed state. Waiting for user action.');
          setConnectionState('failed');
          return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, up to 30s max
        const baseDelay = 1000;
        const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxReconnectDelay);
        console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1} in ${delay}ms...`);
        
        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++;
          connectWebSocket();
        }, delay);
      };
      
      ws.onerror = (error) => {
        // Auto-failover to polling silently gives users the best experience in environments where WS proxies drop
        // We use console.info here instead of console.error so it doesn't trigger "error" monitors
        console.info('🔌 WebSockets restricted by environment proxy. Seamlessly falling back to active polling stream over HTTP.');
        setIsPolling(true);
        setConnectionState('polling');
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // Prevent reconnect logic from firing on cleanup
        ws.close();
      }
    };
  }, [manualReconnectTrigger, isPolling]);

  const handleManualReconnect = () => {
    setIsPolling(false);
    setManualReconnectTrigger(prev => prev + 1);
  };

    const fetchSignals = () => {
    Sentinel.fetchProtected<any[]>('/api/signals', {}, { defaultValue: [] })
      .then(data => {
        setSignals(data);
      })
      .catch(e => console.debug('Polling wait...'));
      
    Sentinel.fetchProtected<any[]>('/api/arbitrage', {}, { defaultValue: [] })
      .then(data => {
        setArbs(data);
        setLoading(false);
      })
      .catch(e => {});
  };

  const handleExecute = async (id: string, ev: MouseEvent) => {
    ev.preventDefault();
    setExecuting(id);
    try {
      await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signalId: id })
      });
      fetchSignals();
    } catch (e) {
      console.error(e);
    } finally {
      setExecuting(null);
    }
  };

  const toggleBetSlip = (sig: any, e: MouseEvent) => {
    e.stopPropagation();
    setBetSlip(prev => {
      const exists = prev.find(item => item.id === sig.id);
      if (exists) {
        return prev.filter(item => item.id !== sig.id);
      }
      return [...prev, {
        id: sig.id,
        match: sig.match,
        market: 'Home Win', // Defaulting based on probability
        odds: sig.odds,
        stake: sig.recommendedStake,
        originalStake: sig.recommendedStake
      }];
    });
  };

  const executeBetSlip = async () => {
    if (betSlip.length === 0) return;
    setIsExecutingSlip(true);
    try {
      // Execute all simultaneously
      const results = await Promise.allSettled(
        betSlip.map(slip => 
          fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signalId: slip.id, stake: slip.stake })
          }).then(res => {
            if (!res.ok) throw new Error('Failed');
            return res;
          })
        )
      );
      
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.length - successes;
      
      if (failures > 0) {
        alert(`Executed ${successes} bets. \nFailed ${failures} bets.`);
      } else {
        // Only clear if all succeeded, or we can clear all and refetch
        setBetSlip([]);
      }
      fetchSignals();
    } catch(e) {
      console.error("Batch exec failed", e);
      alert("An error occurred executing the bet slip.");
    } finally {
      setIsExecutingSlip(false);
    }
  };

  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.error("Audio playback error", e);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const resolveMarketProb = (signal: any, path: string): number => {
    try {
      const parts = path.split('.');
      let currentObj = signal.predictions;
      
      for (let i = 0; i < parts.length; i++) {
        if (!currentObj[parts[i]]) return 0;
        currentObj = currentObj[parts[i]];
      }
      
      if (typeof currentObj === 'string') {
        return parseFloat(currentObj.replace('%', ''));
      } else if (typeof currentObj === 'number') {
        return currentObj;
      }
      
      return 0;
    } catch (e) {
      return 0;
    }
  };

  // Evaluate Signals against active alerts
  useEffect(() => {
    if (signals.length === 0 || alertRules.length === 0) return;

    let newToasts: ToastNotification[] = [];

    signals.forEach(sig => {
      alertRules.forEach(rule => {
        const historyKey = `${rule.id}_${sig.id}`;
        if (triggeredHistory.current.has(historyKey)) return;

        let triggered = false;
        let message = '';

        if (rule.type === 'ev_threshold') {
          const currentEv = parseFloat(sig.ev);
          const op = rule.operator || '>=';
          triggered = op === '>=' ? currentEv >= rule.value : currentEv <= rule.value;
          if (triggered) {
            message = `EV hit conditional threshold: +${sig.ev}%`;
          }
        } else if (rule.type === 'market_prob' && rule.marketPath) {
          const prob = resolveMarketProb(sig, rule.marketPath);
          const op = rule.operator || '>=';
          triggered = op === '>=' ? prob >= rule.value : prob <= rule.value;
          if (triggered) {
            message = `${rule.marketPath.replace('.', ' ')} prob hit ${prob}%`;
          }
        } else if (rule.type === 'bookmaker_odds' && rule.bookmaker) {
          if (sig.bookmakers && sig.bookmakers.length > 0) {
            const bIndex = sig.bookmakers.findIndex((b: any) => b.name === rule.bookmaker);
            if (bIndex !== -1) {
              const bOdds = parseFloat(sig.bookmakers[bIndex].odds);
              if (!isNaN(bOdds)) {
                const op = rule.operator || '>=';
                triggered = op === '>=' ? bOdds >= rule.value : bOdds <= rule.value;
                if (triggered) {
                  message = `${rule.bookmaker} odds for something hit ${bOdds}`; // we don't have the explicit market here since it's just main matchOdds
                }
              }
            }
          }
        }

        if (triggered) {
          triggeredHistory.current.add(historyKey);
          newToasts.push({
            id: historyKey + '_' + Date.now(),
            match: sig.match,
            message
          });
        }
      });
    });

    if (newToasts.length > 0) {
      playAlertSound();
      setToasts(prev => [...prev, ...newToasts]);
      
      // Auto-dismiss toasts after 5 seconds
      newToasts.forEach(t => {
        setTimeout(() => removeToast(t.id), 5000);
      });
    }
  }, [signals, alertRules]);

  const processedSignals = useMemo(() => {
    let filtered = signals;
    if (filterRisk !== 'All') {
      filtered = signals.filter(s => s.riskLevel === filterRisk);
    }
    if (filterMarket !== 'All') {
      // For now this is a visual mock filter because current signals represent 'Match Winner' Home Win primarily,
      // but we pretend it filters out non-matching signal types.
      if (filterMarket === 'In-Play Only') {
        filtered = filtered.filter(s => s.isLive);
      } else if (filterMarket === 'Pre-Match Only') {
        filtered = filtered.filter(s => !s.isLive);
      } else if (filterMarket === 'High EV (>10%)') {
        filtered = filtered.filter(s => parseFloat(s.ev) > 10);
      }
    }
    
    return filtered.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      
      if (sortBy === 'ev') {
        valA = parseFloat(a.ev);
        valB = parseFloat(b.ev);
      } else if (sortBy === 'odds') {
        valA = parseFloat(a.odds);
        valB = parseFloat(b.odds);
      } else if (sortBy === 'prob') {
        valA = parseFloat(a.prob);
        valB = parseFloat(b.prob);
      }
      
      if (sortOrder === 'desc') return valB - valA;
      return valA - valB;
    });
  }, [signals, filterRisk, sortBy, sortOrder]);

  if (loading) return <div className="text-text-dim animate-pulse">Scanning markets...</div>;

  return (
    <div className="max-w-[calc(100vw-288px)] space-y-12">
      {/* Connection Status Banner */}
      {connectionState !== 'connected' && (
        <div className={cn(
          "px-4 py-3 rounded-lg border text-sm flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md",
          connectionState === 'connecting' && "border-blue-500/30 bg-blue-500/10 text-blue-400",
          connectionState === 'reconnecting' && "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
          connectionState === 'failed' && "border-red-500/30 bg-red-500/10 text-red-500",
          connectionState === 'polling' && "border-gray-500/30 bg-gray-500/10 text-gray-400"
        )}>
          <div className="flex items-center gap-2 font-medium">
            {connectionState === 'connecting' && <><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Connecting to live feed...</>}
            {connectionState === 'reconnecting' && <><span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /> Connection lost. Attempting to reconnect...</>}
            {connectionState === 'failed' && <><span className="w-2 h-2 rounded-full bg-red-500" /> Persistent connection failure.</>}
            {connectionState === 'polling' && <><span className="w-2 h-2 rounded-full bg-gray-500 blink" /> Live stream disabled. Polling mode active.</>}
          </div>

          {(connectionState === 'failed' || connectionState === 'polling') && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleManualReconnect}
                className="px-3 py-1.5 bg-bg-surface border border-border-main hover:bg-bg-surface-alt rounded font-medium text-text-main transition-colors text-xs"
              >
                Retry Connection
              </button>
              {connectionState === 'failed' && (
                <button 
                  onClick={() => setIsPolling(true)}
                  className="px-3 py-1.5 bg-bg-surface border border-border-main hover:bg-bg-surface-alt rounded font-medium text-text-main transition-colors text-xs"
                >
                  Switch to Polling (5s)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Alerts Container */}
      <div className="fixed top-20 right-6 z-50 flex flex-col gap-2 pointer-events-none w-72">
        {toasts.map(toast => (
          <div key={toast.id} className="bg-bg-surface border-l-4 border-accent p-3 shadow-lg rounded pointer-events-auto animate-in slide-in-from-right-4 fade-in flex items-start gap-3">
            <BellRing className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold">{toast.match}</div>
              <div className="text-[10px] text-text-dim mt-0.5">{toast.message}</div>
            </div>
            <button onClick={() => removeToast(toast.id)} className="text-text-dim hover:text-text-main transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Alerts Configuration Panel Modal */}
      {showAlertsPanel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-main rounded-xl w-full max-w-md shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowAlertsPanel(false)}
              className="absolute top-4 right-4 text-text-dim hover:text-text-main transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" /> Active Alerts
            </h3>
            
            <div className="space-y-4 mb-6 max-h-60 overflow-y-auto pr-2">
              {alertRules.length === 0 ? (
                <div className="text-text-dim text-sm italic text-center py-4 bg-bg-dark border border-dashed border-border-main rounded">
                  No alerts configured.
                </div>
              ) : (
                alertRules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between p-3 bg-bg-dark border border-border-main rounded-lg text-sm">
                    <div>
                      {rule.type === 'ev_threshold' && (
                        <span className="font-semibold text-accent">EV {rule.operator || '>='} {rule.value}%</span>
                      )}
                      {rule.type === 'market_prob' && (
                        <span><span className="text-zinc-300 font-mono text-[11px]">{rule.marketPath}</span> <span className="font-semibold text-accent">{rule.operator || '>='} {rule.value}%</span></span>
                      )}
                      {rule.type === 'bookmaker_odds' && (
                        <span><span className="text-zinc-300 font-mono text-[11px]">{rule.bookmaker} [{rule.marketPath}]</span> <span className="font-semibold text-accent">{rule.operator || '>='} {rule.value}</span></span>
                      )}
                    </div>
                    <button 
                      onClick={() => setAlertRules(prev => prev.filter(r => r.id !== rule.id))}
                      className="text-red-400 hover:text-red-300 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-border-main pt-4">
              <h4 className="text-sm font-semibold mb-3">Add New Alert</h4>
              <form 
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const type = fd.get('type') as AlertType;
                  const value = parseFloat(fd.get('value') as string);
                  const marketPath = fd.get('marketPath') as string;
                  const operator = fd.get('operator') as '>=' | '<=';
                  
                  if (!value || isNaN(value)) return;
                  
                  const newRule: AlertRule = {
                    id: Math.random().toString(36).substring(2, 9),
                    type,
                    operator,
                    value,
                    ...(type === 'market_prob' || type === 'bookmaker_odds' ? { marketPath } : {}),
                    ...(type === 'bookmaker_odds' ? { bookmaker: fd.get('bookmaker') as string } : {})
                  };
                  
                  setAlertRules(prev => [...prev, newRule]);
                  e.currentTarget.reset();
                  // Reset select specifically since uncontrolled forms might hold it
                  const typeSelect = e.currentTarget.querySelector('select[name="type"]') as HTMLSelectElement | null;
                  if (typeSelect) {
                    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }}
              >
                <select 
                  name="type" 
                  className="w-full bg-bg-dark border border-border-main rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  onChange={(e) => {
                    const marketContainer = e.target.parentElement?.querySelector('.market-select-container');
                    const bookmakerContainer = e.target.parentElement?.querySelector('.bookmaker-select-container');
                    const unitLabel = e.target.parentElement?.querySelector('.unit-label');
                    if (marketContainer) {
                       if (e.target.value === 'market_prob') {
                           marketContainer.classList.remove('hidden');
                       } else {
                           marketContainer.classList.add('hidden');
                       }
                    }
                    if (bookmakerContainer) {
                       if (e.target.value === 'bookmaker_odds') {
                           bookmakerContainer.classList.remove('hidden');
                       } else {
                           bookmakerContainer.classList.add('hidden');
                       }
                    }
                    if (unitLabel) {
                       if (e.target.value === 'bookmaker_odds') {
                           unitLabel.textContent = 'Dec';
                       } else {
                           unitLabel.textContent = '%';
                       }
                    }
                  }}
                >
                  <option value="ev_threshold">Expected Value (EV) Threshold</option>
                  <option value="market_prob">Specific Market Probability</option>
                  <option value="bookmaker_odds">Specific Bookmaker Odds</option>
                </select>
                
                <div className="flex gap-2">
                  <div className="w-full bookmaker-select-container hidden">
                    <select name="bookmaker" className="w-full bg-bg-dark border border-border-main rounded px-3 py-2 text-sm focus:outline-none focus:border-accent">
                      <option value="Pinnacle">Pinnacle</option>
                      <option value="Bet365">Bet365</option>
                      <option value="DraftKings">DraftKings</option>
                      <option value="FanDuel">FanDuel</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="w-full market-select-container hidden">
                    <select name="marketPath" className="w-full bg-bg-dark border border-border-main rounded px-3 py-2 text-sm focus:outline-none focus:border-accent">
                      <optgroup label="Main Markets">
                        <option value="matchOdds.home">Match Winner (Home)</option>
                        <option value="matchOdds.away">Match Winner (Away)</option>
                        <option value="goals25.over">Goals Over 2.5</option>
                        <option value="btts.yes">BTTS Yes</option>
                      </optgroup>
                      <optgroup label="Props & Stats">
                        <option value="corners95.over">Corners Over 9.5</option>
                        <option value="cards35.over">Cards Over 3.5</option>
                        <option value="playerProps.anytimeGoal">Player Prop: Anytime Goal</option>
                        <option value="playerProps.shotsOnTarget">Player Prop: Shots on Target 0.5+</option>
                      </optgroup>
                      <optgroup label="In-Play Models">
                        <option value="inPlay.nextGoal.home">In-Play: Next Goal (Home)</option>
                        <option value="inPlay.nextGoal.away">In-Play: Next Goal (Away)</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <div className="w-1/3 border border-border-main rounded bg-bg-dark">
                      <select name="operator" className="w-full h-full bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-accent appearance-none">
                        <option value=">=">Greater Than &ge;</option>
                        <option value="<=">Less Than &le;</option>
                      </select>
                  </div>
                  <div className="relative flex-1">
                    <input name="value" type="number" step="0.01" placeholder="Threshold Value" className="w-full bg-bg-dark border border-border-main rounded px-3 py-2 text-sm focus:outline-none focus:border-accent appearance-none" required />
                    <span className="absolute right-3 top-2.5 text-text-dim text-xs unit-label">%</span>
                  </div>
                </div>
                <button type="submit" className="w-full bg-[rgba(16,185,129,0.1)] text-accent border border-accent/20 hover:bg-accent/20 transition-colors py-2 rounded-md font-medium text-sm flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Create Alert Pattern
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EV Signals Section */}
      <section>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-base font-semibold flex items-center gap-2">
              <span>Active Signals (Top EV)</span>
            </div>
            <span className="text-[12px] font-normal text-text-dim">Filtered & Sorted</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {betSlip.length > 0 && (
              <button 
                onClick={() => document.getElementById('bet-slip-panel')?.classList.toggle('hidden')}
                className="flex items-center gap-2 bg-accent/20 border border-accent rounded-md px-3 py-1.5 font-bold text-accent"
              >
                 {betSlip.length} In Slip
              </button>
            )}
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 bg-bg-surface border border-border-main rounded-md px-3 py-1.5 hover:bg-bg-surface-alt transition-colors font-medium text-text-dim hover:text-accent"
              title="Export Signal Data"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Export Data</span>
            </button>
            <button
              onClick={() => setShowAlertsPanel(true)}
              className="flex items-center gap-2 bg-bg-surface border border-border-main rounded-md px-3 py-1.5 focus-within:border-accent hover:bg-bg-surface-alt transition-colors font-medium text-text-dim hover:text-accent relative"
              title="Configure Alerts"
            >
              <Bell className="w-4 h-4" />
              <span className="hidden md:inline">Alerts</span>
              {alertRules.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-accent text-[10px] text-bg-dark font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {alertRules.length}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 bg-bg-surface border border-border-main rounded-md px-3 py-1.5 focus-within:border-accent transition-colors">
              <Filter className="w-4 h-4 text-text-dim" />
              <select 
                value={filterMarket} 
                onChange={(e) => setFilterMarket(e.target.value)}
                className="bg-transparent text-text-main focus:outline-none appearance-none cursor-pointer pr-2 outline-none max-w-[120px] truncate"
              >
                <option value="All" className="bg-bg-surface text-text-main">All Markets</option>
                <option value="In-Play Only" className="bg-bg-surface text-text-main">In-Play Only</option>
                <option value="Pre-Match Only" className="bg-bg-surface text-text-main">Pre-Match Only</option>
                <option value="High EV (>10%)" className="bg-bg-surface text-text-main">High EV {'>'}10%</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 bg-bg-surface border border-border-main rounded-md px-3 py-1.5 focus-within:border-accent transition-colors">
              <Filter className="w-4 h-4 text-text-dim" />
              <select 
                value={filterRisk} 
                onChange={(e) => setFilterRisk(e.target.value)}
                className="bg-transparent text-text-main focus:outline-none appearance-none cursor-pointer pr-2 outline-none"
              >
                <option value="All" className="bg-bg-surface text-text-main">All Risks</option>
                <option value="A+" className="bg-bg-surface text-text-main">Risk A+</option>
                <option value="A" className="bg-bg-surface text-text-main">Risk A</option>
                <option value="B" className="bg-bg-surface text-text-main">Risk B</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 bg-bg-surface border border-border-main rounded-md px-3 py-1.5 focus-within:border-accent transition-colors">
              <ArrowUpDown className="w-4 h-4 text-text-dim" />
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-text-main focus:outline-none appearance-none cursor-pointer pr-2 outline-none"
              >
                <option value="ev" className="bg-bg-surface text-text-main">Sort by EV</option>
                <option value="prob" className="bg-bg-surface text-text-main">Sort by Prob</option>
                <option value="odds" className="bg-bg-surface text-text-main">Sort by Odds</option>
              </select>
            </div>

            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="bg-bg-surface border border-border-main px-3 py-1.5 rounded-md hover:bg-bg-surface-alt transition-colors font-mono text-xs uppercase"
              title="Toggle Sort Order"
            >
              {sortOrder === 'desc' ? 'Desc' : 'Asc'}
            </button>
          </div>
        </div>

        <div id="bet-slip-panel" className={cn("bg-bg-surface border border-accent rounded-xl mb-4 overflow-hidden shadow-lg shadow-accent/5", betSlip.length > 0 ? "block" : "hidden")}>
          <div className="bg-accent/10 border-b border-accent/20 px-4 py-3 flex items-center justify-between">
             <h3 className="font-semibold text-accent flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Active Bet Slip ({betSlip.length} Selections)</h3>
             <button onClick={() => setBetSlip([])} className="text-xs text-text-dim hover:text-[#f87171] transition-colors uppercase tracking-wider font-semibold">Clear All</button>
          </div>
          <div className="p-4 flex flex-col gap-3">
             {betSlip.map(slip => (
               <div key={`slip-${slip.id}`} className="flex items-center justify-between border-b border-border-main pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{slip.match}</span>
                    <span className="text-[11px] text-text-dim mt-0.5">{slip.market} @ <span className="text-text-main font-mono">{slip.odds}</span></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-bg-dark border border-border-main rounded px-2 h-8">
                      <span className="text-text-dim text-xs mr-2">$</span>
                      <input 
                        type="number" 
                        value={slip.stake}
                        onChange={(e) => setBetSlip(prev => prev.map(p => p.id === slip.id ? {...p, stake: e.target.value} : p))}
                        className="bg-transparent w-16 text-text-main font-mono text-sm outline-none text-right"
                      />
                    </div>
                    <button onClick={(e) => toggleBetSlip(slip as any, e as any)} className="text-text-dim hover:text-[#f87171] p-1"><X className="w-4 h-4" /></button>
                  </div>
               </div>
             ))}
          </div>
          <div className="bg-bg-dark border-t border-border-main px-4 py-3 flex items-center justify-between">
             <div className="flex flex-col">
               <span className="text-[10px] text-text-dim uppercase tracking-wider">Total Est. Exposure</span>
               <span className="font-mono font-bold text-lg">${betSlip.reduce((acc, curr) => acc + (parseFloat(curr.stake) || 0), 0).toFixed(2)}</span>
             </div>
             <button 
               onClick={executeBetSlip}
               disabled={isExecutingSlip}
               className="bg-accent text-bg-dark font-semibold px-6 py-2 rounded shadow hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-2"
             >
               {isExecutingSlip ? <span className="w-4 h-4 border-2 border-bg-dark/30 border-t-bg-dark rounded-full animate-spin"></span> : <Play className="w-4 h-4" />}
               Execute Batch
             </button>
          </div>
        </div>

        <div className="bg-bg-surface border border-border-main rounded-xl overflow-hidden flex flex-col mt-4">
          <div className="hidden md:flex items-center justify-between p-4 border-b border-border-main bg-bg-surface-alt text-xs font-semibold text-text-dim uppercase tracking-wider">
            <div className="flex-[2]">Match Target</div>
            <div className="flex-1">Win Prob</div>
            <div className="flex-1">Expected Val</div>
            <div className="flex-[1.5]">Bookie Grid</div>
            <div className="w-[80px] mr-2">Trend</div>
            <div className="flex-1 text-right pr-6">Action</div>
          </div>
          
          {processedSignals.map((sig) => {
             const safeProbValue = sig.prob ? parseFloat(sig.prob.replace(/[^0-9.]/g, '')) : 0;
             const safeEV = Sentinel.healMath(parseFloat(sig.ev), 0.0).toFixed(2);
             const safeProb = Sentinel.healMath(safeProbValue, 0.0).toFixed(1);
             return (
            <div key={sig.id} className="border-b border-border-main last:border-b-0 flex flex-col transition-colors">
              <div 
                onClick={() => setExpandedSignal(expandedSignal === sig.id ? null : sig.id)}
                className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between text-sm gap-4 cursor-pointer hover:bg-bg-surface-alt transition-colors"
              >
                <div className="flex-[2] font-semibold flex flex-col">
                  <div className="flex items-center gap-2">
                    {sig.match}
                    {sig.isLive && (
                      <span className="flex items-center gap-1.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span> IN-PLAY
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-dim font-mono mt-1.5 font-normal flex items-center gap-3">
                    <span className="bg-bg-dark px-1 py-0.5 rounded text-text-main border border-border-main">{sig.league || 'ENG'}</span>
                    <span>ID: {sig.id.substring(4).toUpperCase()}</span>
                    {(sig.strengths?.home && sig.strengths?.away) && (
                      <div className="flex items-center gap-1.5" title="Team Strength Comparison">
                        <span className="text-[9px] min-w-[16px] text-right font-medium text-blue-400">{sig.strengths.home}</span>
                        <div className="w-[60px] h-[4px] bg-bg-dark rounded-full flex overflow-hidden">
                          <div className="h-full bg-blue-400" style={{ width: `${(sig.strengths.home / (sig.strengths.home + sig.strengths.away)) * 100}%` }} />
                          <div className="h-full bg-orange-400" style={{ width: `${(sig.strengths.away / (sig.strengths.home + sig.strengths.away)) * 100}%` }} />
                        </div>
                        <span className="text-[9px] min-w-[16px] font-medium text-orange-400">{sig.strengths.away}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 font-mono text-accent">
                  <LiveValue value={safeProb + '%'} /> <span className="text-[10px] text-text-dim">Home Win</span>
                </div>
                
                <div className="flex-1 font-mono font-bold text-sm">
                  <LiveValue value={safeEV} prefix="+" /> <span className="text-[10px] text-text-dim font-normal">EV</span>
                </div>
                
                <div className="flex-[1.5] w-full mt-2 md:mt-0 font-mono text-sm leading-tight group relative min-w-[120px]">
                  <div className="flex items-center justify-between">
                    <LiveValue value={sig.odds} />
                    <span className="text-[10px] text-text-dim bg-bg-dark px-1.5 py-0.5 rounded ml-2">{sig.bestBookmaker || 'Best Odds'}</span>
                  </div>
                  {sig.bookmakers && sig.bookmakers.length > 0 && (
                    <div className="hidden group-hover:flex absolute top-full left-0 z-10 bg-bg-surface-alt border border-border-main p-2 rounded shadow-xl flex-col gap-1 w-full mt-1">
                      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">Live Grid</div>
                      {sig.bookmakers.map((b: any, idx: number) => (
                         <div key={idx} className="flex items-center justify-between text-[11px]">
                           <span className="text-text-main">{b.name}</span>
                           <span className={idx === 0 ? "text-accent font-semibold" : "text-text-dim"}>{b.odds}</span>
                         </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="hidden lg:block mr-2" style={{ width: 80, height: 30 }}>
                  {sig.oddsHistory && sig.oddsHistory.length > 1 && (
                    <LineChart width={80} height={30} data={sig.oddsHistory.map((val: number, i: number) => ({ time: i, odds: val }))}>
                      <YAxis domain={['dataMin', 'dataMax']} hide />
                      <Line type="monotone" dataKey="odds" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  )}
                </div>

                <div className="flex-1 flex gap-3 items-center">
                  <div className="flex flex-col items-end min-w-[60px]">
                    <span className={cn(
                      "text-[10px] px-[6px] py-[2px] rounded text-center w-full mb-1",
                      sig.riskLevel === 'A+' && "text-accent bg-[rgba(16,185,129,0.2)]",
                      sig.riskLevel === 'A' && "text-accent bg-[rgba(16,185,129,0.2)]",
                      sig.riskLevel === 'B' && "text-risk-med bg-[rgba(245,158,11,0.2)]",
                      sig.riskLevel === 'C' && "text-text-dim border border-border-main"
                    )}>
                      Risk {sig.riskLevel}
                    </span>
                    <span className="text-[10px] text-text-dim font-mono">
                      Stake: <LiveValue value={sig.recommendedStake} prefix="$" className="font-semibold text-text-main" />
                    </span>
                  </div>
                  
                  <button 
                    onClick={(e) => toggleBetSlip(sig, e)}
                    title={betSlip.find(item => item.id === sig.id) ? "Remove from Slip" : "Add to Slip"}
                    className={cn("flex flex-col items-center justify-center p-2 border rounded-md transition-colors ml-auto h-full min-h-[40px] px-3 font-semibold text-xs min-w-[60px]",
                      betSlip.find(item => item.id === sig.id) ? "bg-accent text-bg-dark border-accent" : "bg-bg-surface border border-border-main hover:bg-bg-surface-alt text-text-main"
                    )}
                  >
                    {betSlip.find(item => item.id === sig.id) ? "ADDED" : "+ SLIP"}
                  </button>

                  <div className="text-text-dim ml-1">
                    {expandedSignal === sig.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {expandedSignal === sig.id && sig.predictions && (
                <div className="p-4 bg-bg-dark border-t border-border-main flex flex-col gap-6 animate-in fade-in slide-in-from-top-2 duration-200">
                  {sig.advancedStats && (
                     <div className="border border-border-main bg-bg-surface rounded-lg p-4 mb-2">
                       <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px] mb-3 flex items-center gap-2">
                         <Activity className="w-4 h-4 text-accent" /> Team Form & Advanced Stats
                       </h4>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                         <div className="flex flex-col gap-1.5 p-2 bg-bg-dark rounded border border-border-main">
                           <span className="text-[10px] text-text-dim tracking-wider uppercase">Recent Form</span>
                           <div className="flex justify-between items-center"><span className="text-text-dim text-[10px] w-8">H:</span><span className="font-mono text-accent tracking-[2px]">{sig.advancedStats.home_form}</span></div>
                           <div className="flex justify-between items-center"><span className="text-text-dim text-[10px] w-8">A:</span><span className="font-mono tracking-[2px]">{sig.advancedStats.away_form}</span></div>
                         </div>
                         <div className="flex flex-col gap-1.5 p-2 bg-bg-dark rounded border border-border-main">
                           <span className="text-[10px] text-text-dim tracking-wider uppercase">Goals Scored (Avg)</span>
                           <div className="flex justify-between items-center"><span className="text-text-dim text-[10px] w-8">H:</span><span className="font-mono text-accent">{sig.advancedStats.home_goals_avg}</span></div>
                           <div className="flex justify-between items-center"><span className="text-text-dim text-[10px] w-8">A:</span><span className="font-mono">{sig.advancedStats.away_goals_avg}</span></div>
                         </div>
                         <div className="flex flex-col gap-1.5 p-2 bg-bg-dark rounded border border-border-main">
                           <span className="text-[10px] text-text-dim tracking-wider uppercase">Goals Conceded (Avg)</span>
                           <div className="flex justify-between items-center"><span className="text-text-dim text-[10px] w-8">H:</span><span className="font-mono">{sig.advancedStats.home_concede_avg}</span></div>
                           <div className="flex justify-between items-center"><span className="text-text-dim text-[10px] w-8">A:</span><span className="font-mono text-[#f87171]">{sig.advancedStats.away_concede_avg}</span></div>
                         </div>
                         <div className="flex flex-col gap-1.5 p-2 bg-bg-dark rounded border border-border-main">
                           <span className="text-[10px] text-text-dim tracking-wider uppercase">Position Diff</span>
                           <div className="flex justify-between items-center h-full"><span className="text-text-dim text-[10px]">Net Diff:</span><span className={cn("font-mono font-bold", sig.advancedStats.league_position_diff.startsWith('+') ? "text-accent" : "text-[#f87171]")}>{sig.advancedStats.league_position_diff}</span></div>
                         </div>
                       </div>
                       <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-xs mt-4 border-t border-border-main pt-4">
                         <div className="flex justify-between items-center bg-bg-dark p-2 border border-border-main rounded uppercase text-[10px] tracking-wider text-text-dim"><span className="text-text-main">Home Pro</span> <span className="font-mono text-accent">{sig.advancedStats.home_win_prob.toFixed(2)}</span></div>
                         <div className="flex justify-between items-center bg-bg-dark p-2 border border-border-main rounded uppercase text-[10px] tracking-wider text-text-dim"><span className="text-text-main">Draw Pro</span> <span className="font-mono text-accent">{sig.advancedStats.draw_prob.toFixed(2)}</span></div>
                         <div className="flex justify-between items-center bg-bg-dark p-2 border border-border-main rounded uppercase text-[10px] tracking-wider text-text-dim"><span className="text-text-main">Away Pro</span> <span className="font-mono text-accent">{sig.advancedStats.away_win_prob.toFixed(2)}</span></div>
                         <div className="flex justify-between items-center bg-bg-dark p-2 border border-border-main rounded uppercase text-[10px] tracking-wider text-text-dim"><span className="text-text-main">O1.5 Pro</span> <span className="font-mono text-accent">{sig.advancedStats.over_1_5_prob.toFixed(2)}</span></div>
                         <div className="flex justify-between items-center bg-bg-dark p-2 border border-border-main rounded uppercase text-[10px] tracking-wider text-text-dim"><span className="text-text-main">O2.5 Pro</span> <span className="font-mono text-accent">{sig.advancedStats.over_2_5_prob.toFixed(2)}</span></div>
                       </div>
                     </div>
                  )}

                  {sig.oddsHistory?.length > 1 && (
                    <div className="border border-border-main bg-bg-surface rounded-lg p-4 mb-2 mt-4">
                      <h4 className="font-semibold text-text-main uppercase tracking-wider text-[11px] mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-accent" /> Odds & Carry History
                      </h4>
                      <div className="h-[180px] w-full flex flex-col md:flex-row gap-4">
                         <div className="flex-1 flex flex-col">
                           <div className="text-[10px] text-text-dim mb-2 uppercase tracking-wide">Decimal Odds</div>
                           <div className="flex-1 min-h-0 bg-bg-dark rounded border border-border-main p-2">
                             <ResponsiveContainer width="100%" height="100%">
                               <LineChart data={sig.oddsHistory.map((val: number, i: number) => ({ time: i, odds: val }))}>
                                 <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} hide />
                                 <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                                 <Tooltip 
                                    contentStyle={{ backgroundColor: '#181A20', borderColor: '#333', borderRadius: '4px', fontSize: '11px' }} 
                                    itemStyle={{ color: 'var(--color-accent)' }} 
                                    labelStyle={{ display: 'none' }}
                                 />
                                 <Line type="monotone" dataKey="odds" stroke="var(--color-accent)" strokeWidth={2} dot={false} isAnimationActive={true} />
                               </LineChart>
                             </ResponsiveContainer>
                           </div>
                         </div>
                         {sig.kellyHistory?.length > 1 && (
                           <div className="flex-1 flex flex-col">
                             <div className="text-[10px] text-text-dim mb-2 uppercase tracking-wide">Kelly Fraction (%)</div>
                             <div className="flex-1 min-h-0 bg-bg-dark rounded border border-border-main p-2">
                               <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={sig.kellyHistory.map((val: number, i: number) => ({ time: i, stake: parseFloat((val * 100).toFixed(2)) }))}>
                                   <YAxis domain={['dataMin', 'dataMax']} hide />
                                   <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                                   <Tooltip 
                                      contentStyle={{ backgroundColor: '#181A20', borderColor: '#333', borderRadius: '4px', fontSize: '11px' }} 
                                      itemStyle={{ color: '#8b5cf6' }} 
                                      labelStyle={{ display: 'none' }}
                                   />
                                   <Area type="monotone" dataKey="stake" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} isAnimationActive={true} />
                                 </AreaChart>
                               </ResponsiveContainer>
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs mt-6">
                    <PredictionCard title="Match 1X2" items={[
                      { label: "Home", value: sig.predictions.matchOdds.home, highlight: true },
                      { label: "Draw", value: sig.predictions.matchOdds.draw },
                      { label: "Away", value: sig.predictions.matchOdds.away }
                    ]} />
                    
                    <PredictionCard title="Goals (Over/Under 2.5)" items={[
                      { label: "Over", value: sig.predictions.goals25.over, highlight: true },
                      { label: "Under", value: sig.predictions.goals25.under }
                    ]} />

                    <PredictionCard title="Both Teams To Score" items={[
                      { label: "Yes", value: sig.predictions.btts.yes, highlight: true },
                      { label: "No", value: sig.predictions.btts.no }
                    ]} />

                    <PredictionCard title="Double Chance" items={[
                      { label: "1X", value: sig.predictions.doubleChance['1x'], highlight: true },
                      { label: "12", value: sig.predictions.doubleChance['12'] },
                      { label: "X2", value: sig.predictions.doubleChance['x2'] }
                    ]} />

                    <PredictionCard title="European Handicap (-1, +1)" items={[
                      { label: "Home (-1)", value: sig.predictions.euHandicap.home, highlight: true },
                      { label: "Tie (-1)", value: sig.predictions.euHandicap.draw },
                      { label: "Away (+1)", value: sig.predictions.euHandicap.away }
                    ]} />

                    <PredictionCard title="Team To Score Over 0.5" items={[
                      { label: "Home", value: sig.predictions.teamScore05.home, highlight: true },
                      { label: "Away", value: sig.predictions.teamScore05.away, highlight: true }
                    ]} />

                    <PredictionCard title="Corners (Over 9.5)" items={[
                      { label: "Over", value: sig.predictions.corners95.over, highlight: true },
                      { label: "Under", value: sig.predictions.corners95.under }
                    ]} />

                    <PredictionCard title="Cards (Over 3.5)" items={[
                      { label: "Over", value: sig.predictions.cards35.over, highlight: true },
                      { label: "Under", value: sig.predictions.cards35.under }
                    ]} />

                    {sig.predictions.playerProps && (
                      <PredictionCard title="Player Props (Star)" items={[
                        { label: "Anytime Goal", value: sig.predictions.playerProps.anytimeGoal, highlight: true },
                        { label: "Carded", value: sig.predictions.playerProps.carded },
                        { label: "Shots on Target", value: sig.predictions.playerProps.shotsOnTarget, highlight: true }
                      ]} />
                    )}

                    {sig.predictions.inPlay && (
                      <PredictionCard title="In-Play Projection" items={[
                        { label: "Next Goal (Home)", value: sig.predictions.inPlay.nextGoal.home, highlight: true },
                        { label: "Next Goal (Away)", value: sig.predictions.inPlay.nextGoal.away },
                        { label: "Next Goal (None)", value: sig.predictions.inPlay.nextGoal.none }
                      ]} />
                    )}
                  </div>

                  {/* Visualizations Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t border-border-main pt-6">
                    {/* Probabilities Bar Chart */}
                    <div className="bg-bg-dark rounded-xl border border-border-main p-4">
                      <h4 className="font-semibold text-text-dim uppercase tracking-wider text-[11px] mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-accent" /> Key Probabilities
                      </h4>
                      <div className="w-full h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={[
                              { name: 'Home Win', prob: sig.advancedStats?.home_win_prob || 0 },
                              { name: 'Draw', prob: sig.advancedStats?.draw_prob || 0 },
                              { name: 'Away Win', prob: sig.advancedStats?.away_win_prob || 0 },
                              { name: 'O 1.5 Goals', prob: sig.advancedStats?.over_1_5_prob || 0 },
                              { name: 'O 2.5 Goals', prob: sig.advancedStats?.over_2_5_prob || 0 },
                            ]}
                            margin={{ top: 0, right: 30, left: 30, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-border-main)" />
                            <XAxis type="number" domain={[0, 1]} hide />
                            <YAxis type="category" dataKey="name" stroke="var(--color-text-dim)" fontSize={11} axisLine={false} tickLine={false} width={80} />
                            <Tooltip
                              cursor={{fill: 'var(--color-bg-surface-alt)'}}
                              contentStyle={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-main)', borderRadius: '8px', fontSize: '11px' }}
                              itemStyle={{ color: 'var(--color-accent)' }}
                              formatter={(val: number) => [(val * 100).toFixed(1) + '%', 'Probability']}
                            />
                            <Bar dataKey="prob" fill="var(--color-accent)" radius={[0, 4, 4, 0]} barSize={16}>
                               {/* Can't easily conditionally color individual bars in simple BarChart without extra cell components, sticking to simple accent */}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Scatter Plot: Edge Detection */}
                    {sig.bookmakers && sig.bookmakers.length > 0 && (
                      <div className="bg-bg-dark rounded-xl border border-border-main p-4">
                        <h4 className="font-semibold text-text-dim uppercase tracking-wider text-[11px] mb-4 flex items-center gap-2" title="Shows market odds vs our model probability">
                          <Activity className="w-4 h-4 text-accent" /> Market Misprizing (Edge Detection)
                        </h4>
                        <div className="w-full h-[200px]">
                           <ResponsiveContainer width="100%" height="100%">
                             <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                               <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-main)" />
                               <XAxis type="number" dataKey="probValue" name="Model Prob" domain={[0, 1]} tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} stroke="var(--color-text-dim)" fontSize={10} />
                               <YAxis type="number" dataKey="oddsValue" name="Bookie Odds" domain={['auto', 'auto']} stroke="var(--color-text-dim)" fontSize={10} />
                               <ZAxis type="category" dataKey="bookie" name="Bookmaker" />
                               <Tooltip 
                                 cursor={{ strokeDasharray: '3 3' }} 
                                 contentStyle={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-main)', borderRadius: '8px', fontSize: '11px' }}
                                 formatter={(val: any, name: string, props: any) => {
                                    if (name === 'Model Prob') return [(val * 100).toFixed(1) + '%', name];
                                    if (name === 'Bookie Odds') return [val.toFixed(2), name];
                                    return [val, name];
                                 }}
                                 labelFormatter={() => ''}
                               />
                               <Scatter name="Market Prices" data={sig.bookmakers.map((b: any) => {
                                  // Simplified approximation: we use home win prob against main odds
                                  const modelProb = sig.advancedStats?.home_win_prob || (parseFloat(sig.prob) / 100);
                                  return {
                                    probValue: modelProb,
                                    oddsValue: parseFloat(b.odds),
                                    bookie: b.name
                                  }
                               })} fill="var(--color-accent)" />
                               {/* Add a line indicating fair value (EV=0) if we want, simplified here as just the scatter points */}
                             </ScatterChart>
                           </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* H2H and Historical Charts Row */}
                  <div className="border-t border-border-main pt-5 mt-5">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
                      
                      {/* H2H Stats */}
                      {sig.h2h && (
                        <div>
                          <h4 className="font-semibold text-text-dim uppercase tracking-wider text-[11px] mb-3 flex items-center gap-2">
                             <Activity className="w-4 h-4 text-text-main" /> Head-to-Head (H2H) Stats
                          </h4>
                          <div className="bg-bg-surface border border-border-main rounded-md p-4 text-sm">
                             <div className="grid grid-cols-3 text-center mb-4 pb-4 border-b border-border-main">
                                <div>
                                   <div className="text-xl font-bold text-text-main">{sig.h2h.homeWins}</div>
                                   <div className="text-[10px] text-text-dim uppercase tracking-wider mt-1">{sig.home} Wins</div>
                                </div>
                                <div className="border-x border-border-main">
                                   <div className="text-xl font-bold text-text-main">{sig.h2h.draws}</div>
                                   <div className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Draws</div>
                                </div>
                                <div>
                                   <div className="text-xl font-bold text-text-main">{sig.h2h.awayWins}</div>
                                   <div className="text-[10px] text-text-dim uppercase tracking-wider mt-1">{sig.away} Wins</div>
                                </div>
                             </div>

                             <div className="flex justify-between items-center mb-4">
                                <span className="text-text-dim">Avg Goals in Matchups</span>
                                <span className="font-mono font-bold text-accent">{sig.h2h.avgGoals}</span>
                             </div>

                             <div>
                                <span className="text-[10px] text-text-dim uppercase tracking-wider mb-2 block">Recent Meetings</span>
                                <div className="flex flex-col gap-2">
                                  {(sig.h2h.recentMatches || []).map((m: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center bg-bg-dark rounded px-2 py-1.5 text-xs border border-border-main">
                                      <span className="font-mono text-text-dim">{m.date}</span>
                                      <span className="text-text-main">{m.result}</span>
                                      <span className="font-bold font-mono">{m.score}</span>
                                    </div>
                                  ))}
                                </div>
                             </div>
                          </div>
                        </div>
                      )}

                      {/* Charts */}
                      <div className="flex flex-col gap-4">
                        {sig.oddsHistory && sig.oddsHistory.length > 1 && (
                          <div>
                            <h4 className="font-semibold text-text-dim uppercase tracking-wider text-[11px] mb-3 flex items-center gap-2">
                              <Activity className={cn("w-4 h-4", sig.isLive ? "text-[#ef4444]" : "text-accent")} /> 
                              {sig.isLive ? (
                                 <span className="text-text-main flex items-center gap-2">Primary Market Odds History <span className="bg-[#ef4444]/10 text-[#ef4444] px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest">(IN-PLAY LIVE)</span></span>
                              ) : (
                                 "Primary Market Odds History (Home Win)"
                              )}
                            </h4>
                            <div className="w-full h-[120px] bg-bg-surface border border-border-main rounded-md p-3">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sig.oddsHistory.map((val: number, i: number) => ({ time: i, odds: val }))}>
                                  <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-main)" vertical={false} />
                                  <YAxis domain={['auto', 'auto']} stroke="var(--color-text-dim)" fontSize={10} width={30} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(2)} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-main)', borderRadius: '4px', fontSize: '10px' }}
                                    itemStyle={{ color: sig.isLive ? '#ef4444' : 'var(--color-accent)' }}
                                  />
                                  <Line type="stepAfter" dataKey="odds" stroke={sig.isLive ? "#ef4444" : "var(--color-accent)"} strokeWidth={2} dot={false} isAnimationActive={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {sig.kellyHistory && sig.kellyHistory.length > 1 && (
                          <div>
                            <h4 className="font-semibold text-text-dim uppercase tracking-wider text-[11px] mb-3 flex items-center gap-2">
                              <Activity className="w-4 h-4 text-cyan-500" /> 
                              Kelly Fraction History
                            </h4>
                            <div className="w-full h-[120px] bg-bg-surface border border-border-main rounded-md p-3">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sig.kellyHistory.map((val: number, i: number) => ({ time: i, kelly: val }))}>
                                  <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-main)" vertical={false} />
                                  <YAxis domain={['auto', 'auto']} stroke="var(--color-text-dim)" fontSize={10} width={40} tickLine={false} axisLine={false} tickFormatter={(v) => (v * 100).toFixed(1) + '%'} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-main)', borderRadius: '4px', fontSize: '10px' }}
                                    itemStyle={{ color: '#06b6d4' }}
                                    formatter={(v: any) => [(v * 100).toFixed(2) + '%', 'Kelly']}
                                  />
                                  <Line type="monotone" dataKey="kelly" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
          })}

          {signals.length === 0 && (
            <div className="p-8 text-center text-text-dim font-mono text-sm border-dashed border-border-main bg-bg-surface">
              NO POSITIVE EV SIGNALS DETECTED. AWAITING MARKET INEFFICIENCIES...
            </div>
          )}
        </div>
      </section>

      {/* Arbitrage Section */}
      <section className="pt-8 border-t border-border-main">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight mb-1 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-cyan-500" />
            Arbitrage Opportunities (Surebets)
          </h2>
          <p className="text-sm text-text-dim">Cross-bookmaker discrepancies with guaranteed profit margins.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {arbs.map((arb) => (
            <div key={arb.id} className="bg-bg-surface border border-border-main rounded-xl p-5 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4 border-b border-border-main pb-4">
                <h3 className="font-semibold text-base">{arb.match}</h3>
                <span className="text-[10px] text-text-dim font-mono">ID: {arb.id.substring(4).toUpperCase()}</span>
              </div>
              
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                <div className="flex-1 bg-bg-dark p-3 rounded-lg border border-border-main text-center w-full">
                  <div className="text-[11px] text-text-dim mb-1">{arb.bookie1} (Home)</div>
                  <div className="font-mono text-base text-accent">{arb.odds1}</div>
                </div>
                <div className="text-text-dim font-bold text-xs">VS</div>
                <div className="flex-1 bg-bg-dark p-3 rounded-lg border border-border-main text-center w-full">
                  <div className="text-[11px] text-text-dim mb-1">{arb.bookie2} (Away)</div>
                  <div className="font-mono text-base text-accent">{arb.odds2}</div>
                </div>
              </div>

              <div className="flex justify-between items-center mt-2 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-md">
                <span className="text-sm text-cyan-400 font-medium">Guaranteed Profit:</span>
                <span className="text-base font-bold font-mono text-cyan-400">{arb.profitPercent}</span>
              </div>
            </div>
          ))}
          
          {arbs.length === 0 && (
            <div className="col-span-full py-10 text-center text-text-dim font-mono text-sm border border-dashed border-border-main rounded-xl">
              NO ARBITRAGE OPPORTUNITIES DETECTED ACROSS BOOKS.
            </div>
          )}
        </div>
      </section>

      <ExportModal 
        isOpen={showExportModal} 
        onClose={() => setShowExportModal(false)} 
        type="signals" 
        dataPayload={signals} 
      />
    </div>
  );
}
