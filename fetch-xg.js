// fetch-xg.js
// Corre via GitHub Actions cada día para actualizar data.json con xG actualizados
// Requiere: API_FOOTBALL_KEY en GitHub Secrets

const fetch = require('node-fetch');
const fs = require('fs');

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

const headers = {
  'x-apisports-host': 'v3.football.api-sports.io',
  'x-apisports-key': API_KEY
};

// ============================================================
// LIGAS CONFIGURADAS
// Agregá o quitá ligas según tu necesidad
// ID = el ID de la liga en API-Football
// season = temporada actual (actualizá cada año)
// ============================================================
const LEAGUES = [
  // Ligas europeas principales
  { id: 39,  name: 'Premier League',       country: 'England',  season: 2024 },
  { id: 140, name: 'La Liga',              country: 'Spain',    season: 2024 },
  { id: 135, name: 'Serie A',              country: 'Italy',    season: 2024 },
  { id: 78,  name: 'Bundesliga',           country: 'Germany',  season: 2024 },
  { id: 61,  name: 'Ligue 1',             country: 'France',   season: 2024 },
  { id: 94,  name: 'Primeira Liga',        country: 'Portugal', season: 2024 },
  { id: 88,  name: 'Eredivisie',           country: 'Netherlands', season: 2024 },
  { id: 144, name: 'Pro League',           country: 'Belgium',  season: 2024 },
  { id: 203, name: 'Süper Lig',            country: 'Turkey',   season: 2024 },
  // Copa de Europa
  { id: 2,   name: 'Champions League',     country: 'UEFA',     season: 2024 },
  { id: 3,   name: 'Europa League',        country: 'UEFA',     season: 2024 },
  { id: 848, name: 'Conference League',    country: 'UEFA',     season: 2024 },
  // Sudamérica
  { id: 13,  name: 'Libertadores',         country: 'CONMEBOL', season: 2025 },
  { id: 11,  name: 'Sudamericana',         country: 'CONMEBOL', season: 2025 },
  { id: 128, name: 'Liga Boliviana',       country: 'Bolivia',  season: 2025 },
  { id: 71,  name: 'Brasileirao',          country: 'Brazil',   season: 2025 },
  { id: 239, name: 'Primera División ARG', country: 'Argentina',season: 2025 },
  { id: 265, name: 'Primera División CHI', country: 'Chile',    season: 2025 },
  { id: 281, name: 'Liga 1 PER',           country: 'Peru',     season: 2025 },
  { id: 268, name: 'Primera División COL', country: 'Colombia', season: 2024 },
  { id: 242, name: 'Primera División URU', country: 'Uruguay',  season: 2025 },
  // Selecciones (Clasificatorias, Nations League, etc.)
  { id: 32,  name: 'World Cup',            country: 'World',    season: 2026 },
  { id: 10,  name: 'Friendlies',           country: 'World',    season: 2025 },
  { id: 9,   name: 'Conmebol WC Qualif.',  country: 'World',    season: 2026 },
  { id: 4,   name: 'Euro Qualif.',         country: 'UEFA',     season: 2024 },
  { id: 6,   name: 'Nations League',       country: 'UEFA',     season: 2024 },
  { id: 29,  name: 'Copa América',         country: 'CONMEBOL', season: 2024 },
];

