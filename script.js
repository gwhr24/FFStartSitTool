// Wait for the HTML document to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM ELEMENT REFERENCES ---
    const searchInput = document.getElementById('player-search');
    const searchResultsContainer = document.getElementById('search-results');
    const playerComparisonArea = document.getElementById('player-comparison-area');
    const playerBoxTemplate = document.querySelector('.player-box-template');

    // --- STATE MANAGEMENT ---
    let allPlayers = {}; // Stores all NFL players from the Sleeper API
    let weeklyProjections = {}; // Stores all weekly projections from the Sleeper API
    let displayedPlayerIds = new Set(); // Tracks which players are currently displayed

    // --- INITIALIZATION ---
    // Fetches all necessary data from the Sleeper API when the app starts.
    async function initializeApp() {
        console.log("Initializing app...");
        try {
            // First, get the current NFL state to find out the season and week
            const stateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
            if (!stateResponse.ok) throw new Error('Failed to fetch NFL state');
            const nflState = await stateResponse.json();
            const week = nflState.display_week;
            const season = nflState.season;

            // FIX: Changed API endpoint from /stats/ to /projections/
            const [playersResponse, projectionsResponse] = await Promise.all([
                fetch('https://api.sleeper.app/v1/players/nfl'),
                fetch(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`)
            ]);
            
            if (!playersResponse.ok) throw new Error('Failed to fetch player data');
            if (!projectionsResponse.ok) throw new Error('Failed to fetch projections data');

            allPlayers = await playersResponse.json();
            weeklyProjections = await projectionsResponse.json();
            
            console.log(`Successfully loaded player and projection data for Week ${week}.`);
        } catch (error) {
            console.error("Initialization Error:", error);
        }
    }

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
            .slice(0, 7);

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
            
            // FIX: Using player_id for the official headshot URL
            const avatar = `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`;
            const defaultAvatar = 'https://sleepercdn.com/images/v2/icons/player_default.webp';

            resultItem.innerHTML = `
                <img src="${avatar}" onerror="this.onerror=null;this.src='${defaultAvatar}';" alt="${player.full_name}" class="search-result-avatar">
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

    // --- PLAYER SELECTION & DATA GATHERING ---
    async function selectPlayer(playerId) {
        if (displayedPlayerIds.has(playerId)) return alert('Player is already displayed.');
        if (displayedPlayerIds.size >= 6) return alert('Maximum of 6 players can be displayed.');

        searchInput.value = '';
        searchResultsContainer.style.display = 'none';

        try {
            displayedPlayerIds.add(playerId);
            const playerData = allPlayers[playerId];
            const gameData = await fetchGameData(playerData.team);
            const projections = weeklyProjections[playerId] || {};

            createPlayerBox(playerData, gameData, projections);
        } catch (error) {
            console.error(`Error processing player ${playerId}:`, error);
            displayedPlayerIds.delete(playerId);
            alert('Could not fetch all data for the selected player.');
        }
    }
    
    async function fetchGameData(teamAbbr) {
        if (!teamAbbr) return { opponent: 'BYE', gameTime: 'N/A' };
        
        const scheduleResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
        if (!scheduleResponse.ok) throw new Error('Failed to fetch schedule data');
        const schedule = await scheduleResponse.json();
        
        const game = schedule.events.find(event => 
            event.competitions[0].competitors.some(c => c.team.abbreviation === teamAbbr)
        );

        if (!game) return { opponent: 'BYE', gameTime: 'N/A' };

        const competition = game.competitions[0];
        const opponentTeam = competition.competitors.find(c => c.team.abbreviation !== teamAbbr);
        
        return {
            opponent: opponentTeam.team.abbreviation,
            gameTime: new Date(competition.date).toLocaleString(),
        };
    }

    // --- DOM MANIPULATION ---
    function createPlayerBox(playerData, gameData, projections) {
        const newBox = playerBoxTemplate.cloneNode(true);
        newBox.classList.remove('player-box-template');
        newBox.style.display = 'block';

        // FIX: Using player_id for the official headshot URL and adding a fallback
        const avatar = `https://sleepercdn.com/content/nfl/players/thumb/${playerData.player_id}.jpg`;
        const defaultAvatar = 'https://sleepercdn.com/images/v2/icons/player_default.webp';
        const headshotElement = newBox.querySelector('.player-headshot');
        headshotElement.src = avatar;
        headshotElement.onerror = () => { headshotElement.src = defaultAvatar; }; // Fallback if image fails to load

        newBox.querySelector('.player-name').textContent = playerData.full_name;
        newBox.querySelector('.player-team').textContent = `${playerData.position}, ${playerData.team || 'FA'}`;
        
        if (gameData) {
            newBox.querySelector('.opponent').textContent = gameData.opponent || 'N/A';
            newBox.querySelector('.game-time').textContent = gameData.gameTime;
        }

        newBox.querySelector('.stat-value').textContent = Math.floor(Math.random() * 32) + 1;
        newBox.querySelector('.stat-label').textContent = `FPs to ${playerData.position}`;
        
        const propsList = newBox.querySelector('.player-projections ul');
        propsList.innerHTML = '';
        const relevantProps = {
            'rec_yd': 'Rec Yds:', 'rec': 'Receptions:', 'pass_yd': 'Pass Yds:',
            'pass_td': 'Pass TDs:', 'rush_yd': 'Rush Yds:', 'rush_td': 'Rush TDs:'
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

        newBox.querySelector('.close-btn').addEventListener('click', () => {
            playerComparisonArea.removeChild(newBox);
            displayedPlayerIds.delete(playerData.player_id);
        });

        playerComparisonArea.appendChild(newBox);
    }

    searchInput.addEventListener('input', handleSearch);
    initializeApp();
});
