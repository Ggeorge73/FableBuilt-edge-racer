export interface PlayerProfile {
  id: string;
  name: string;
  country: string;
  countryCode: string;
}

export async function getPlayerProfile(): Promise<PlayerProfile> {
  const stored = localStorage.getItem('endlessRacerProfile');
  if (stored) {
    return JSON.parse(stored);
  }

  // Generate new profile
  const id = 'player_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  let country = 'Unknown';
  let countryCode = 'UN';
  
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/country.json');
    if (res.ok) {
      const data = await res.json();
      countryCode = data.country;
      country = data.name;
    }
  } catch (error) {
    console.warn("Could not determine country", error);
  }

  const profile: PlayerProfile = {
    id,
    name: 'Racer_' + id.substring(7, 11),
    country,
    countryCode
  };

  localStorage.setItem('endlessRacerProfile', JSON.stringify(profile));
  return profile;
}
