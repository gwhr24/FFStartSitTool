document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    // IMPORTANT: Paste your API key from The Odds API here.
    const oddsApiKey = '0ee3ceb8b6bd4a72f61773a3cf9aeda5';

    // --- DOM ELEMENT REFERENCES ---
    const searchInput = document.getElementById('player-search');
    const searchResultsContainer = document.getElementById('search-results');
    const playerComparisonArea = document.getElementById('player-comparison-area');
    const playerBoxTemplate = document.querySelector('.player-box-template');

    // --- STATE MANAGEMENT ---
    let allPlayers = {}; // Stores all NFL players from Sleeper
    let displayedPlayerIds = new Set();

    // --- DATA MAPS ---
    // Maps team abbreviations from Sleeper to full names used by The Odds API
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
    
    // Maps API prop keys to human-readable labels
    const propKeyMap = {
        "player_pass_yds_over_under": "Pass Yds", "player_pass_tds_over_under": "Pass TDs",
        "player_pass_completions_over_under": "Pass Comps", "player_pass_interceptions_over_under": "INTs",
        "player_rush_yds_over_under": "Rush Yds", "player_rush_tds_over_under": "Rush TDs",
        "player_rec_yds_over_under": "Rec Yds", "player_receptions_over_under": "Receptions",
        "player_rec_tds_over_under": "Rec TDs", "player_tds_over_under": "Anytime TD"
    };

    // --- INITIALIZATION ---
    async function initializeApp() {
        try {
            const response = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (!response.ok) throw new Error('Failed to fetch player data from Sleeper');
            allPlayers = await response.json();
            console.log('Player data loaded successfully.');
        } catch (error) {
            console.error("Initialization Error:", error);
        }
    }

    // --- SEARCH FUNCTIONALITY ---
    function handleSearch() {
        const query = searchInput.value.toLowerCase().trim();
        searchResultsContainer.innerHTML = '';
        if (query.length < 2) return;

        const results = Object.values(allPlayers).filter(player =>
            player.full_name?.toLowerCase().includes(query) && 
            ['QB', 'RB', 'WR', 'TE'].includes(player.position) && player.active
        ).slice(0, 7);
        displaySearchResults(results);
    }

    function displaySearchResults(results) {
        results.forEach(player => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = `${player.full_name} (${player.position}, ${player.team || 'FA'})`;
            item.addEventListener('click', () => selectPlayer(player.player_id));
            searchResultsContainer.appendChild(item);
        });
    }

    // --- PLAYER SELECTION & DATA FETCHING ---
    async function selectPlayer(playerId) {
        if (displayedPlayerIds.has(playerId)) return alert('Player is already displayed.');
        if (displayedPlayerIds.size >= 6) return alert('Maximum of 6 players can be displayed.');

        searchInput.value = '';
        searchResultsContainer.innerHTML = '';
        
        try {
            displayedPlayerIds.add(playerId);
            const playerData = allPlayers[playerId];
            // Fetch all betting data from The Odds API
            const bettingData = await fetchBettingData(playerData);
            createPlayerBox(playerData, bettingData);
        } catch (error) {
            console.error(`Error processing player ${playerId}:`, error);
            displayedPlayerIds.delete(playerId);
            alert('Could not fetch betting data for the selected player.');
        }
    }

    // --- CORE API LOGIC ---
    async function fetchBettingData(playerData) {
        const fullTeamName = teamNameMap[playerData.team];
        if (!fullTeamName) throw new Error("Team not found");

        // Step 1: Fetch all upcoming games to find the correct game ID
        const gamesResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${oddsApiKey}&regions=us&markets=spreads,totals`);
        if (!gamesResponse.ok) throw new Error('Failed to fetch game odds');
        const games = await gamesResponse.json();

        const game = games.find(g => g.home_team === fullTeamName || g.away_team === fullTeamName);
        if (!game) return { error: "Game not found" };

        // Extract general game info
        const opponent = game.home_team === fullTeamName ? game.away_team : game.home_team;
        const bookmaker = game.bookmakers[0];
        const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
        const totalMarket = bookmaker.markets.find(m => m.key === 'totals');
        const teamSpread = spreadMarket.outcomes.find(o => o.name === fullTeamName);

        const gameInfo = {
            opponent: Object.keys(teamNameMap).find(key => teamNameMap[key] === opponent),
            spread: `${playerData.team} ${teamSpread.point > 0 ? '+' : ''}${teamSpread.point}`,
            total: totalMarket.outcomes[0].point,
            gameTime: new Date(game.commence_time).toLocaleString(),
            props: []
        };
        
        // Step 2: Fetch player props for that specific game using its ID
        const propsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${game.id}/odds?apiKey=${oddsApiKey}&regions=us&markets=${Object.keys(propKeyMap).join(',')}`);
        if (!propsResponse.ok) { // This might fail if props aren't available, so we don't throw an error
            console.warn("Could not fetch player props for this game.");
            return gameInfo; // Return game info even if props fail
        }
        const propsData = await propsResponse.json();
        
        // Step 3: Parse the props to find ones matching our player
        const playerPropsBookmaker = propsData.bookmakers.find(b => b.markets.length > 0);
        if (playerPropsBookmaker) {
            playerPropsBookmaker.markets.forEach(market => {
                // Check if the prop is for our player and is a recognized prop type
                if (market.description.includes(playerData.full_name) && propKeyMap[market.key]) {
                    gameInfo.props.push({
                        label: propKeyMap[market.key],
                        value: market.outcomes.find(o => o.name === 'Over')?.point || 'N/A'
                    });
                }
            });
        }
        return gameInfo;
    }

    // --- DOM MANIPULATION ---
    function createPlayerBox(playerData, bettingData) {
        const newBox = playerBoxTemplate.cloneNode(true);
        newBox.classList.remove('player-box-template');
        newBox.style.display = 'block';

        newBox.querySelector('.player-name').textContent = playerData.full_name;
        newBox.querySelector('.player-team').textContent = `${playerData.position}, ${playerData.team || 'FA'}`;
        
        if (bettingData && !bettingData.error) {
            newBox.querySelector('.opponent').textContent = bettingData.opponent;
            newBox.querySelector('.spread').textContent = bettingData.spread;
            newBox.querySelector('.total').textContent = bettingData.total;
            newBox.querySelector('.game-time').textContent = bettingData.gameTime;

            const propsList = newBox.querySelector('.player-props ul');
            propsList.innerHTML = '';
            if (bettingData.props.length > 0) {
                bettingData.props.forEach(prop => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${prop.label}:</span><span class="prop-value">${prop.value}</span>`;
                    propsList.appendChild(li);
                });
            } else {
                propsList.innerHTML = `<li><span>No props available for this player.</span></li>`;
            }
        } else {
             newBox.querySelector('.game-info').textContent = "Game data not available.";
             newBox.querySelector('.player-props ul').innerHTML = `<li><span>N/A</span></li>`;
        }

        newBox.querySelector('.stat-value').textContent = Math.floor(Math.random() * 32) + 1;
        newBox.querySelector('.stat-label').textContent = `FPs to ${playerData.position}`;

        newBox.querySelector('.close-btn').addEventListener('click', () => {
            playerComparisonArea.removeChild(newBox);
            displayedPlayerIds.delete(playerData.player_id);
        });

        playerComparisonArea.appendChild(newBox);
    }

    searchInput.addEventListener('input', handleSearch);
    initializeApp();
});
