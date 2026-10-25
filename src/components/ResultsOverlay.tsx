import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Skull, RefreshCw, LifeBuoy } from 'lucide-react';
import { milestonesForInfused } from '../starGrowth';

/**
 * Solo Continue offer (Adam, 2026-10-25 — hull breach doors):
 * the loop's death-economy seat, quoted by the sim's own
 * functions (App computes price + wait, never the overlay).
 * Present only on the solo defeat form; null everywhere else
 * (victory, MP match end, eliminated solo seat) keeps the
 * single RE-INITIALIZE door exactly as before. respawnAt is
 * set once a paid Continue is in flight — the overlay then
 * shows the wait countdown instead of the Continue door
 * (a second press would no-op sim-side, so it is not offered).
 */
export interface SoloContinueOffer {
  price: number;
  bankedScrap: number;
  waitMs: number;
  respawnAt: number | null;
  onContinue: () => void;
}

interface ResultsOverlayProps {
  isVictory: boolean;
  isGameOver: boolean;
  teamScrap: number;
  totalScrapInfused: number;
  onRestart: () => void;
  soloContinue?: SoloContinueOffer | null;
}

export const ResultsOverlay: React.FC<ResultsOverlayProps> = ({
  isVictory,
  isGameOver,
  teamScrap,
  totalScrapInfused,
  onRestart,
  soloContinue = null
}) => {
  const show = isVictory || isGameOver;
  // Paid-wait countdown (RepurchaseOverlay's clock idiom):
  // ticks on its own 200 ms clock while a paid Continue is
  // in flight; the arrival tick clears isGameOver and this
  // screen goes away on its own.
  const waitingAt = soloContinue?.respawnAt ?? null;
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (waitingAt === null) return;
    const id = window.setInterval(() => setTick(t => t + 1), 200);
    return () => window.clearInterval(id);
  }, [waitingAt]);
  const waitSecs = waitingAt !== null ? Math.max(0, Math.ceil((waitingAt - performance.now()) / 1000)) : 0;
  const waitClock = `${Math.floor(waitSecs / 60)}:${String(waitSecs % 60).padStart(2, '0')}`;

  if (!show) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className={`w-full max-w-md p-8 border-4 relative overflow-hidden glass-modal shadow-[0_0_100px_rgba(0,0,0,0.5)] ${
            isVictory ? 'border-[#33ff33] shadow-[#33ff33]/20' : 'border-red-600 shadow-red-600/20'
          }`}
        >
          {/* Background glitch effect */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
             <div className="absolute inset-0 grid-bg" />
          </div>

          <div className="relative z-10 text-center">
            {isVictory ? (
              <>
                <motion.div 
                  initial={{ rotate: -10 }}
                  animate={{ rotate: 10 }}
                  transition={{ repeat: Infinity, duration: 2, repeatType: 'reverse' }}
                  className="mb-4 inline-block"
                >
                  <Trophy size={64} className="text-[#33ff33]" />
                </motion.div>
                <h1 className="text-4xl font-black text-[#33ff33] mb-2 tracking-tighter uppercase italic">
                  Systems Victorious
                </h1>
                <p className="text-zinc-400 font-mono text-xs mb-8 uppercase tracking-widest">
                  Enemy Star Neutralized // Core Security Restored
                </p>
              </>
            ) : (
              <>
                <div className="mb-4 inline-block">
                  <Skull size={64} className="text-red-600" />
                </div>
                <h1 className="text-4xl font-black text-red-600 mb-2 tracking-tighter uppercase italic">
                  Hull Breach
                </h1>
                <p className="text-zinc-400 font-mono text-xs mb-8 uppercase tracking-widest">
                  Signal Lost // Structural Failure Imminent
                </p>
              </>
            )}

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-zinc-900/50 p-4 border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Scrap Fed</div>
                <div className="text-2xl font-bold text-white">{teamScrap}U</div>
              </div>
              <div className="bg-zinc-900/50 p-4 border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Star Growth</div>
                <div className="text-2xl font-bold text-white">+{milestonesForInfused(totalScrapInfused)} Lvl</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {soloContinue ? (
                soloContinue.respawnAt !== null ? (
                  <>
                    <div className="bg-zinc-900/50 p-4 border border-cyan-800">
                      <div className="text-[10px] text-zinc-500 uppercase mb-1">Rebuilding Your Ship</div>
                      <div className="text-2xl font-bold text-cyan-300">REDEPLOY IN {waitClock}</div>
                      <div className="text-[10px] font-mono text-zinc-400 mt-1">PAYMENT TAKEN — {soloContinue.price}U · SAME MATCH, MAP IN PLACE</div>
                    </div>
                    <p className="font-mono text-[10px] text-amber-300 leading-snug">STARTING OVER NOW LOSES THE PAYMENT AND THE MATCH.</p>
                    <button
                      onClick={onRestart}
                      className="pitted-metal w-full py-4 font-bold flex items-center justify-center gap-2 group transition-all text-red-500"
                    >
                      <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                      <span>START OVER</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bg-zinc-900/50 p-4 border border-zinc-800 font-mono text-[10px] leading-snug text-zinc-400">
                      <div>DEATH TAX TAKEN — BANK {soloContinue.bankedScrap}U KEPT</div>
                      <div>MAP + PROGRESS KEPT — SAME MATCH, NOT A NEW ONE</div>
                      <div className="text-zinc-300 mt-1">CONTINUE COSTS {soloContinue.price === 0 ? 'FREE' : `${soloContinue.price}U`} · REDEPLOY IN ~{Math.ceil(soloContinue.waitMs / 1000)}S</div>
                    </div>
                    <button
                      onClick={soloContinue.onContinue}
                      className="pitted-metal w-full py-4 font-bold flex items-center justify-center gap-2 group transition-all text-[#33ff33]"
                    >
                      <LifeBuoy size={18} />
                      <span>CONTINUE — {soloContinue.price === 0 ? 'FREE' : `${soloContinue.price}U`}</span>
                    </button>
                    <button
                      onClick={onRestart}
                      className="pitted-metal w-full py-4 font-bold flex items-center justify-center gap-2 group transition-all text-red-500"
                    >
                      <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                      <span>START OVER</span>
                    </button>
                  </>
                )
              ) : (
                <button
                  onClick={onRestart}
                  className={`pitted-metal w-full py-4 font-bold flex items-center justify-center gap-2 group transition-all ${
                    isVictory ? 'text-[#33ff33]' : 'text-red-500'
                  }`}
                >
                  <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                  <span>RE-INITIALIZE SYSTEMS</span>
                </button>
              )}
            </div>
          </div>

          {/* Warning stripes */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
