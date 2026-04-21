import { useEffect, useState } from 'react';
import { Trophy, Clock, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Scoreboard() {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScores = async () => {
    try {
      const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
      const data = await res.json();
      if (data.events) {
        setGames(data.events);
      }
    } catch (err) {
      console.error('Failed to fetch NBA scores', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 15000); // Live poll every 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-text-dim animate-pulse">Loading NBA Scoreboard...</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-[calc(100vw-288px)]">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">NBA Scoreboard</h1>
          <p className="text-sm text-text-dim">Real-time basketball scores and active match states</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {games.map(game => {
          const status = game.status.type;
          const isLive = status.state === 'in';
          const isFinished = status.state === 'post';
          
          const comp = game.competitions[0];
          const home = comp.competitors.find((c: any) => c.homeAway === 'home');
          const away = comp.competitors.find((c: any) => c.homeAway === 'away');

          return (
            <div key={game.id} className="bg-bg-surface border border-border-main rounded-xl overflow-hidden hover:border-accent transition-colors flex flex-col">
              <div className={cn(
                "px-4 py-2 text-xs font-semibold uppercase tracking-wider flex justify-between items-center border-b border-border-main",
                isLive ? "bg-accent/10 text-accent" : "bg-bg-surface-alt text-text-dim"
              )}>
                <div className="flex items-center gap-1.5">
                  {isLive ? <Clock className="w-3 h-3 animate-pulse" /> : <Calendar className="w-3 h-3" />}
                  <span>{status.detail}</span>
                </div>
                {game.series?.summary && (
                  <span className="text-[10px] text-text-dim hidden sm:block">{game.series.summary}</span>
                )}
              </div>
              
              <div className="p-5 flex flex-col gap-4">
                {/* Away Team */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {away.team.logo && <img src={away.team.logo} className="w-8 h-8 object-contain" alt={away.team.name} referrerPolicy="no-referrer" />}
                    <div>
                      <div className="font-bold text-lg">{away.team.displayName}</div>
                      <div className="text-[11px] text-text-dim font-mono">{away.records?.[0]?.summary}</div>
                    </div>
                  </div>
                  <div className={cn("text-2xl font-mono font-bold", isFinished && away.winner ? "text-text-main" : isFinished && !away.winner ? "text-text-dim" : "text-text-main")}>
                    {away.score}
                  </div>
                </div>

                {/* Home Team */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {home.team.logo && <img src={home.team.logo} className="w-8 h-8 object-contain" alt={home.team.name} referrerPolicy="no-referrer" />}
                    <div>
                      <div className="font-bold text-lg flex items-center gap-2">
                        {home.team.displayName}
                      </div>
                      <div className="text-[11px] text-text-dim font-mono">{home.records?.[0]?.summary}</div>
                    </div>
                  </div>
                  <div className={cn("text-2xl font-mono font-bold", isFinished && home.winner ? "text-text-main" : isFinished && !home.winner ? "text-text-dim" : "text-text-main")}>
                    {home.score}
                  </div>
                </div>
              </div>
              
              {/* Leaders Section if available */}
              {comp.leaders && comp.leaders.length > 0 && (
                <div className="px-4 py-3 bg-bg-surface-alt border-t border-border-main mt-auto">
                  <div className="text-[10px] text-text-dim uppercase tracking-wider mb-2">Top Performers</div>
                  <div className="flex gap-4">
                    {comp.leaders.slice(0, 2).map((leaderGroup: any, idx: number) => {
                      const leader = leaderGroup.leaders[0];
                      if (!leader) return null;
                      return (
                        <div key={idx} className="flex-1 flex gap-2 items-center">
                          {leader.athlete.headshot && (
                            <img src={leader.athlete.headshot} className="w-6 h-6 rounded-full bg-bg-dark" alt={leader.athlete.shortName} referrerPolicy="no-referrer" />
                          )}
                          <div className="flex flex-col">
                            <span className="text-[10px] text-text-dim truncate max-w-[80px]">{leader.athlete.shortName}</span>
                            <span className="text-xs font-mono font-bold">{leader.displayValue} {leaderGroup.shortDisplayName}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {games.length === 0 && (
          <div className="col-span-full p-12 text-center border-dashed border border-border-main rounded-xl text-text-dim">
            No NBA games found.
          </div>
        )}
      </div>
    </div>
  );
}
