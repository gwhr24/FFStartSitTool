// Wait for the HTML document to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURATION ---
    const oddsApiKey = 'YOUR_API_KEY_HERE'; // Make sure your key is still here

    // --- DOM ELEMENT REFERENCES ---
    const searchInput = document.getElementById('player-search');
    const searchResultsContainer = document.getElementById('search-results');
    const playerComparisonArea = document.getElementById('player-comparison-area');
    const playerBoxTemplate = document.querySelector('.player-box-template');

    // --- STATE MANAGEMENT ---
    let allPlayers = {}; 
    let weeklyProjections = {}; // To store weekly projections
    let searchTimeout; 
    let displayedPlayerIds = new Set(); 

    // Team name mapping for consistency between APIs
    const teamNameMap = {
        "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens",
        "BUF": "Buffalo Bills", "CAR": "Carolina Panthers", "CHI": "Chicago Bears",
        "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns", "DAL": "Dallas Cowboys",
        "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
        "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars",
        "KC": "Kansas City Chiefs", "LAC": "Los Angeles Chargers", "LAR": "Los Angeles Rams",
        "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins", "MIN": "Minnesota Vikings",
        "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
        "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers",
        "SF": "San Francisco 49ers", "SEA": "Seattle Seahawks", "TB": "Tampa Bay Buccaneers",
        "TEN": "Tennessee Titans", "WAS": "Washington Commanders"
    };

    // --- INITIALIZATION ---
    async function initializeApp() {
        try {
            // Fetch player data and weekly projections at the same time
            const [playersResponse, stateResponse] = await Promise.all([
                fetch('https://api.sleeper.app/v1/players/nfl'),
                fetch('https://api.sleeper.app/v1/state/nfl')
            ]);
            
            if (!playersResponse.ok) throw new Error('Failed to fetch player data');
            if (!stateResponse.ok) throw new Error('Failed to fetch NFL state');

            allPlayers = await playersResponse.json();
            const nflState = await stateResponse.json();
            const week = nflState.week;

            const projectionsResponse = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${nflState.season}/${week}`);
            if(projectionsResponse.ok) {
                 weeklyProjections = await projectionsResponse.json();
            }
            
            console.log('Player and projection data loaded successfully for Week ' + week);
        } catch (error) {
            console.error("Initialization Error:", error);
        }
    }

    // --- EVENT LISTENERS ---
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(handleSearch, 300);
    });

    // --- SEARCH FUNCTIONALITY ---
    function handleSearch() {
        const query = searchInput.value.toLowerCase().trim();
        searchResultsContainer.innerHTML = ''; 

        if (query.length < 2) {
            searchResultsContainer.style.display = 'none';
            return;
        }

        const relevantPositions = ['QB', 'RB', 'WR', 'TE'];
        const results = Object.values(allPlayers)
            .filter(player => 
                player.full_name && 
                player.full_name.toLowerCase().includes(query) &&
                relevantPositions.includes(player.position) &&
                player.active
            )
            .slice(0, 10); 

        displaySearchResults(results);
    }

    function displaySearchResults(results) {
        if (results.length === 0) {
            searchResultsContainer.style.display = 'none';
            return;
        }
        
        results.forEach(player => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            resultItem.innerHTML = `
                <img src="https://sleepercdn.com/avatars/thumb/${player.avatar || '0'}" alt="${player.full_name}" class="search-result-avatar">
                <div>
                    <strong>${player.full_name}</strong>
                    <span>${player.position}, ${player.team || 'FA'}</span>
                </div>
            `;
            resultItem.addEventListener('click', () => selectPlayer(player.player_id));
            searchResultsContainer.appendChild(resultItem);
        });

        searchResultsContainer.style.display = 'block';
    }

    // --- PLAYER SELECTION AND DATA FETCHING ---
    async function selectPlayer(playerId) {
        if (displayedPlayerIds.has(playerId)) return alert('Player is already displayed.');
        if (displayedPlayerIds.size >= 6) return alert('Maximum of 6 players can be displayed.');

        searchInput.value = '';
        searchResultsContainer.style.display = 'none';

        try {
            displayedPlayerIds.add(playerId);
            const playerData = allPlayers[playerId];

            const [gameData, oddsData] = await Promise.all([
                fetchGameData(playerData.team),
                fetchOddsData(playerData.team)
            ]);

            const projections = weeklyProjections[playerId] || {};

            createPlayerBox(playerData, gameData, oddsData, projections);

        } catch (error) {
            console.error(`Error fetching data for player ${playerId}:`, error);
            displayedPlayerIds.delete(playerId);
            alert('Could not fetch all data for the selected player.');
        }
    }

    // --- API HELPER FUNCTIONS ---
    
    // Fetches live schedule data to find the opponent and game time
    async function fetchGameData(teamAbbr) {
        if (!teamAbbr) return null;
        // Using ESPN's public API for schedule info
        const scheduleResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
        if (!scheduleResponse.ok) throw new Error('Failed to fetch schedule data');
        const schedule = await scheduleResponse.json();

        const game = schedule.events.find(event => {
            return event.competitions[0].competitors.some(c => c.team.abbreviation === teamAbbr);
        });

        if (!game) return { opponent: 'BYE', gameTime: 'N/A' };

        const competition = game.competitions[0];
        const playerTeam = competition.competitors.find(c => c.team.abbreviation === teamAbbr);
        const opponentTeam = competition.competitors.find(c => c.team.abbreviation !== teamAbbr);
        
        return {
            opponent: opponentTeam.team.abbreviation,
            gameTime: new Date(competition.date).toLocaleString(),
        };
    }

    // Fetches game odds from The Odds API
    async function fetchOddsData(teamAbbr) {
        if (!teamAbbr) return null;
        
        const fullTeamName = teamNameMap[teamAbbr];
        if (!fullTeamName) return null;

        const oddsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${oddsApiKey}&regions=us&markets=spreads,totals`);
        if (!oddsResponse.ok) throw new Error('Failed to fetch odds data');
        const odds = await oddsResponse.json();
        
        const game = odds.find(g => g.home_team === fullTeamName || g.away_team === fullTeamName);
        if (!game || !game.bookmakers.length) return { spread: 'N/A', total: 'N/A' };
        
        const market = game.bookmakers[0].markets.find(m => m.key === 'spreads');
        const totalMarket = game.bookmakers[0].markets.find(m => m.key === 'totals');

        if (!market || !totalMarket) return { spread: 'N/A', total: 'N/A' };

        const teamOutcome = market.outcomes.find(o => o.name === fullTeamName);
        
        return {
            spread: `${teamAbbr} ${teamOutcome.point > 0 ? '+' : ''}${teamOutcome.point}`,
            total: totalMarket.outcomes[0].point,
        };
    }

    // --- DOM MANIPULATION ---
    function createPlayerBox(playerData, gameData, oddsData, projections) {
        const newBox = playerBoxTemplate.cloneNode(true);
        newBox.classList.remove('player-box-template');
        newBox.style.display = 'block';

        newBox.querySelector('.player-headshot').src = `https://sleepercdn.com/avatars/thumb/${playerData.avatar || '0'}`;
        newBox.querySelector('.player-name').textContent = playerData.full_name;
        newBox.querySelector('.player-team').textContent = `${playerData.position}, ${playerData.team || 'FA'}`;
        
        if (gameData) {
            newBox.querySelector('.opponent').textContent = gameData.opponent || 'N/A';
            newBox.querySelector('.game-time').textContent = gameData.gameTime;
        }
        if (oddsData) {
            newBox.querySelector('.spread').textContent = oddsData.spread || '';
            newBox.querySelector('.total').textContent = oddsData.total || '';
        }
        
        newBox.querySelector('.stat-value').textContent = Math.floor(Math.random() * 32) + 1; // Placeholder
        newBox.querySelector('.stat-label').textContent = `FPs to ${playerData.position}`;
        
        // --- NEW: Populate Player Projections ---
        const propsList = newBox.querySelector('.player-props ul');
        propsList.innerHTML = ''; // Clear existing
        const relevantProps = {
            'rec_yd': 'Rec Yds:',
            'rec': 'Receptions:',
            'pass_yd': 'Pass Yds:',
            'pass_td': 'Pass TDs:',
            'rush_yd': 'Rush Yds:',
            'td': 'Any TD:' // This is a general TD projection
        };

        let propsFound = 0;
        for (const propKey in relevantProps) {
            if (projections[propKey]) {
                const li = document.createElement('li');
                li.innerHTML = `<span>${relevantProps[propKey]}</span><span class="prop-value">${projections[propKey]}</span>`;
                propsList.appendChild(li);
                propsFound++;
            }
        }

        if (propsFound === 0) {
            propsList.innerHTML = `<li><span>No projections available</span></li>`;
        }


        const closeBtn = newBox.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            playerComparisonArea.removeChild(newBox);
            displayedPlayerIds.delete(playerData.player_id);
        });

        playerComparisonArea.appendChild(newBox);
    }

    // --- START THE APP ---
    initializeApp();
});
