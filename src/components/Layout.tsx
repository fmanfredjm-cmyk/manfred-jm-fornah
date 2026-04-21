import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, LayoutDashboard, Radar, LogOut, Briefcase, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Live Signals', path: '/signals', icon: Activity },
    { name: 'NBA Scoreboard', path: '/scoreboard', icon: Trophy },
  ];

  return (
    <div className="flex h-screen bg-bg-dark text-text-main font-sans">
      {/* Sidebar */}
      <aside className="w-[240px] border-r border-border-main bg-bg-surface flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-6 h-6 bg-accent rounded"></div>
          <span className="font-extrabold text-xl tracking-tight">ALPHABETS AI</span>
        </div>
        
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center px-4 py-3 rounded-lg text-sm transition-colors",
                location.pathname === item.path 
                  ? "bg-bg-surface-alt text-text-main font-semibold" 
                  : "text-text-dim hover:bg-bg-surface-alt hover:text-text-main"
              )}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="pt-5 border-t border-border-main mt-auto">
          <div 
            onClick={() => navigate('/login')}
            className="flex items-center px-3 py-2 text-sm text-text-dim hover:text-text-main transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign out
          </div>
          <div className="mt-4 text-xs text-text-dim px-3">
             API Engine v1.4.2
             <div className="text-[11px] mt-1 text-accent">● Connected to Node-01</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col p-6 space-y-6">
        <Outlet />
      </main>
    </div>
  );
}
