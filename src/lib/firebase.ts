import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, doc, setDoc, getDoc, getCountFromServer, increment, where } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAxFoEnQCH5rW4O_M7UYb_v5IXgOo4uxV0",
  authDomain: "gcc-sae.firebaseapp.com",
  projectId: "gcc-sae",
  storageBucket: "gcc-sae.firebasestorage.app",
  messagingSenderId: "11093208087",
  appId: "1:11093208087:web:2972e4659049f7707f4052",
  measurementId: "G-VB8J130T1R"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface LeaderboardEntry {
  playerId: string;
  distance: number;
  country: string;
  countryCode: string;
  updatedAt: number;
}

export async function submitScore(playerId: string, distance: number, country: string, countryCode: string) {
  try {
    const playerRef = doc(db, 'leaderboard', playerId);
    const playerDoc = await getDoc(playerRef);
    
    if (playerDoc.exists()) {
      const data = playerDoc.data() as LeaderboardEntry;
      if (distance > data.distance) {
        await setDoc(playerRef, {
          playerId,
          distance,
          country,
          countryCode,
          updatedAt: Date.now()
        });
      }
    } else {
      await setDoc(playerRef, {
        playerId,
        distance,
        country,
        countryCode,
        updatedAt: Date.now()
      });
    }
  } catch (error) {
    console.error("Failed to submit score:", error);
  }
}

export async function getTopGlobal(count = 10): Promise<LeaderboardEntry[]> {
  const q = query(collection(db, 'leaderboard'), orderBy('distance', 'desc'), limit(count));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as LeaderboardEntry);
}

export async function getTopCountry(countryCode: string, count = 10): Promise<LeaderboardEntry[]> {
  const q = query(collection(db, 'leaderboard'), where('countryCode', '==', countryCode), orderBy('distance', 'desc'), limit(count));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as LeaderboardEntry);
}

export async function getPlayerRank(distance: number, countryCode?: string): Promise<number> {
  let q = query(collection(db, 'leaderboard'), where('distance', '>', distance));
  if (countryCode) {
    q = query(collection(db, 'leaderboard'), where('countryCode', '==', countryCode), where('distance', '>', distance));
  }
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count + 1;
}



// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

// Subscribe to auth state changes. Returns an unsubscribe function.
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------------------------
// Per-user game progress (stored at userProgress/{uid})
// ---------------------------------------------------------------------------
export interface GameProgress {
  bestDistance: number;
  totalRaces: number;
  lastPlayed: number;
  displayName: string;
}

export async function saveProgress(
  uid: string,
  progress: Omit<GameProgress, 'totalRaces'>
): Promise<void> {
  const ref = doc(db, 'userProgress', uid);
  // totalRaces is incremented atomically on the server so concurrent
  // sessions never clobber each other's count.
  await setDoc(ref, { ...progress, totalRaces: increment(1) }, { merge: true });
}

export async function loadProgress(uid: string): Promise<GameProgress | null> {
  const ref = doc(db, 'userProgress', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as GameProgress) : null;
}
