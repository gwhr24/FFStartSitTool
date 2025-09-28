document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    // PASTE THE RAW GITHUB URL FOR YOUR JSON FILE HERE
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

    // --- INITIALIZATION ---
    async function initializeApp() {
        try {
            const [playersResponse, oddsResponse, statsResponse] = await Promise.all([
                fetch('https://api.sleeper.app/v1/players/nfl'),
                fetch('https://ssportsgameodds.com/new/api/v2/odds/2/2/2'),
                fetch(defensiveStatsURL)
            ]);
            
            if (!playersResponse.ok) throw new Error('Failed to fetch player data');
            if (!oddsResponse.ok) throw new Error('Failed to fetch odds data');
            if (!statsResponse.ok) throw new Error('Failed to fetch defensive stats from GitHub');

            allPlayers = await playersResponse.json();
            const rawOddsData = await oddsResponse.json();
            gameOddsData = rawOddsData.data.events;
            defensiveStats = await statsResponse.json();
            
            console.log('All data loaded successfully.');
        } catch (error) {
            console.error("Initialization Error:", error);
            alert('Failed to load initial data. One of the data sources may be offline or the URL is incorrect. Please refresh to try again.');
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
        if (!game) return { error: "Game not found for this player" };
        
        const opponentAbbr = game.home_team_abbr === playerData.team ? game.away_team_abbr : game.home_team_abbr;
        const opponentStats = defensiveStats[opponentAbbr] || {};
        
        const odds = game.odds?.[0];
        const spread = odds ? (game.home_team_abbr === playerData.team ? odds.spread.home_team : odds.spread.away_team) : 'N/A';
        
        // Determine which defensive stats to show based on player position
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
        
        // Find player props
        const props = [];
        if (game.player_props?.length > 0) {
            game.player_props.forEach(prop => {
                if (prop.player_name.includes(playerData.first_name) && prop.player_name.includes(playerData.last_name)) {
                    props.push({ label: prop.prop_name, value: prop.over_under });
                }
            });
        }

        return {
            opponent: opponentAbbr,
            spread: `${playerData.team} ${spread}`,
            total: odds?.over_under || 'N/A',
            gameTime: new Date(game.start_date).toLocaleString(),
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
