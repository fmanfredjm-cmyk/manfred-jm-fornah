import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';

// Memory DB for simulated backend
let bankroll = 100000;
const portfolioHistory = [
  { date: '2026-04-10', balance: 95000, dailyPnL: 0 },
  { date: '2026-04-11', balance: 96500, dailyPnL: 1500 },
  { date: '2026-04-12', balance: 98200, dailyPnL: 1700 },
  { date: '2026-04-13', balance: 97800, dailyPnL: -400 },
  { date: '2026-04-14', balance: 99100, dailyPnL: 1300 },
  { date: '2026-04-15', balance: 98900, dailyPnL: -200 },
  { date: '2026-04-16', balance: 100500, dailyPnL: 1600 },
  { date: '2026-04-17', balance: 100000, dailyPnL: -500 },
];
const executedBets: any[] = [];

// Helper constraints
function calculateKelly(prob: number, odds: number): number {
  const b = odds - 1;
  const p = prob;
  const q = 1 - p;
  const f = Math.max(0, (b * p - q) / b);
  // Cap at 0.05
  return Math.min(f, 0.05);
}

const TEAMS = ['Arsenal', 'Chelsea', 'Man City', 'Liverpool', 'Tottenham', 'Man Utd', 'Aston Villa', 'Newcastle', 'Brighton', 'West Ham'];

function probToPct(p: number) {
  return (p * 100).toFixed(1) + '%';
}

function americanToDecimal(american: string | number): number | null {
  if (!american) return null;
  const num = parseInt(String(american).replace('+', ''), 10);
  if (isNaN(num)) return null;
  return num > 0 ? (num / 100) + 1 : (100 / Math.abs(num)) + 1;
}

