import { useState } from 'react';
import { X, Download, Calendar, Filter } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'portfolio' | 'signals';
  dataPayload?: any[]; // optional pre-loaded data if needed
}

export default function ExportModal({ isOpen, onClose, type, dataPayload = [] }: ExportModalProps) {
  const [dateRange, setDateRange] = useState('7d');
  const [marketType, setMarketType] = useState('All');
  
  if (!isOpen) return null;

  const handleExport = () => {
    // Basic CSV generator
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (type === 'portfolio') {
      csvContent += "Date,Balance\n";
      // Generate some dummy historical data or use payload
      const mockDates = Array.from({length: dateRange === '7d' ? 7 : 30}).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();
      
      mockDates.forEach((date, i) => {
         const balance = 95000 + (Math.random() * 5000) * i;
         csvContent += `${date},${balance.toFixed(2)}\n`;
      });
      
    } else {
      csvContent += "ID,Match,EV,Probability,Odds,Risk Level,Market Filter\n";
      // Export current signals
      let exportData = dataPayload;
      if (marketType !== 'All') {
        // mock filter if applying
      }
      
      exportData.forEach(sig => {
        csvContent += `${sig.id},${sig.match},${sig.ev},${sig.prob},${sig.odds},${sig.riskLevel},${marketType}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${type}_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-bg-surface border border-border-main rounded-xl w-full max-w-sm shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-dim hover:text-text-main transition-colors">
          <X className="w-5 h-5" />
        </button>
        
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Download className="w-5 h-5 text-accent" /> 
          Export {type === 'portfolio' ? 'Portfolio Data' : 'Signals Data'}
        </h3>
        
        <div className="space-y-4 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-dim uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Date Range
            </label>
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full bg-bg-dark border border-border-main rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {type === 'signals' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text-dim uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-3 h-3" /> Market Type
              </label>
              <select 
                value={marketType} 
                onChange={(e) => setMarketType(e.target.value)}
                className="w-full bg-bg-dark border border-border-main rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="All">All Markets</option>
                <option value="1X2">Match 1X2</option>
                <option value="OverUnder">Over/Under Goals</option>
                <option value="BTTS">Both Teams to Score</option>
                <option value="Props">Player Props</option>
              </select>
            </div>
          )}
        </div>

        <button 
          onClick={handleExport}
          className="w-full bg-accent text-bg-dark font-semibold py-2 rounded shadow-lg shadow-accent/20 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
        >
          <Download className="w-4 h-4" /> Download CSV
        </button>
      </div>
    </div>
  );
}
