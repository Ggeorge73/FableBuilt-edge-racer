import { useEffect, useState } from 'react';
import {
  LeaderboardEntry,
  getTopGlobal,
  getTopCountry,
  getPlayerRank,
} from '../lib/firebase';
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
          getTopCountry(profile.countryCode, 10),
        ]);
        setGlobalRank(gRank);
        setCountryRank(cRank);
        setGlobalBoard(gBoard);
        setCountryBoard(cBoard);
      } catch (e: any) {
        console.error('Failed to load leaderboard data');
        if (e.code === 'permission-denied') {
          setError('Database permissions denied. Please update your Firestore security rules.');
        } else if (e.code === 'failed-precondition') {
          setError('Database index missing. Create the composite index in Firebase Console.');
        } else {
          setError('The constellation of racers is unreachable right now.');
        }
      }
      setLoading(false);
    }
    loadData();
  }, [profile, currentDistance]);

  const board = activeTab === 'GLOBAL' ? globalBoard : countryBoard;

  return (
    <div className="leaderboard">
      <div className="lb-tabs">
        <button
          onClick={() => setActiveTab('GLOBAL')}
          className={`lb-tab ${activeTab === 'GLOBAL' ? 'active' : ''}`}
        >
          The World
        </button>
        <button
          onClick={() => setActiveTab('COUNTRY')}
          className={`lb-tab ${activeTab === 'COUNTRY' ? 'active' : ''}`}
        >
          {profile.countryCode !== 'UN' ? profile.country : 'Your Land'}
        </button>
      </div>

      <div className="lb-rank-banner">
        <span>your place among the lights</span>
        <b>#{activeTab === 'GLOBAL' ? globalRank ?? '—' : countryRank ?? '—'}</b>
      </div>

      {error && <div className="lb-error">{error}</div>}

      {loading ? (
        <div className="lb-status pulse">gathering the constellation…</div>
      ) : (
        <div className="lb-rows">
          {board.map((entry, idx) => (
            <div
              key={entry.playerId}
              className={`lb-row ${entry.playerId === profile.id ? 'me' : ''}`}
            >
              <span className="pos">{idx + 1}</span>
              <span className="who">{entry.playerId === profile.id ? 'You' : 'A light'}</span>
              <span className="cc" title={entry.country}>
                {entry.countryCode}
              </span>
              <span className="score">{entry.distance.toLocaleString()} m</span>
            </div>
          ))}
          {board.length === 0 && <div className="lb-status">no lights recorded yet</div>}
        </div>
      )}
    </div>
  );
}
