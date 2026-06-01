// fetch-xg.js — FBref scraper completo
// Clubes: Big 5 + LATAM + Champions/Europa
// Selecciones: Mundial 2026 clasificatorias + Copa America + Nations League
// Datos: últimos 10 partidos local/visitante + contexto por competición

const https = require('https');
const fs = require('fs');

// ── EQUIPOS CLUBES (FBref squad URLs) ──
// FBref usa slugs estables — estos son los más buscados
const CLUB_LEAGUES = [
  // Premier League
  { leagueId: '9', leagueName: 'Premier League', country: 'England',  season: '2025-2026' },
  // La Liga
  { leagueId: '12', leagueName: 'La Liga',       country: 'Spain',    season: '2025-2026' },
  // Serie A
  { leagueId: '11', leagueName: 'Serie A',       country: 'Italy',    season: '2025-2026' },
  // Bundesliga
  { leagueId: '20', leagueName: 'Bundesliga',    country: 'Germany',  season: '2025-2026' },
  // Ligue 1
  { leagueId: '13', leagueName: 'Ligue 1',       country: 'France',   season: '2025-2026' },
  // Champions League
  { leagueId: '8',  leagueName: 'Champions League', country: 'UEFA',  season: '2024-2025' },
];

const NATIONAL_LEAGUES = [
  // Clasificatorias Mundial CONMEBOL
  { leagueId: '685', leagueName: 'WC Qualif CONMEBOL', country: 'CONMEBOL', season: '2026' },
  // Clasificatorias Mundial UEFA
  { leagueId: '686', leagueName: 'WC Qualif UEFA',     country: 'UEFA',     season: '2026' },
  // Copa America
  { leagueId: '685', leagueName: 'Copa America',       country: 'CONMEBOL', season: '2024' },
  // Nations League UEFA
  { leagueId: '687', leagueName: 'Nations League',     country: 'UEFA',     season: '2024-2025' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; sports-data-bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,en;q=0.9',
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parsear tabla de resultados de FBref
function parseMatchesTable(html, teamName) {
  const matches = [];
  
  // Buscar filas de la tabla de scores
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
  const rows = html.match(rowRegex) || [];
  
  for (const row of rows) {
    // Skip header rows
    if (row.includes('thead') || row.includes('<th ')) continue;
    
    // Extraer fecha
    const dateMatch = row.match(/data-value="(\d{4}-\d{2}-\d{2})"/);
    if (!dateMatch) continue;
    
    // Extraer competición
    const compMatch = row.match(/>[A-Za-z\s]+League|Premier|Liga|Serie|Bundesliga|Ligue|Champions|Europa|Copa|World|Nations|Qualif[^<]*/);
    const comp = compMatch ? compMatch[0].replace('>', '').trim() : '';
    
    // Extraer local/visitante
    const venueMatch = row.match(/>(Home|Away|Neutral)<\/td>/);
    const venue = venueMatch ? venueMatch[1] : '';
    
    // Extraer resultado (goles)
    const scoreMatch = row.match(/(\d+)–(\d+)|(\d+)-(\d+)/);
    if (!scoreMatch) continue;
    
    const gf = parseInt(scoreMatch[1] || scoreMatch[3]) || 0;
    const gc = parseInt(scoreMatch[2] || scoreMatch[4]) || 0;
    
    // Extraer rival
    const opponentMatch = row.match(/squad[^"]*"[^>]*>([^<]+)<\/a>/);
    const opponent = opponentMatch ? opponentMatch[1].trim() : 'Rival';
    
    matches.push({
      date: dateMatch[1],
      venue,
      opponent,
      gf,
      gc,
      comp: comp.substring(0, 30)
    });
  }
  
  return matches;
}

// Calcular xG promedio desde partidos
function calcXG(matches, venue) {
  const filtered = matches.filter(m => venue === 'all' || m.venue === venue);
  if (filtered.length === 0) return null;
  
  const recent = filtered.slice(-10); // últimos 10
  const avgGF = recent.reduce((s, m) => s + m.gf, 0) / recent.length;
  const avgGC = recent.reduce((s, m) => s + m.gc, 0) / recent.length;
  
  return {
    xgFor:     parseFloat(avgGF.toFixed(2)),
    xgAgainst: parseFloat(avgGC.toFixed(2)),
    matches:   recent.map(m => ({
      date:     m.date,
      opponent: m.opponent,
      gf:       m.gf,
      gc:       m.gc,
      venue:    m.venue,
      comp:     m.comp
    }))
  };
}

// Scrape standings de FBref para obtener lista de equipos
async function scrapeLeagueTeams(leagueId, season, leagueName, country) {
  const url = `https://fbref.com/en/comps/${leagueId}/${season}/schedule/${season}-${leagueName.replace(/\s+/g,'-')}-Scores-and-Fixtures`;
  
  try {
    console.log(`  Scrapeo: ${leagueName} (${country})`);
    const html = await fetchUrl(url);
    
    // Extraer equipos únicos de la tabla de fixtures
    const teamLinks = new Set();
    const teamRegex = /\/en\/squads\/([a-f0-9]+)\/([^"\/]+)\/([^"]+)/g;
    let match;
    
    while ((match = teamRegex.exec(html)) !== null) {
      const teamId = match[1];
      const teamSlug = match[2];
      teamLinks.add(JSON.stringify({ id: teamId, slug: teamSlug }));
    }
    
    // Extraer nombres de equipos del HTML
    const teams = {};
    const nameRegex = /title="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    
    // Parsear tabla de clasificación si existe
    const standingsMatch = html.match(/class="stats_table[^"]*"[\s\S]*?<\/table>/);
    if (standingsMatch) {
      const tableHtml = standingsMatch[0];
      const rowRegex2 = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
      let row;
      
      while ((row = rowRegex2.exec(tableHtml)) !== null) {
        const squadMatch = row[1].match(/squads\/([a-f0-9-]+)\/([^"]+)"[^>]*>([^<]+)<\/a>/);
        if (squadMatch) {
          const id = squadMatch[1];
          const name = squadMatch[3].trim();
          
          teams[name.toLowerCase()] = {
            id,
            name,
            leagueName,
            country,
            season,
            xgFor: 0,
            xgAgainst: 0,
            xgHomeFor: 0,
            xgHomeAgainst: 0,
            xgAwayFor: 0,
            xgAwayAgainst: 0,
            played: 0,
            recentMatches: []
          };
        }
      }
    }
    
    console.log(`    Equipos encontrados: ${Object.keys(teams).length}`);
    return teams;
    
  } catch(e) {
    console.error(`    Error: ${e.message}`);
    return {};
  }
}

// Scrape partidos recientes de un equipo específico
async function scrapeTeamMatches(teamId, teamName, season) {
  const url = `https://fbref.com/en/squads/${teamId}/${season}/matchlogs/all_comps/schedule/`;
  
  try {
    const html = await fetchUrl(url);
    const matches = parseMatchesTable(html, teamName);
    
    // Separar por local/visitante/competición
    const homeMatches = matches.filter(m => m.venue === 'Home').slice(-10);
    const awayMatches = matches.filter(m => m.venue === 'Away').slice(-10);
    
    // Competiciones especiales (UCL, Copa, etc)
    const cupMatches = matches.filter(m => 
      m.comp && (m.comp.includes('Champions') || m.comp.includes('Europa') || 
                 m.comp.includes('Copa') || m.comp.includes('Cup') ||
                 m.comp.includes('Nations') || m.comp.includes('World'))
    ).slice(-5);
    
    return {
      home: homeMatches,
      away: awayMatches,
      cups: cupMatches,
      all:  matches.slice(-20)
    };
  } catch(e) {
    return { home: [], away: [], cups: [], all: [] };
  }
}

// Calcular estadísticas desde partidos
function buildTeamStats(matchData, teamObj) {
  const homeMatches = matchData.home;
  const awayMatches = matchData.away;
  const allMatches  = matchData.all;
  
  const avgHome = homeMatches.length > 0 ? {
    xgFor:     parseFloat((homeMatches.reduce((s,m)=>s+m.gf,0)/homeMatches.length).toFixed(2)),
    xgAgainst: parseFloat((homeMatches.reduce((s,m)=>s+m.gc,0)/homeMatches.length).toFixed(2)),
  } : { xgFor: 0, xgAgainst: 0 };
  
  const avgAway = awayMatches.length > 0 ? {
    xgFor:     parseFloat((awayMatches.reduce((s,m)=>s+m.gf,0)/awayMatches.length).toFixed(2)),
    xgAgainst: parseFloat((awayMatches.reduce((s,m)=>s+m.gc,0)/awayMatches.length).toFixed(2)),
  } : { xgFor: 0, xgAgainst: 0 };
  
  const avgAll = allMatches.length > 0 ? {
    xgFor:     parseFloat((allMatches.reduce((s,m)=>s+m.gf,0)/allMatches.length).toFixed(2)),
    xgAgainst: parseFloat((allMatches.reduce((s,m)=>s+m.gc,0)/allMatches.length).toFixed(2)),
  } : { xgFor: 0, xgAgainst: 0 };
  
  return {
    ...teamObj,
    xgFor:          avgAll.xgFor,
    xgAgainst:      avgAll.xgAgainst,
    xgHomeFor:      avgHome.xgFor,
    xgHomeAgainst:  avgHome.xgAgainst,
    xgAwayFor:      avgAway.xgFor,
    xgAwayAgainst:  avgAway.xgAgainst,
    played:         allMatches.length,
    recentHome:     homeMatches.slice(-10),
    recentAway:     awayMatches.slice(-10),
    recentCups:     matchData.cups.slice(-5),
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('FBref XG Scraper — Clubes + Selecciones');
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const allTeams = {};
  const meta = {
    lastUpdated: new Date().toISOString(),
    totalTeams: 0,
    leagues: [],
    source: 'FBref'
  };

  // Ligas de clubes principales — scrapeamos standings para obtener IDs
  const leaguesToProcess = [
    // Clubes
    { id: '9',   name: 'Premier League',     country: 'England',  season: '2025-2026', type: 'club' },
    { id: '12',  name: 'La Liga',            country: 'Spain',    season: '2025-2026', type: 'club' },
    { id: '11',  name: 'Serie A',            country: 'Italy',    season: '2025-2026', type: 'club' },
    { id: '20',  name: 'Bundesliga',         country: 'Germany',  season: '2025-2026', type: 'club' },
    { id: '13',  name: 'Ligue 1',            country: 'France',   season: '2025-2026', type: 'club' },
    // Selecciones
    { id: '685', name: 'WC Qualif CONMEBOL', country: 'CONMEBOL', season: '2026',      type: 'national' },
    { id: '686', name: 'WC Qualif UEFA',     country: 'UEFA',     season: '2026',      type: 'national' },
    { id: '687', name: 'Nations League',     country: 'UEFA',     season: '2024-2025', type: 'national' },
  ];

  for (const league of leaguesToProcess) {
    console.log(`\nLiga: ${league.name}`);
    
    // Para cada liga, buscar los equipos directamente desde la página de fixtures
    const url = `https://fbref.com/en/comps/${league.id}/${league.season}/schedule/`;
    
    try {
      const html = await fetchUrl(url);
      await sleep(3000); // Respetar rate limit
      
      // Extraer equipos únicos con sus IDs
      const squadRegex = /href="\/en\/squads\/([a-f0-9-]{36})\/[^"]*"[^>]*>([^<]+)<\/a>/g;
      const teamsFound = new Map();
      let m;
      
      while ((m = squadRegex.exec(html)) !== null) {
        const id = m[1];
        const name = m[2].trim();
        if (name && !name.includes('Match') && !name.includes('Report')) {
          teamsFound.set(id, { id, name });
        }
      }
      
      console.log(`  Equipos encontrados: ${teamsFound.size}`);
      
      // Para cada equipo, obtener sus partidos recientes
      let processed = 0;
      for (const [teamId, teamInfo] of teamsFound) {
        if (processed >= 25) break; // Máx 25 equipos por liga para no exceder rate limit
        
        const matchUrl = league.type === 'national' 
          ? `https://fbref.com/en/squads/${teamId}/${league.season}/matchlogs/all_comps/schedule/`
          : `https://fbref.com/en/squads/${teamId}/${league.season}/matchlogs/all_comps/schedule/`;
        
        try {
          const matchHtml = await fetchUrl(matchUrl);
          await sleep(2000);
          
          // Parsear tabla de partidos
          const matchRows = matchHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
          const matches = [];
          
          for (const row of matchRows) {
            if (row.includes('<th') || !row.includes('td')) continue;
            
            const dateM = row.match(/(\d{4}-\d{2}-\d{2})/);
            if (!dateM) continue;
            
            const venueM = row.match(/>(Home|Away|Neutral)<\/td>/);
            const venue = venueM ? venueM[1] : '';
            
            // Score
            const scoreM = row.match(/>(\d+)&ndash;(\d+)<|>(\d+)–(\d+)<|>(\d+)-(\d+)</);
            if (!scoreM) continue;
            const gf = parseInt(scoreM[1]||scoreM[3]||scoreM[5]||0);
            const gc = parseInt(scoreM[2]||scoreM[4]||scoreM[6]||0);
            
            // Rival
            const rivalM = row.match(/squad[^"]*"[^>]*>([^<]+)<\/a>/);
            const opponent = rivalM ? rivalM[1].trim() : '—';
            
            // Competición
            const compM = row.match(/comp_[^>]*>([^<]+)<\/a>|comp_[^>]*>([^<]+)<\/td>/);
            const comp = compM ? (compM[1]||compM[2]||'').trim() : '';
            
            if (venue) {
              matches.push({ date: dateM[1], venue, opponent, gf, gc, comp });
            }
          }
          
          const homeM = matches.filter(m => m.venue === 'Home').slice(-10);
          const awayM = matches.filter(m => m.venue === 'Away').slice(-10);
          const cupM  = matches.filter(m => 
            m.comp && (m.comp.match(/Champions|Europa|Copa|Cup|Nations|World|Qualif/i))
          ).slice(-5);
          
          const calcAvg = (arr) => arr.length === 0 ? 0 : 
            parseFloat((arr.reduce((s,m)=>s+m.gf,0)/arr.length).toFixed(2));
          const calcAvgC = (arr) => arr.length === 0 ? 0 : 
            parseFloat((arr.reduce((s,m)=>s+m.gc,0)/arr.length).toFixed(2));
          
          const allM = [...homeM, ...awayM];
          
          const teamData = {
            id:             teamId,
            name:           teamInfo.name,
            leagueName:     league.name,
            country:        league.country,
            season:         league.season,
            type:           league.type,
            xgFor:          calcAvg([...homeM,...awayM]),
            xgAgainst:      calcAvgC([...homeM,...awayM]),
            xgHomeFor:      calcAvg(homeM),
            xgHomeAgainst:  calcAvgC(homeM),
            xgAwayFor:      calcAvg(awayM),
            xgAwayAgainst:  calcAvgC(awayM),
            played:         matches.length,
            recentHome:     homeM,
            recentAway:     awayM,
            recentCups:     cupM,
          };
          
          const key = teamInfo.name.toLowerCase();
          if (allTeams[key]) {
            allTeams[`${key} (${league.name})`] = teamData;
          } else {
            allTeams[key] = teamData;
          }
          
          process.stdout.write(`    ✓ ${teamInfo.name} (${matches.length} partidos)\n`);
          processed++;
          
        } catch(e) {
          process.stdout.write(`    ✗ ${teamInfo.name}: ${e.message}\n`);
        }
      }
      
      meta.leagues.push({ name: league.name, country: league.country, teams: processed });
      
    } catch(e) {
      console.error(`  Error liga ${league.name}: ${e.message}`);
    }
    
    await sleep(4000); // Pausa entre ligas
  }

  meta.totalTeams = Object.keys(allTeams).length;
  
  const output = { meta, teams: allTeams };
  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log(`FINAL: ${meta.totalTeams} equipos en ${meta.leagues.length} ligas`);
  console.log('data.json actualizado ✓');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