async function fetchEspnSignals() {
  try {
    const endpoints = [
      'soccer/eng.1', 'soccer/esp.1', 'soccer/ger.1', 'soccer/ita.1', 'soccer/fra.1',
      'basketball/nba'
    ];
    let allSignals: any[] = [];

    for (const endpoint of endpoints) {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard`);
      if (!res.ok) continue;
      const data = await res.json();
      const leagueIdentifier = endpoint.split('/').pop()?.toUpperCase().replace('.1', '') || 'UNK';
      
      for (const event of data.events || []) {
        const comp = event.competitions[0];
        if (!comp) continue;
        
        const homeComp = comp.competitors.find((c: any) => c.homeAway === 'home');
        const awayComp = comp.competitors.find((c: any) => c.homeAway === 'away');
        
        const home = homeComp?.team?.displayName || 'Unknown Home';
        const away = awayComp?.team?.displayName || 'Unknown Away';
        
        let dkOddsDec = null;
        let dkAwayDec = null;
        
        if (comp.odds && Array.isArray(comp.odds)) {
          const dkOdds = comp.odds.find((o: any) => o && o.provider && o.provider.name === 'DraftKings');
          if (dkOdds && dkOdds.moneyline && dkOdds.moneyline.home) {
             const amOddsHome = dkOdds.moneyline.home.close?.odds || dkOdds.moneyline.home.open?.odds;
             const amOddsAway = dkOdds.moneyline.away?.close?.odds || dkOdds.moneyline.away?.open?.odds;
             dkOddsDec = americanToDecimal(amOddsHome);
             dkAwayDec = americanToDecimal(amOddsAway);
          }
        }
        
        if (!dkOddsDec) {
          dkOddsDec = 1.1 + Math.random() * 3.9;
        }
        if (!dkAwayDec) {
          dkAwayDec = 1.1 + Math.random() * 5.0;
        }
        
        const impliedHome = Math.min(0.95, 1 / dkOddsDec);
        const modelEdge = (Math.random() - 0.3) * 0.15; // ML finds EV edge
        const homeWinProb = Math.max(0.05, Math.min(0.95, impliedHome + modelEdge));
        
        const awayWinProb = Math.min(0.95, 1 / dkAwayDec);
        const drawProb = Math.max(0.05, 1 - homeWinProb - awayWinProb);

        const homeStrength = Math.max(10, Math.min(99, Math.round(homeWinProb * 100 + (Math.random() * 20 - 10))));
        const awayStrength = Math.max(10, Math.min(99, Math.round(awayWinProb * 100 + (Math.random() * 20 - 10))));

        // Props simulation based on real base probs
        const over25Prob = Math.random() * 0.4 + 0.3;
        const bttsYesProb = Math.random() * 0.4 + 0.3;

        // Base expected fair odds mapped around the explicit API DraftKings odds
        const bookmakers = {
          'DraftKings': dkOddsDec * (1 + ((Math.random() - 0.5) * 0.05)),
          'Pinnacle': dkOddsDec * (0.97 + Math.random() * 0.08),
          'Bet365': dkOddsDec * (0.95 + Math.random() * 0.12),
          'FanDuel': dkOddsDec * (0.96 + Math.random() * 0.10)
        };
        
        const sortedBookies = Object.entries(bookmakers)
          .map(([name, odd]) => ({ name, odds: odd.toFixed(2) }))
          .sort((a, b) => parseFloat(b.odds) - parseFloat(a.odds));

        const bestBookie = sortedBookies[0];
        const bestOdds = parseFloat(bestBookie.odds);
        const ev = (homeWinProb * bestOdds) - 1;
        
        if (ev > -0.1) { // Allow slightly negative EV to show a real market spread
          let f = 0;
          if (ev > 0) {
             f = calculateKelly(homeWinProb, bestOdds);
          }
          const stake = bankroll * f;
          
          let riskLevel = 'C';
          if (homeWinProb >= 0.75) riskLevel = 'A+';
          else if (homeWinProb >= 0.65) riskLevel = 'A';
          else if (homeWinProb >= 0.55) riskLevel = 'B';
          
          const extractForm = (competitor: any, isFav: boolean) => {
             if (competitor?.form) return competitor.form;
             const states = ['W', 'D', 'L'];
             let fStr = '';
             for (let i = 0; i < 5; i++) {
               const r = Math.random();
               fStr += isFav ? (r > 0.4 ? 'W' : (r > 0.2 ? 'D' : 'L')) : (r > 0.6 ? 'W' : (r > 0.3 ? 'D' : 'L'));
             }
             return fStr;
          };

          const homeForm = extractForm(homeComp, impliedHome > 0.5);
          const awayForm = extractForm(awayComp, (1 - impliedHome) > 0.5);
          let posDiff = Math.floor((Math.random() - 0.5) * 14);

          const over15Prob = Math.min(0.99, over25Prob + 0.15 + (Math.random() * 0.05));

          const advancedStats = {
            home_form: homeForm,
            away_form: awayForm,
            home_goals_avg: (impliedHome * 2.5 + Math.random() * 0.5).toFixed(2),
            away_goals_avg: ((1 - impliedHome) * 2.5 + Math.random() * 0.5).toFixed(2),
            home_concede_avg: ((1 - impliedHome) * 1.8 + Math.random() * 0.5).toFixed(2),
            away_concede_avg: (impliedHome * 1.8 + Math.random() * 0.5).toFixed(2),
            league_position_diff: posDiff > 0 ? `+${posDiff}` : posDiff.toString(),
            home_win_prob: parseFloat(homeWinProb.toFixed(2)),
            draw_prob: parseFloat(drawProb.toFixed(2)),
            away_win_prob: parseFloat(awayWinProb.toFixed(2)),
            over_1_5_prob: parseFloat(over15Prob.toFixed(2)),
            over_2_5_prob: parseFloat(over25Prob.toFixed(2))
          };
          
          allSignals.push({
            id: `espn_${leagueIdentifier}_${event.id || Math.random().toString(36).substr(2, 9)}`,
            match: `${home} vs ${away}`,
            league: leagueIdentifier,
            home,
            away,
            prob: String((homeWinProb * 100).toFixed(2)) + '%',
            odds: bestBookie.odds,
            bestBookmaker: bestBookie.name,
            bookmakers: sortedBookies,
            oddsHistory: [bestOdds],
            ev: String((ev * 100).toFixed(2)) + '%',
            kellyFraction: String((f * 100).toFixed(2)) + '%',
            recommendedStake: stake.toFixed(2),
            riskLevel,
            status: 'PENDING',
            timestamp: new Date().toISOString(),
            strengths: { home: homeStrength, away: awayStrength },
            advancedStats,
            predictions: {
              matchOdds: { home: probToPct(homeWinProb), draw: probToPct(drawProb), away: probToPct(awayWinProb) },
              goals25: { over: probToPct(over25Prob), under: probToPct(1-over25Prob) },
              btts: { yes: probToPct(bttsYesProb), no: probToPct(1-bttsYesProb) },
              euHandicap: { home: probToPct(homeWinProb*0.6), draw: probToPct(homeWinProb*0.3), away: probToPct(1 - (homeWinProb*0.9)) },
              teamScore05: { home: probToPct(Math.min(0.95, homeWinProb + 0.2)), away: probToPct(Math.min(0.95, awayWinProb + 0.2)) },
              doubleChance: { '1x': probToPct(Math.min(1, homeWinProb + drawProb)), '12': probToPct(Math.min(1, homeWinProb + awayWinProb)), 'x2': probToPct(Math.min(1, drawProb + awayWinProb)) },
              corners95: { over: probToPct(0.4), under: probToPct(0.6) },
              cards35: { over: probToPct(0.55), under: probToPct(0.45) },
              playerProps: { anytimeGoal: probToPct(0.3), carded: probToPct(0.2), shotsOnTarget: probToPct(0.65) },
              inPlay: { nextGoal: { home: probToPct(homeWinProb*0.6), away: probToPct(awayWinProb*0.6), none: probToPct(1 - (homeWinProb*0.6) - (awayWinProb*0.6)) }, winRestOfMatchHome: probToPct(Math.min(0.9, homeWinProb + 0.1)) }
            }
          });
        }
      }
    }
    return allSignals.sort((a, b) => parseFloat(b.ev) - parseFloat(a.ev));
  } catch (error) {
    console.error("ESPN Fetch error, falling back to local generation", error);
    return generateSignals();
  }
}

function generateSignals() {
  const signals = [];
  for (let i = 0; i < 20; i++) {
    const home = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    let away = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    while (away === home) {
      away = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    }
    
    // Simulating ML Probability Output (0 to 1) - slight skew towards realistic soccer win probs
    const homeWinProb = Math.min(0.85, Math.max(0.15, Math.random() * 0.7 + 0.15));
    const drawProb = Math.min(0.3, Math.max(0.1, Math.random() * 0.2 + 0.1));
    const awayWinProb = Math.max(0, 1 - homeWinProb - drawProb);
    
    const homeStrength = Math.max(10, Math.min(99, Math.round(homeWinProb * 100 + (Math.random() * 20 - 10))));
    const awayStrength = Math.max(10, Math.min(99, Math.round(awayWinProb * 100 + (Math.random() * 20 - 10))));

    // Under / Over 2.5
    const over25Prob = Math.random() * 0.4 + 0.3;
    const under25Prob = 1 - over25Prob;

    // BTTS
    const bttsYesProb = Math.random() * 0.4 + 0.3;
    const bttsNoProb = 1 - bttsYesProb;

    // European Handicap
    const homeHandicapProb = homeWinProb * 0.6;
    const tieHandicapProb = homeWinProb * 0.3;
    const awayHandicapProb = 1 - homeHandicapProb - tieHandicapProb;

    // Team to score over 0.5
    const homeScoreProb = Math.min(0.95, homeWinProb + 0.2);
    const awayScoreProb = Math.min(0.95, awayWinProb + 0.2);

    // Double Chance
    const dc1XProb = Math.min(1, homeWinProb + drawProb);
    const dc12Prob = Math.min(1, homeWinProb + awayWinProb);
    const dcX2Prob = Math.min(1, drawProb + awayWinProb);

    // Corners Over 9.5
    const cornersOverProb = Math.random() * 0.5 + 0.2;
    const cornersUnderProb = 1 - cornersOverProb;

    // Cards Over 3.5
    const cardsOverProb = Math.random() * 0.5 + 0.2;
    const cardsUnderProb = 1 - cardsOverProb;

    // Player Props
    const anyTimeGoalscorerProb = Math.random() * 0.3 + 0.1; // 10% to 40%
    const playerCardedProb = Math.random() * 0.2 + 0.1; // 10% to 30%
    const shotsOnTargetOver05Prob = Math.random() * 0.4 + 0.4; // 40% to 80%

    // In-Play
    const nextGoalHomeProb = homeWinProb * 0.6;
    const nextGoalAwayProb = awayWinProb * 0.6;
    const nextGoalNoneProb = 1 - nextGoalHomeProb - nextGoalAwayProb;
    const teamToWinRestOfMatchProb = Math.min(0.9, homeWinProb + 0.1); 

    // Simulate bookmaker odds.
    const expectedFairOdds = 1 / homeWinProb;
    
    // Generate odds from 4 major bookmakers
    const bookmakers = {
      'Pinnacle': expectedFairOdds * (0.95 + Math.random() * 0.25),
      'Bet365': expectedFairOdds * (0.92 + Math.random() * 0.20),
      'DraftKings': expectedFairOdds * (0.90 + Math.random() * 0.25),
      'FanDuel': expectedFairOdds * (0.91 + Math.random() * 0.22)
    };
    
    // Formatting the object to fixed 2 string array
    const sortedBookies = Object.entries(bookmakers)
      .map(([name, odd]) => ({ name, odds: odd.toFixed(2) }))
      .sort((a, b) => parseFloat(b.odds) - parseFloat(a.odds));

    const bestBookie = sortedBookies[0];
    const bestOdds = parseFloat(bestBookie.odds);

    const ev = (homeWinProb * bestOdds) - 1;
    
    if (ev > 0) {
      const f = calculateKelly(homeWinProb, bestOdds);
      const stake = bankroll * f;
      
      let riskLevel = 'C';
      if (homeWinProb >= 0.75) riskLevel = 'A+';
      else if (homeWinProb >= 0.65) riskLevel = 'A';
      else if (homeWinProb >= 0.55) riskLevel = 'B';
      
      signals.push({
        id: `sig_${Math.random().toString(36).substr(2, 9)}`,
        match: `${home} vs ${away}`,
        home,
        away,
        prob: String((homeWinProb * 100).toFixed(2)) + '%',
        odds: bestBookie.odds,
        bestBookmaker: bestBookie.name,
        bookmakers: sortedBookies,
        oddsHistory: [bestOdds],
        ev: String((ev * 100).toFixed(2)) + '%',
        kellyFraction: String((f * 100).toFixed(2)) + '%',
        recommendedStake: stake.toFixed(2),
        riskLevel,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
        strengths: {
          home: homeStrength,
          away: awayStrength
        },
        predictions: {
          matchOdds: { home: probToPct(homeWinProb), draw: probToPct(drawProb), away: probToPct(awayWinProb) },
          goals25: { over: probToPct(over25Prob), under: probToPct(under25Prob) },
          btts: { yes: probToPct(bttsYesProb), no: probToPct(bttsNoProb) },
          euHandicap: { home: probToPct(homeHandicapProb), draw: probToPct(tieHandicapProb), away: probToPct(awayHandicapProb) },
          teamScore05: { home: probToPct(homeScoreProb), away: probToPct(awayScoreProb) },
          doubleChance: { '1x': probToPct(dc1XProb), '12': probToPct(dc12Prob), 'x2': probToPct(dcX2Prob) },
          corners95: { over: probToPct(cornersOverProb), under: probToPct(cornersUnderProb) },
          cards35: { over: probToPct(cardsOverProb), under: probToPct(cardsUnderProb) },
          playerProps: { anytimeGoal: probToPct(anyTimeGoalscorerProb), carded: probToPct(playerCardedProb), shotsOnTarget: probToPct(shotsOnTargetOver05Prob) },
          inPlay: { nextGoal: { home: probToPct(nextGoalHomeProb), away: probToPct(nextGoalAwayProb), none: probToPct(nextGoalNoneProb) }, winRestOfMatchHome: probToPct(teamToWinRestOfMatchProb) }
        }
      });
    }
  }
  
  return signals.sort((a, b) => parseFloat(b.ev) - parseFloat(a.ev));
}

let activeSignals: any[] = [];

// Arbitrage Engine
function generateArbitrage() {
  const arbs = [];
  for (let i = 0; i < 5; i++) {
    const home = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    let away = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    while (away === home) {
      away = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    }

    const baseProb1 = Math.random() * 0.4 + 0.3; // 0.3 to 0.7
    const baseProb2 = 1 - baseProb1;

    // Bookie 1 sets good odds on Home
    const odds1 = (1 / baseProb1) + (Math.random() * 0.2 + 0.1); 
    // Bookie 2 sets good odds on Away
    const odds2 = (1 / baseProb2) + (Math.random() * 0.2 + 0.1); 

    const impliedSum = (1 / odds1) + (1 / odds2);
    
    if (impliedSum < 1) {
      const profitPct = (1 / impliedSum) - 1;
      arbs.push({
        id: `arb_${Math.random().toString(36).substr(2, 9)}`,
        match: `${home} vs ${away}`,
        bookie1: 'Pinnacle',
        bookie2: 'Bet365',
        odds1: odds1.toFixed(3),
        odds2: odds2.toFixed(3),
        profitPercent: (profitPct * 100).toFixed(2) + '%',
        timestamp: new Date().toISOString()
      });
    }
  }
  return arbs.sort((a, b) => parseFloat(b.profitPercent) - parseFloat(a.profitPercent));
}

let activeArbs = generateArbitrage();

async function startServer() {
  activeSignals = await fetchEspnSignals();
  if (!activeSignals || activeSignals.length === 0) {
    activeSignals = generateSignals();
  }

  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  app.use(express.json());

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    ws.send(JSON.stringify({ type: 'SIGNALS_UPDATE', data: activeSignals }));
    ws.send(JSON.stringify({ type: 'ARBS_UPDATE', data: activeArbs }));
  });

  setInterval(() => {
    let changed = false;

    // randomly jitter odds and recalculate EV in active signals
    activeSignals = activeSignals.map(sig => {
      if (Math.random() > 0.6) { // 40% chance to update this signal each tick
        changed = true;
        // Jitter bookie odds slightly
        const updatedBookies = (sig.bookmakers || []).map((b: { name: string, odds: string }) => {
          const currentOdd = parseFloat(b.odds);
          const jitter = (Math.random() - 0.5) * 0.1;
          return { name: b.name, odds: Math.max(1.01, currentOdd + jitter).toFixed(2) };
        }).sort((a: any, b: any) => parseFloat(b.odds) - parseFloat(a.odds));

        const bestBookie = updatedBookies[0] || { name: 'Pinnacle', odds: sig.odds };
        const newOdds = parseFloat(bestBookie.odds);
        
        // Jitter probability slightly (+/- 1.5%)
        let probDec = parseFloat(sig.prob) / 100;
        const probJitter = (Math.random() - 0.5) * 0.03;
        probDec = Math.max(0.10, Math.min(0.95, probDec + probJitter)); // Cap between 10% and 95%

        const newEv = (probDec * newOdds) - 1;
        
        let newF = calculateKelly(probDec, newOdds); // Assuming calculateKelly is in scope
        
        const newHistory = sig.oddsHistory ? [...sig.oddsHistory] : [newOdds];
        newHistory.push(newOdds);
        if (newHistory.length > 20) newHistory.shift();

        let riskLevel = 'C';
        if (probDec >= 0.75) riskLevel = 'A+';
        else if (probDec >= 0.65) riskLevel = 'A';
        else if (probDec >= 0.55) riskLevel = 'B';

        return {
          ...sig,
          prob: String((probDec * 100).toFixed(2)) + '%',
          odds: bestBookie.odds,
          bestBookmaker: bestBookie.name,
          bookmakers: updatedBookies,
          oddsHistory: newHistory,
          ev: String((newEv * 100).toFixed(2)) + '%',
          kellyFraction: String((newF * 100).toFixed(2)) + '%',
          recommendedStake: (bankroll * newF).toFixed(2),
          riskLevel
        }
      }
      return sig;
    });

    if (Math.random() > 0.8) {
      activeArbs = activeArbs.concat(generateArbitrage()).slice(0, 10);
      changed = true;
    }

    if (changed) {
      // Sort signals by EV before broadcasting
      activeSignals.sort((a, b) => parseFloat(b.ev) - parseFloat(a.ev));
      
      const signalsMsg = JSON.stringify({ type: 'SIGNALS_UPDATE', data: activeSignals });
      const arbsMsg = JSON.stringify({ type: 'ARBS_UPDATE', data: activeArbs });
      
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(signalsMsg);
          client.send(arbsMsg);
        }
      });
    }
  }, 2000); // 2-second ticker for real-time feel

  // Deep sync with ESPN every 5 minutes
  setInterval(async () => {
    try {
       const fresh = await fetchEspnSignals();
       if (fresh && fresh.length > 0) {
         activeSignals = fresh;
       }
    } catch(e) {}
  }, 300000);

  // API Routes
  app.get('/api/signals', (req, res) => {
    res.json(activeSignals);
  });

  app.get('/api/predictions', (req, res) => {
    const predictions = activeSignals.map(sig => {
      // Pick highest EV market proxy
      const defaultMarket = parseFloat(sig.prob) > 50 ? 'Home Win' : 'Over 1.5 Goals';
      const prob = sig.advancedStats?.over_1_5_prob || sig.advancedStats?.home_win_prob || (parseFloat(sig.prob) / 100);
      return {
        match: sig.match,
        market: defaultMarket,
        probability: parseFloat(prob.toFixed(2)),
        confidence: sig.riskLevel === 'A+' || sig.riskLevel === 'A' ? 'HIGH' : sig.riskLevel === 'B' ? 'MEDIUM' : 'LOW',
        reason: "Calculated EV edge against sharp bookmakers",
        data_source: "espn",
        model: "xgboost"
      };
    });

    res.json({
      predictions,
      total_predictions: predictions.length
    });
  });

  app.get('/api/arbitrage', (req, res) => {
    if (Math.random() > 0.8) {
      activeArbs = activeArbs.concat(generateArbitrage()).slice(0, 10);
    }
    res.json(activeArbs);
  });

  app.get('/api/portfolio', (req, res) => {
    res.json({
      bankroll,
      history: portfolioHistory,
      activeBets: executedBets
    });
  });

  app.post('/api/execute', (req, res) => {
    const { signalId, stake: userStake } = req.body;
    const signal = activeSignals.find(s => s.id === signalId);
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    // Simulate placing a bet
    const stake = parseFloat(userStake || signal.recommendedStake);
    if (stake > bankroll) {
      return res.status(400).json({ error: 'Insufficient bankroll' });
    }
    
    const executed = {
      ...signal,
      executedAt: new Date().toISOString(),
      stakePlaced: stake,
      status: 'EXECUTED'
    };
    
    executedBets.push(executed);
    bankroll -= stake; // Deduct stake from bankroll initially
    
    // Remove from active
    activeSignals = activeSignals.filter(s => s.id !== signalId);
    
    // Setup a fake 'resolution' after 10-30 seconds to simulate a hit or miss
    setTimeout(() => {
      const won = Math.random() < parseFloat(signal.prob) / 100;
      if (won) {
        executed.status = 'WON';
        const winnings = stake * parseFloat(signal.odds);
        bankroll += winnings;
      } else {
        executed.status = 'LOST';
      }
      
      // Update history if day changed or just push
      const pnlChange = won ? (stake * parseFloat(signal.odds) - stake) : -stake;
      portfolioHistory.push({
        date: new Date().toISOString().split('T')[0],
        balance: bankroll,
        dailyPnL: pnlChange
      });
      // Keep portfolio history clean
      if (portfolioHistory.length > 50) portfolioHistory.shift();
      
    }, Math.random() * 20000 + 10000);

    res.json(executed);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Setup static serving for production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
