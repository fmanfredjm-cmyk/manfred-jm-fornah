import { BarChart, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg-dark text-text-main flex flex-col">
      <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent rounded"></div>
          <span className="font-extrabold text-xl tracking-tight">ALPHABETS AI</span>
        </div>
        <Link 
          to="/login"
          className="px-4 py-2 bg-text-main text-bg-dark text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
        >
          Institutional Login
        </Link>
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-dim border border-accent/20 text-accent text-xs font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          Sys V2.4 Model Deployed
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6">
          Systematic Alpha in <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-cyan-400">
            Sports Markets.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-text-dim mb-10 max-w-2xl mx-auto">
          We provide a probabilistic decision support system for football betting markets using machine learning, expected value filtering, and Kelly criterion risk management.
        </p>
        
        <div className="flex items-center justify-center gap-4">
          <Link 
            to="/login"
            className="flex items-center gap-2 px-6 py-3 bg-accent text-bg-dark font-semibold rounded-md hover:opacity-90 transition-all border border-accent"
          >
            Access Platform
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#" className="px-6 py-3 border border-border-main rounded-md font-medium text-text-dim hover:bg-bg-surface transition-colors">
            Read Whitepaper
          </a>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 text-left w-full border-t border-border-main pt-16">
          <div>
            <Cpu className="w-6 h-6 text-accent mb-4" />
            <h3 className="text-lg font-semibold mb-2">ML Prediction Engine</h3>
            <p className="text-sm text-text-dim leading-relaxed">
              Trained on extensive historical match data to estimate true win probabilities with high accuracy margins.
            </p>
          </div>
          <div>
            <BarChart className="w-6 h-6 text-cyan-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">EV Filtering</h3>
            <p className="text-sm text-text-dim leading-relaxed">
              Calculates Expected Value against live bookmaker odds to isolate structural pricing inefficiencies.
            </p>
          </div>
          <div>
            <ShieldCheck className="w-6 h-6 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Risk Management</h3>
            <p className="text-sm text-text-dim leading-relaxed">
              Implements Kelly Criterion staking protocols to optimize bankroll velocity while capping downside exposure.
            </p>
          </div>
        </div>
      </main>
      
      <footer className="px-8 py-6 text-center text-xs text-border-main">
        &copy; {new Date().getFullYear()} ALPHABETS AI. Educational & analytical use only.
      </footer>
    </div>
  );
}
