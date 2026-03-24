// fetch-xg.js — Versión completa con LATAM, selecciones, temporadas 2025/2026
const fetch = require('node-fetch');
const fs = require('fs');

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

const headers = {
  'x-apisports-host': 'v3.football.api-sports.io',
  'x-apisports-key': API_KEY
};

const LEAGUES = [
  // EUROPA
  { id: 39,  name: 'Premier League',     country: 'England',     season: 2025 },
  { id: 140, name: 'La Liga',            country: 'Spain',       season: 2025 },
  { id: 135, name: 'Serie A',            country: 'Italy',       season: 2025 },
  { id: 78,  name: 'Bundesliga',         country: 'Germany',     season: 2025 },
  { id: 61,  name: 'Ligue 1',           country: 'France',      season: 2025 },
  { id: 94,  name: 'Primeira Liga',      country: 'Portugal',    season: 2025 },
  { id: 88,  name: 'Eredivisie',         country: 'Netherlands', season: 2025 },
  { id: 144, name: 'Pro League',         country: 'Belgium',     season: 2025 },
  { id: 203, name: 'Super Lig',          country: 'Turkey',      season: 2025 },
  { id: 179, name: 'Scottish Prem',      country: 'Scotland',    season: 2025 },
  { id: 218, name: 'Bundesliga AT',      country: 'Austria',     season: 2025 },
  { id: 197, name: 'Super League',       country: 'Switzerland', season: 2025 },
  { id: 207, name: 'Super League GRE',   country: 'Greece',      season: 2025 },
  // UEFA
  { id: 2,   name: 'Champions League',   country: 'UEFA',        season: 2025 },
  { id: 3,   name: 'Europa League',      country: 'UEFA',        season: 2025 },
  { id: 848, name: 'Conference League',  country: 'UEFA',        season: 2025 },
  // SUDAMERICA CLUBES
  { id: 13,  name: 'Libertadores',       country: 'CONMEBOL',    season: 2025 },
  { id: 11,  name: 'Sudamericana',       country: 'CONMEBOL',    season: 2025 },
  { id: 71,  name: 'Brasileirao A',      country: 'Brazil',      season: 2025 },
  { id: 72,  name: 'Brasileirao B',      country: 'Brazil',      season: 2025 },
  { id: 128, name: 'Liga Boliviana',     country: 'Bolivia',     season: 2025 },
  { id: 239, name: 'Liga Profesional',   country: 'Argentina',   season: 2025 },
  { id: 265, name: 'Primera Division',   country: 'Chile',       season: 2025 },
  { id: 281, name: 'Liga 1',            country: 'Peru',        season: 2025 },
  { id: 268, name: 'Liga BetPlay',       country: 'Colombia',    season: 2025 },
  { id: 242, name: 'Primera Division',   country: 'Uruguay',     season: 2025 },
  { id: 300, name: 'LigaPro',           country: 'Ecuador',     season: 2025 },
  { id: 307, name: 'Apertura',          country: 'Paraguay',    season: 2025 },
  { id: 332, name: 'Primera Division',   country: 'Venezuela',   season: 2025 },
  // CONCACAF
  { id: 253, name: 'MLS',               country: 'USA',         season: 2025 },
  { id: 262, name: 'Liga MX',           country: 'Mexico',      season: 2025 },
  { id: 480, name: 'Concacaf CL',       country: 'CONCACAF',    season: 2025 },
  // SELECCIONES 2025/2026
  { id: 32,  name: 'World Cup',          country: 'World',       season: 2026 },
  { id: 9,   name: 'WC Qualif CONMEBOL', country: 'CONMEBOL',   season: 2026 },
  { id: 34,  name: 'WC Qualif UEFA',     country: 'UEFA',        season: 2026 },
  { id: 36,  name: 'WC Qualif CAF',      country: 'Africa',      season: 2026 },
  { id: 30,  name: 'WC Qualif AFC',      country: 'Asia',        season: 2026 },
  { id: 37,  name: 'WC Qualif CONCACAF', country: 'CONCACAF',   season: 2026 },
  { id: 10,  name: 'Friendlies',         country: 'World',       season: 2025 },
  { id: 6,   name: 'Nations League',     country: 'UEFA',        season: 2025 },
  { id: 29,  name: 'Copa America',       country: 'CONMEBOL',   season: 2024 },
  { id: 33,  name: 'Africa Cup',         country: 'CAF',         season: 2025 },
  { id: 26,  name: 'Gold Cup',           country: 'CONCACAF',   season: 2025 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchLeagueStandings(leagueId, season) {
  const url = `${BASE_URL}/standings?league=${leagueId}&season=${season}`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!data.response || !data.response[0]) return {};

    const standings = data.response[0].league.standings.flat();
    const teams = {};

    standings.forEach(entry => {
      const allGames  = entry.all.played  || 1;
      const homeGames = entry.home.played || 1;
      const awayGames = entry.away.played || 1;

      teams[entry.team.name.toLowerCase()] = {
        id:             entry.team.id,
        name:           entry.team.name,
        logo:           entry.team.logo,
        leagueId,
        season,
        // General
        xgFor:          parseFloat((entry.all.goals.for     / allGames).toFixed(2)),
        xgAgainst:      parseFloat((entry.all.goals.against / allGames).toFixed(2)),
        // Como LOCAL
        xgHomeFor:      parseFloat((entry.home.goals.for     / homeGames).toFixed(2)),
        xgHomeAgainst:  parseFloat((entry.home.goals.against / homeGames).toFixed(2)),
        // Como VISITANTE
        xgAwayFor:      parseFloat((entry.away.goals.for     / awayGames).toFixed(2)),
        xgAwayAgainst:  parseFloat((entry.away.goals.against / awayGames).toFixed(2)),
        played: allGames
      };
    });

    return teams;
  } catch(e) {
    console.error(`Error standings league ${leagueId}:`, e.message);
    return {};
  }
}

async function main() {
  console.log('Iniciando fetch de datos XG...');
  console.log(`Fecha: ${new Date().toISOString()}`);

  const allTeams = {};
  const meta = {
    lastUpdated: new Date().toISOString(),
    totalTeams: 0,
    leagues: []
  };

  for (const league of LEAGUES) {
    console.log(`Procesando: ${league.name} (${league.country}) Season ${league.season}`);
    const teams = await fetchLeagueStandings(league.id, league.season);
    const count = Object.keys(teams).length;

    if (count > 0) {
      Object.entries(teams).forEach(([key, team]) => {
        if (allTeams[key]) {
          allTeams[`${key} (${league.name.toLowerCase()})`] = {
            ...team, leagueName: league.name, country: league.country
          };
        } else {
          allTeams[key] = { ...team, leagueName: league.name, country: league.country };
        }
      });
      meta.leagues.push({ name: league.name, country: league.country, teams: count });
      console.log(`  OK ${count} equipos`);
    } else {
      console.log(`  Sin datos`);
    }

    await sleep(1200);
  }

  meta.totalTeams = Object.keys(allTeams).length;
  fs.writeFileSync('data.json', JSON.stringify({ meta, teams: allTeams }, null, 2));
  console.log(`\nFINAL: ${meta.totalTeams} equipos en ${meta.leagues.length} ligas`);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
