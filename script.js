document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const defensiveStatsURL = 'https://raw.githubusercontent.com/gwhr24/FFStartSitTool/refs/heads/main/defensive_stats.json';

    // --- DOM ELEMENT REFERENCES ---
    const searchInput = document.getElementById('player-search');
    const searchResultsContainer = document.getElementById('search-results');
    const playerComparisonArea = document.getElementById('player-comparison-area');
    const playerBoxTemplate = document.querySelector('.player-box-template');

    // --- STATE MANAGEMENT ---
    let allPlayers = {};
    let gameOddsData = [];
    let defensiveStats = {};
    let displayedPlayerIds = new Set();

    // --- INITIALIZATION (UPDATED FOR RESILIENCY) ---
    async function initializeApp() {
        console.log("Initializing app with resilient loading...");

        // Load Player List (Critical for search)
        try {
            const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
            if (!playersResponse.ok) throw new Error('Sleeper API failed to respond.');
            allPlayers = await playersResponse.json();
            console.log('Player data loaded successfully.');
        } catch (error) {
            console.error("CRITICAL ERROR: Failed to load player data.", error);
            alert('Could not load the player list. The search functionality will be disabled. Please refresh to try again.');
            searchInput.disabled = true;
            searchInput.placeholder = "Player list failed to load.";
        }

        // Load Game Odds (Non-critical)
        try {
            const oddsResponse = await fetch('https://ssportsgameodds.com/new/api/v2/odds/2/2/2');
            if (!oddsResponse.ok) throw new Error(`SportsGameOdds API responded with status: ${oddsResponse.status}`);
            const rawOddsData = await oddsResponse.json();
            gameOddsData = rawOddsData.data.events;
            console.log('Game odds data loaded successfully.');
        } catch (error) {
            console.warn("Warning: Could not load game odds data. Odds and props will be unavailable.", error);
            // gameOddsData will remain an empty array, which is a safe fallback.
        }

        // Load Your Defensive Stats (Non-critical)
        try {
            const statsResponse = await fetch(defensiveStatsURL);
            if (!statsResponse.ok) throw new Error(`GitHub stats file responded with status: ${statsResponse.status}`);
            defensiveStats = await statsResponse.json();
            console.log('Defensive stats loaded successfully.');
        } catch (error) {
            console.warn("Warning: Could not load your defensive stats data. Make sure the URL is correct.", error);
            // defensiveStats will remain an empty object, which is a safe fallback.
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

    // --- PLAYER SELECTION & DATA PARSING ---
    function selectPlayer(playerId) {
        if (displayedPlayerIds.has(playerId)) return alert('Player is already displayed.');
        if (displayedPlayerIds.size >= 6) return alert('Maximum of 6 players can be displayed.');

        searchInput.value = '';
        searchResultsContainer.innerHTML = '';
        
        try {
            displayedPlayerIds.add(playerId);
            const playerData = allPlayers[playerId];
            const consolidatedData = consolidateAllData(playerData);
            createPlayerBox(playerData, consolidatedData);
        } catch (error) {
            console.error(`Error processing player ${playerId}:`, error);
            displayedPlayerIds.delete(playerId);
            alert('Could not find or process data for the selected player.');
        }
    }

    // --- CORE DATA-CONSOLIDATION LOGIC ---
    function consolidateAllData(playerData) {
        if (!playerData.team) return { error: "Player is a Free Agent" };

        const game = gameOddsData.find(g => g.home_team_abbr === playerData.team || g.away_team_abbr === playerData.team);
        
        const opponentAbbr = game ? (game.home_team_abbr === playerData.team ? game.away_team_abbr : game.home_team_abbr) : null;
        const opponentStats = opponentAbbr ? defensiveStats[opponentAbbr] || {} : {};
        
        const odds = game?.odds?.[0];
        const spread = odds ? (game.home_team_abbr === playerData.team ? odds.spread.home_team : odds.spread.away_team) : 'N/A';
        
        let epaStat, fpRank;
        const pos = playerData.position;
        if (pos === 'QB' || pos === 'WR' || pos === 'TE') {
            epaStat = opponentStats.epa_per_pass_defense;
        } else if (pos === 'RB') {
            epaStat = opponentStats.epa_per_run_defense;
        }
        
        if (pos === 'QB') fpRank = opponentStats.fantasy_points_allowed_qb_rank;
        else if (pos === 'RB') fpRank = opponentStats.fantasy_points_allowed_rb_rank;
        else if (pos === 'WR') fpRank = opponentStats.fantasy_points_allowed_wr_rank;
        else if (pos === 'TE') fpRank = opponentStats.fantasy_points_allowed_te_rank;
        
        const props = [];
        if (game?.player_props?.length > 0) {
            game.player_props.forEach(prop => {
                if (prop.player_name.includes(playerData.first_name) && prop.player_name.includes(playerData.last_name)) {
                    props.push({ label: prop.prop_name, value: prop.over_under });
                }
            });
        }

        return {
            opponent: opponentAbbr || 'N/A',
            spread: game ? `${playerData.team} ${spread}` : 'N/A',
            total: odds?.over_under || 'N/A',
            gameTime: game ? new Date(game.start_date).toLocaleString() : 'N/A',
            fpRank: fpRank || 'N/A',
            epaStat: epaStat?.toFixed(3) || 'N/A',
            props
        };
    }

    // --- DOM MANIPULATION ---
    function createPlayerBox(playerData, consolidatedData) {
        const newBox = playerBoxTemplate.cloneNode(true);
        newBox.classList.remove('player-box-template');
        newBox.style.display = 'block';

        newBox.querySelector('.player-name').textContent = playerData.full_name;
        newBox.querySelector('.player-team').textContent = `${playerData.position}, ${playerData.team || 'FA'}`;
        
        if (consolidatedData && !consolidatedData.error) {
            newBox.querySelector('.opponent').textContent = consolidatedData.opponent;
            newBox.querySelector('.spread').textContent = consolidatedData.spread;
            newBox.querySelector('.total').textContent = consolidatedData.total;
            newBox.querySelector('.game-time').textContent = consolidatedData.gameTime;
            
            newBox.querySelector('#fp-rank-value').textContent = consolidatedData.fpRank;
            newBox.querySelector('#epa-value').textContent = consolidatedData.epaStat;

            const propsList = newBox.querySelector('.player-props ul');
            propsList.innerHTML = '';
            if (consolidatedData.props.length > 0) {
                consolidatedData.props.forEach(prop => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${prop.label}:</span><span class="prop-value">${prop.value}</span>`;
                    propsList.appendChild(li);
                });
            } else {
                propsList.innerHTML = `<li><span>No props available.</span></li>`;
            }
        } else {
             newBox.querySelector('.game-info').textContent = consolidatedData.error || "Game data not available.";
             newBox.querySelector('.matchup-stats').innerHTML = `<p>No matchup stats found.</p>`;
             newBox.querySelector('.player-props ul').innerHTML = `<li><span>N/A</span></li>`;
        }

        newBox.querySelector('.close-btn').addEventListener('click', () => {
            playerComparisonArea.removeChild(newBox);
            displayedPlayerIds.delete(playerData.player_id);
        });

        playerComparisonArea.appendChild(newBox);
    }

    searchInput.addEventListener('input', handleSearch);
    initializeApp();
});
