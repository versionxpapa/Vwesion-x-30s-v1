/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  History, 
  Activity,
  Lock,
  RefreshCw
} from 'lucide-react';

// --- Types ---
interface HistoryEntry {
  id: string;
  pred: 'BIG' | 'SMALL';
  num: number;
  status: 'WIN' | 'LOSS' | 'JACKPOT';
  timestamp: number;
}

type Mode = '30S' | '1M';

// --- Constants ---
const MODES: Mode[] = ['30S', '1M'];
const API_URLS = {
  '30S': 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
  '1M': 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json'
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [mode, setMode] = useState<Mode>('1M');
  const [prediction, setPrediction] = useState<'BIG' | 'SMALL' | 'WAIT'>('WAIT');
  const [sureNumbers, setSureNumbers] = useState<number[]>([0, 0]);
  const [period, setPeriod] = useState<string>('---');
  const [counts, setCounts] = useState({ win: 0, loss: 0, jackpot: 0, total: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastIssue, setLastIssue] = useState<string | null>(null);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [samePredCount, setSamePredCount] = useState(1);
  const [lastResult, setLastResult] = useState<string | null>(null);
  
  const audioRefs = {
    win: useRef<HTMLAudioElement | null>(null),
    loss: useRef<HTMLAudioElement | null>(null)
  };

  // --- Auth Handlers ---
  const handleLogin = () => {
    if (accessKey === 'fuck') {
      setIsAuthenticated(true);
      localStorage.setItem('vip_access', 'true');
    } else {
      alert('🚫 INCORRECT ACCESS KEY');
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('vip_access');
    if (saved === 'true') setIsAuthenticated(true);
  }, []);


  // --- Main Engine ---
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URLS[mode]}?t=${Date.now()}`);
        const data = await response.json();
        const currentData = data.data.list[0];

        if (currentData.issueNumber !== lastIssue) {
          const numbers = data.data.list.slice(0, 10).map((item: any) => parseInt(item.number));
          
          const lastPred = prediction;
          let basePred: 'BIG' | 'SMALL';

          // Prediction logic from user file
          if (lastResult === 'win' || lastResult === 'jackpot') {
            basePred = lastPred === 'WAIT' ? 'BIG' : lastPred;
          } else if (lastResult === 'loss') {
            basePred = lastPred === 'BIG' ? 'SMALL' : 'BIG';
          } else {
            const bigCount = numbers.filter(n => n >= 5).length;
            const smallCount = numbers.length - bigCount;
            basePred = bigCount > smallCount ? 'BIG' : 'SMALL';
          }

          // Consecutive loss logic
          let newConsecLoss = lastResult === 'loss' ? consecutiveLosses + 1 : 0;
          if (newConsecLoss === 2) {
            // keep basePred (repeat)
          } else if (newConsecLoss >= 3) {
            const last5 = numbers.slice(0, 5);
            const big5 = last5.filter(n => n >= 5).length;
            const small5 = last5.length - big5;
            basePred = big5 >= small5 ? 'BIG' : 'SMALL';
            newConsecLoss = 0;
          }
          setConsecutiveLosses(newConsecLoss);

          // Same prediction limit
          let newSamePredCount = basePred === lastPred ? samePredCount + 1 : 1;
          let finalPred = basePred;
          if (newSamePredCount > 2) {
            finalPred = basePred === 'BIG' ? 'SMALL' : 'BIG';
            newSamePredCount = 1;
          }
          setSamePredCount(newSamePredCount);
          setPrediction(finalPred);

          // Number pools from user file
          const mainPool = finalPred === 'BIG' ? [6, 7, 8, 9] : [0, 1, 2, 3];
          const oppositePool = finalPred === 'BIG' ? [0, 1, 2, 3] : [6, 7, 8, 9];
          
          const mainNum = mainPool[Math.floor(Math.random() * mainPool.length)];
          const secNum = oppositePool[Math.floor(Math.random() * oppositePool.length)];
          setSureNumbers([mainNum, secNum]);

          const nextPeriod = (BigInt(currentData.issueNumber) + 1n).toString();
          setPeriod(nextPeriod);

          if (lastIssue) {
            const lastN = parseInt(currentData.number);
            const lastSize = lastN >= 5 ? 'BIG' : 'SMALL';
            let status: 'WIN' | 'LOSS' | 'JACKPOT';

            if (lastN === sureNumbers[0] || lastN === sureNumbers[1]) {
              status = 'JACKPOT';
              setCounts(prev => ({ ...prev, jackpot: prev.jackpot + 1, win: prev.win + 1 }));
              setLastResult('jackpot');
              audioRefs.win.current?.play().catch(() => {});
            } else if (lastSize === prediction) {
              status = 'WIN';
              setCounts(prev => ({ ...prev, win: prev.win + 1 }));
              setLastResult('win');
              audioRefs.win.current?.play().catch(() => {});
            } else {
              status = 'LOSS';
              setCounts(prev => ({ ...prev, loss: prev.loss + 1 }));
              setLastResult('loss');
              audioRefs.loss.current?.play().catch(() => {});
            }

            setCounts(prev => ({ ...prev, total: prev.total + 1 }));
            
            const newEntry: HistoryEntry = {
              id: currentData.issueNumber.slice(-3),
              pred: prediction as 'BIG' | 'SMALL',
              num: lastN,
              status: status,
              timestamp: Date.now()
            };

            setHistory(prev => [newEntry, ...prev].slice(0, 50));
          }

          setLastIssue(currentData.issueNumber);
        }
      } catch (error) {
        console.error('Fetch failed', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, mode, lastIssue, prediction, sureNumbers]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-radial-[circle_at_top] from-[#071a0f] to-[#020202]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm neon-border p-8 rounded-none"
        >
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="p-4 rounded-full bg-neon-green/10 border border-neon-green/20">
              <Lock className="w-8 h-8 neon-text" />
            </div>
            <h1 className="font-display text-2xl font-black text-center tracking-widest neon-text">
              VERSION -X
            </h1>
          </div>
          
          <div className="space-y-4">
            <input 
              type="password"
              placeholder="ENTER ACCESS KEY"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-center font-display tracking-widest focus:outline-none focus:border-neon-green/50 text-neon-green"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button 
              onClick={handleLogin}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-neon-green to-[#008f11] text-black font-display font-black text-sm tracking-[0.2em] shadow-[0_0_20px_rgba(0,255,65,0.3)] active:scale-95 transition-transform"
            >
              GRANT ACCESS
            </button>
            <p className="text-xs text-center text-white/40 mt-4">
              JOIN VERSION -X TELEGRAM COMMUNITY
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 gap-6 pb-20">
      {/* Hidden Audio Elements */}
      <audio ref={audioRefs.win} src="https://files.catbox.moe/dd3kew.ogg" />
      <audio ref={audioRefs.loss} src="https://files.catbox.moe/oqzc64.mp3" />

      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center w-full"
      >
        <h1 className="font-display text-5xl font-black tracking-widest neon-text mb-1 glitch-text">
          VERSION -X
        </h1>
        <div className="flex items-center justify-center gap-2 text-[10px] text-white/40 font-display tracking-[0.5em]">
          <span>PRD_PROTOCOL : ACTIVE</span>
        </div>
      </motion.div>

      {/* Mode Switcher */}
      <div className="flex gap-2 p-1 neon-border rounded-none relative w-full max-w-[280px]">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-full font-display text-[10px] font-bold tracking-widest transition-all z-10 ${
              mode === m ? 'text-black' : 'text-white/60'
            }`}
          >
            {m} GAME
          </button>
        ))}
        <motion.div 
          className="absolute h-[calc(100%-8px)] top-1 rounded-full bg-neon-green"
          animate={{ x: mode === '30S' ? 0 : 134 }} // Slightly adjusted for width
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{ width: '134px' }}
        />
      </div>

      {/* Main Prediction Display */}
      <motion.div 
        layout
        className="w-full max-w-sm neon-border rounded-none p-10 flex flex-col items-center gap-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-neon-green/50 to-transparent" />
        
        <div className="space-y-1 text-center">
          <span className="text-[10px] font-display text-white/30 tracking-[0.4em]">SEQUENCE_TARGET_ID</span>
          <h2 className="text-xl font-display font-black text-white tracking-[0.1em] border-x border-neon-green/20 px-4">{period}</h2>
        </div>

        <div className="w-full py-6 flex flex-col items-center gap-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={prediction}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className={`text-7xl font-display font-black tracking-widest ${
                prediction === 'WAIT' ? 'text-white/20' : 'neon-text animate-pulse'
              }`}
            >
              {prediction}
            </motion.div>
          </AnimatePresence>
          
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold text-neon-gold tracking-widest">
              SURE NUMBERS: {sureNumbers.join(' | ')}
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2 w-full">
          {[
            { label: 'CONFIRM', val: counts.win, color: 'text-neon-green' },
            { label: 'REJECT', val: counts.loss, color: 'text-neon-red' },
            { label: 'JACKPOT', val: counts.jackpot, color: 'text-neon-gold' },
            { label: 'CYCLES', val: counts.total, color: 'text-white/40' }
          ].map((stat) => (
            <div key={stat.label} className="bg-neon-green/5 border border-neon-green/10 p-2 text-center">
              <div className="text-[7px] text-white/30 font-display font-bold tracking-widest mb-1">{stat.label}</div>
              <div className={`text-md font-display font-bold ${stat.color}`}>{stat.val}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* History Table */}
      <div className="w-full max-w-sm neon-border rounded-none overflow-hidden flex flex-col mb-10">
        <div className="px-6 py-4 flex items-center justify-between border-b border-neon-green/10">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 neon-text" />
            <span className="font-display text-[9px] font-bold tracking-widest">SEQ_HISTORY_DAEMON</span>
          </div>
          <button 
            onClick={() => {
              setCounts({ win: 0, loss: 0, jackpot: 0, total: 0 });
              setHistory([]);
            }}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-left font-display text-[10px]">
            <thead className="text-white/20 sticky top-0 bg-black/80 backdrop-blur-sm z-10">
              <tr>
                <th className="px-6 py-3 font-medium tracking-widest">ID</th>
                <th className="px-6 py-3 font-medium tracking-widest">PRED</th>
                <th className="px-6 py-3 font-medium tracking-widest">RESULT</th>
                <th className="px-6 py-3 font-medium tracking-widest text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {history.map((entry, i) => (
                  <motion.tr 
                    key={entry.timestamp}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4 text-white/60">#{entry.id}</td>
                    <td className="px-6 py-4 text-white font-bold">{entry.pred}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${entry.num >= 5 ? 'bg-neon-green' : 'bg-neon-red'}`} />
                        <span className="text-white font-bold">{entry.num}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-black tracking-widest ${
                        entry.status === 'JACKPOT' ? 'text-neon-gold bg-neon-gold/10 px-2 py-0.5 rounded' : 
                        entry.status === 'WIN' ? 'text-neon-green' : 'text-neon-red'
                      }`}>
                        {entry.status}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-white/10 italic">
                    NO DATA PIPELINE RECORDED
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Button for Contact */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3">
        <button 
          onClick={() => window.open('https://t.me/VERSION_X_COMMUNITY', '_blank')}
          className="w-14 h-14 rounded-full bg-neon-green flex items-center justify-center shadow-[0_0_30px_rgba(0,255,65,0.4)] animate-pulse"
        >
          <Zap className="w-8 h-8 text-black" fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
