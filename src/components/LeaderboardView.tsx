import { useEffect, useState } from 'react';
import { LeaderboardEntry, getTopGlobal, getTopCountry, getPlayerRank } from '../lib/firebase';
import { PlayerProfile } from '../lib/player';

interface LeaderboardViewProps {
  profile: PlayerProfile;
  currentDistance: number;
}

export function LeaderboardView({ profile, currentDistance }: LeaderboardViewProps) {
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [countryRank, setCountryRank] = useState<number | null>(null);
  const [globalBoard, setGlobalBoard] = useState<LeaderboardEntry[]>([]);
  const [countryBoard, setCountryBoard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'GLOBAL' | 'COUNTRY'>('GLOBAL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [gRank, cRank, gBoard, cBoard] = await Promise.all([
          getPlayerRank(currentDistance),
          getPlayerRank(currentDistance, profile.countryCode),
          getTopGlobal(10),
          getTopCountry(profile.countryCode, 10)
        ]);
        setGlobalRank(gRank);
        setCountryRank(cRank);
        setGlobalBoard(gBoard);
        setCountryBoard(cBoard);
      } catch (e: any) {
        console.error("Failed to load leaderboard data");
        if (e.code === 'permission-denied') {
          setError('Database permissions denied. Please update your Firestore security rules (see firestore.rules).');
        } else if (e.code === 'failed-precondition') {
          setError('Database index is missing. Please create the required composite index in Firebase Console.');
        } else {
          setError('Could not connect to the leaderboard database.');
        }
      }
      setLoading(false);
    }
    loadData();
  }, [profile, currentDistance]);


  return (
    <div className="w-full max-w-sm mt-6 p-4 bg-gray-900/80 rounded-xl border border-gray-700 shadow-2xl backdrop-blur-sm pointer-events-auto">
      <div className="flex gap-4 mb-4 border-b border-gray-700 pb-2">
        <button 
          onClick={() => setActiveTab('GLOBAL')}
          className={`flex-1 text-center pb-2 text-sm font-bold tracking-wider uppercase transition-colors ${activeTab === 'GLOBAL' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Global
        </button>
        <button 
          onClick={() => setActiveTab('COUNTRY')}
          className={`flex-1 text-center pb-2 text-sm font-bold tracking-wider uppercase transition-colors ${activeTab === 'COUNTRY' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          {profile.countryCode !== 'UN' ? profile.country : 'Country'}
        </button>
      </div>

      <div className="flex justify-between items-center bg-black/50 px-3 py-2 rounded-lg mb-3">
        <span className="text-xs text-gray-400">Your Rank</span>
        <span className="text-sm font-mono font-bold text-white">
          #{activeTab === 'GLOBAL' ? globalRank : countryRank}
        </span>
      </div>

      {error && (
        <div className="p-3 mb-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-xs text-center">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm animate-pulse">Loading rankings...</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
          {(activeTab === 'GLOBAL' ? globalBoard : countryBoard).map((entry, idx) => (
            <div 
              key={entry.playerId} 
              className={`flex items-center justify-between p-2 rounded ${entry.playerId === profile.id ? 'bg-amber-900/40 border border-amber-700' : 'bg-gray-800/40'}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-500 font-mono text-xs w-4">{(idx + 1)}</span>
                <span className="text-sm text-gray-200 font-semibold">{entry.playerId === profile.id ? 'You' : 'Player'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500" title={entry.country}>{entry.countryCode}</span>
                <span className="font-mono text-amber-500 font-bold">{entry.distance}m</span>
              </div>
            </div>
          ))}
          {(activeTab === 'GLOBAL' ? globalBoard : countryBoard).length === 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">No scores yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