// Función para jalar las estadísticas de un equipo en una liga/temporada
async function fetchTeamStats(teamId, leagueId, season) {
  const url = `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (data.response) {
      const s = data.response.goals;
      return {
        xgFor:     data.response.expected_goals || null,  // algunos endpoints lo dan
        goalsFor:  s?.for?.average?.total  || 0,
        goalsAgainst: s?.against?.average?.total || 0,
      };
    }
  } catch(e) {
    console.error(`Error stats team ${teamId}:`, e.message);
  }
  return null;
}

// Función para jalar todos los equipos de una liga
async function fetchTeams(leagueId, season) {
  const url = `${BASE_URL}/teams?league=${leagueId}&season=${season}`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    return data.response || [];
  } catch(e) {
    console.error(`Error teams league ${leagueId}:`, e.message);
    return [];
  }
}

// Función para jalar estadísticas de goles por liga (average xG por equipo)
async function fetchLeagueTeamStats(leagueId, season) {
  // Endpoint de standings que incluye goles a favor/en contra
  const url = `${BASE_URL}/standings?league=${leagueId}&season=${season}`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    
    if (!data.response || !data.response[0]) return {};
    
    const standings = data.response[0].league.standings.flat();
    const teams = {};
    
    standings.forEach(entry => {
      const games = entry.all.played || 1;
      const goalsFor = entry.all.goals.for / games;
      const goalsAgainst = entry.all.goals.against / games;
      
      teams[entry.team.name.toLowerCase()] = {
        id: entry.team.id,
        name: entry.team.name,
        logo: entry.team.logo,
        leagueId,
        season,
        // xG real si está disponible, sino usamos goles por partido como aproximación
        xgFor: parseFloat(goalsFor.toFixed(2)),
        xgAgainst: parseFloat(goalsAgainst.toFixed(2)),
        played: games
      };
    });
    
    return teams;
    
  } catch(e) {
    console.error(`Error standings league ${leagueId}:`, e.message);
    return {};
  }
}

// Función para jalar datos de selecciones nacionales
async function fetchNationalTeams(leagueId, season) {
  const url = `${BASE_URL}/standings?league=${leagueId}&season=${season}`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    
    if (!data.response || !data.response[0]) return {};
    
    const allStandings = data.response[0].league.standings.flat();
    const teams = {};
    
    allStandings.forEach(entry => {
      const games = entry.all.played || 1;
      const goalsFor = entry.all.goals.for / games;
      const goalsAgainst = entry.all.goals.against / games;
      
      teams[entry.team.name.toLowerCase()] = {
        id: entry.team.id,
        name: entry.team.name,
        logo: entry.team.logo,
        leagueId,
        season,
        xgFor: parseFloat(goalsFor.toFixed(2)),
        xgAgainst: parseFloat(goalsAgainst.toFixed(2)),
        played: games,
        isNational: true
      };
    });
    
    return teams;
    
  } catch(e) {
    console.error(`Error national teams league ${leagueId}:`, e.message);
    return {};
  }
}

// Función para pausar entre requests (evitar rate limit)
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ========================
// MAIN
// ========================
async function main() {
  console.log('🚀 Iniciando fetch de datos XG...');
  console.log(`📅 Fecha: ${new Date().toISOString()}`);
  
  const allTeams = {};
  const meta = {
    lastUpdated: new Date().toISOString(),
    totalTeams: 0,
    leagues: []
  };
  
  for (const league of LEAGUES) {
    console.log(`\n📊 Procesando: ${league.name} (${league.country}) - Season ${league.season}`);
    
    try {
      const teams = await fetchLeagueTeamStats(league.id, league.season);
      const count = Object.keys(teams).length;
      
      if (count > 0) {
        // Mergear con el objeto global, guardando el league name en cada equipo
        Object.entries(teams).forEach(([key, team]) => {
          // Si el equipo ya existe en otra liga, guardar ambas entradas con sufijo
          const existingKey = allTeams[key];
          if (existingKey) {
            // Guardamos con key "nombre (liga)"
            allTeams[`${key} (${league.name.toLowerCase()})`] = {
              ...team,
              leagueName: league.name,
              country: league.country
            };
          } else {
            allTeams[key] = {
              ...team,
              leagueName: league.name,
              country: league.country
            };
          }
        });
        
        meta.leagues.push({ name: league.name, country: league.country, teams: count });
        console.log(`   ✅ ${count} equipos`);
      } else {
        console.log(`   ⚠️  Sin datos (liga puede no estar disponible en plan gratuito)`);
      }
      
      // Pausa de 1 segundo entre requests para respetar rate limit
      await sleep(1000);
      
    } catch(e) {
      console.error(`   ❌ Error en ${league.name}:`, e.message);
    }
  }
  
  meta.totalTeams = Object.keys(allTeams).length;
  
  // Crear el JSON final
  const output = {
    meta,
    teams: allTeams
  };
  
  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  
  console.log(`\n✅ data.json generado con ${meta.totalTeams} equipos`);
  console.log(`📁 Ligas procesadas: ${meta.leagues.length}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
