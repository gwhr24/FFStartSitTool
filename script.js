// Wait for the HTML document to be fully loaded before running the script
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
    let allPlayers = {}; // This will store all NFL players from the Sleeper API
    let searchTimeout; // Used to delay search requests to avoid spamming the API
    let displayedPlayerIds = new Set(); // Tracks which players are currently displayed

    // --- INITIALIZATION ---
    // Fetches all players from Sleeper API when the page loads
    async function initializeApp() {
        try {
            const response = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (!response.ok) throw new Error('Failed to fetch player data from Sleeper API');
            allPlayers = await response.json();
            console.log('Player data loaded successfully.');
        } catch (error) {
            console.error("Initialization Error:", error);
            // You could display an error message to the user here
        }
    }

    // --- EVENT LISTENERS ---
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(handleSearch, 300); // Debounce search input
    });

    // --- SEARCH FUNCTIONALITY ---
    function handleSearch() {
        const query = searchInput.value.toLowerCase().trim();
        searchResultsContainer.innerHTML = ''; // Clear previous results

        if (query.length < 2) {
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
            .slice(0, 10); // Limit to top 10 results

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
            resultItem.textContent = `${player.full_name} (${player.position}, ${player.team || 'FA'})`;
            resultItem.addEventListener('click', () => selectPlayer(player.player_id));
            searchResultsContainer.appendChild(resultItem);
        });

        searchResultsContainer.style.display = 'block';
    }

    // --- PLAYER SELECTION AND DATA FETCHING ---
    async function selectPlayer(playerId) {
        if (displayedPlayerIds.has(playerId)) {
            alert('Player is already displayed.');
            return;
        }
        if (displayedPlayerIds.size >= 6) {
            alert('Maximum of 6 players can be displayed.');
            return;
        }

        searchInput.value = '';
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.style.display = 'none';

        try {
            // Add to displayed list immediately to prevent duplicates
            displayedPlayerIds.add(playerId);
            const playerData = allPlayers[playerId];

            // Fetch game and matchup data concurrently
            const [oddsData, matchupData] = await Promise.all([
                fetchOddsData(playerData.team),
                fetchMatchupData(playerData.team) 
            ]);

            // Create the player box with all the fetched data
            createPlayerBox(playerData, oddsData, matchupData);

        } catch (error) {
            console.error(`Error fetching data for player ${playerId}:`, error);
            // Remove from set if there was an error
            displayedPlayerIds.delete(playerId);
            alert('Could not fetch all data for the selected player.');
        }
    }

    // --- API HELPER FUNCTIONS ---

    // Fetches game odds and player props from The Odds API
    async function fetchOddsData(team) {
        if (!team) return null; // Handle free agents

        const oddsResponse = await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`);
        if (!oddsResponse.ok) throw new Error('Failed to fetch odds data');
        const odds = await oddsResponse.json();

        const game = odds.find(g => g.home_team.includes(team) || g.away_team.includes(team));
        if (!game) return { gameInfo: 'No odds available' };
        
        // This is a simplified example; a real app would find the best line from multiple bookmakers
        const bookmaker = game.bookmakers[0];
        const market = bookmaker.markets.find(m => m.key === 'spreads');
        const totalMarket = bookmaker.markets.find(m => m.key === 'totals');

        const teamOutcome = market.outcomes.find(o => o.name.includes(team));
        
        return {
            spread: `${team} ${teamOutcome.point > 0 ? '+' : ''}${teamOutcome.point}`,
            total: totalMarket.outcomes[0].point,
            gameTime: new Date(game.commence_time).toLocaleString(),
            // In a real app, you would fetch player props here using the game ID
        };
    }

    // Fetches opponent and defensive rank (placeholder data)
    async function fetchMatchupData(team) {
         if (!team) return null;
        // NOTE: Free APIs for live, accurate "Fantasy Points Allowed" are rare.
        // This function uses placeholder data to simulate the feature.
        // In a real-world application, this would be replaced with a premium data source.
        const stateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
        const nflState = await stateResponse.json();
        const week = nflState.week;

        // This is a placeholder for opponent data. A real app would need a reliable schedule API.
        const opponent = "Opponent"; // Placeholder
        const defensiveRank = Math.floor(Math.random() * 32) + 1; // Random rank from 1-32

        return { opponent, defensiveRank };
    }

    // --- DOM MANIPULATION ---
    function createPlayerBox(playerData, oddsData, matchupData) {
        const newBox = playerBoxTemplate.cloneNode(true);
        newBox.classList.remove('player-box-template');
        newBox.style.display = 'block';

        // Populate header
        newBox.querySelector('.player-headshot').src = `https://sleepercdn.com/avatars/thumb/${playerData.avatar_id || '0'}`;
        newBox.querySelector('.player-headshot').alt = playerData.full_name;
        newBox.querySelector('.player-name').textContent = playerData.full_name;
        newBox.querySelector('.player-team').textContent = `${playerData.position}, ${playerData.team || 'FA'}`;
        
        // Populate game info
        if (oddsData) {
            newBox.querySelector('.opponent').textContent = matchupData.opponent;
            newBox.querySelector('.spread').textContent = oddsData.spread || '';
            newBox.querySelector('.total').textContent = oddsData.total || '';
            newBox.querySelector('.game-time').textContent = oddsData.gameTime || 'TBD';
        }

        // Populate matchup stats
        if (matchupData) {
            newBox.querySelector('.stat-value').textContent = matchupData.defensiveRank;
            newBox.querySelector('.stat-label').textContent = `FPs to ${playerData.position}`;
        }
        
        // NOTE: Player props would be populated here. The free tier of The Odds API
        // has limited access to player prop markets. This section is a placeholder.
        const propsList = newBox.querySelector('.player-props ul');
        propsList.innerHTML = `<li><span>Player props not available on free plan</span></li>`;

        // Add close button functionality
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
