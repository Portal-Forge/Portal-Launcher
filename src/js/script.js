let allGames = [];
let filteredGames = [];
let currentSort = "name";

// ---------------- Utilities ----------------
function formatPlaytime(minutes) {
    if (!minutes) return "Never played";

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) return `${minutes}m`;
    if (hours < 10) return `${hours}h ${remainingMinutes}m`;
    return `${hours}h`;
}

// ---------------- Rendering ----------------
function createGameCard(game) {
    const playtimeText = formatPlaytime(game.playtime);
    const thumbnailUrl = game.thumbnail || "https://via.placeholder.com/460x215/2a2a2a/666666?text=No+Image";

    return `
        <div class="bg-[#2a2a2a] rounded-lg overflow-hidden hover:bg-[#333] transition-all duration-200 hover:scale-[1.02] cursor-pointer group"
             onclick="launchGame('${game.appid}', '${game.title}')">
            <div class="relative">
                <img src="${thumbnailUrl}"
                     alt="${game.title}"
                     class="w-full h-32 object-cover group-hover:brightness-110 transition-all"
                     onerror="this.src='https://via.placeholder.com/460x215/2a2a2a/666666?text=No+Image'"/>
                <div class="absolute top-2 right-2 bg-black/70 rounded px-2 py-1 text-xs">
                    ${playtimeText}
                </div>
            </div>
            <div class="p-3">
                <h3 class="font-medium text-sm text-white truncate group-hover:text-blue-400 transition-colors">
                    ${game.title}
                </h3>
                <p class="text-xs text-gray-400 mt-1">Steam Game</p>
            </div>
        </div>
    `;
}

function createSidebarItem(game) {
    return `
        <li>
            <a href="#"
               class="flex items-center space-x-3 px-3 py-2 rounded-md text-gray-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
               onclick="scrollToGame('${game.appid}')">
                <span class="material-symbols-outlined text-sm">videogame_asset</span>
                <span class="text-sm truncate">${game.title}</span>
            </a>
        </li>
    `;
}

function renderGames() {
    const gamesGrid = document.getElementById("games-grid");
    const sidebarLibrary = document.getElementById("sidebar-library");
    const gamesCount = document.getElementById("games-count");

    if (!filteredGames.length) {
        gamesGrid.innerHTML = `
            <div class="col-span-full flex items-center justify-center py-16">
                <div class="text-center">
                    <span class="material-symbols-outlined text-4xl text-gray-400 mb-2">videogame_asset_off</span>
                    <p class="text-gray-400">No games found</p>
                </div>
            </div>
        `;
        sidebarLibrary.innerHTML = `<li class="text-center text-gray-500 py-4">No games found</li>`;
        gamesCount.textContent = "0 games";
        return;
    }

    gamesGrid.innerHTML = filteredGames.map(createGameCard).join("");
    sidebarLibrary.innerHTML = filteredGames.slice(0, 20).map(createSidebarItem).join("");
    gamesCount.textContent = `${filteredGames.length} games`;
}

// ---------------- Sorting & Filtering ----------------
function sortGames(type) {
    currentSort = type;

    document.querySelectorAll(".sort-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`sort-${type}`).classList.add("active");

    switch (type) {
        case "name":
            filteredGames.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case "playtime":
            filteredGames.sort((a, b) => b.playtime - a.playtime);
            break;
        case "recent":
            filteredGames.sort((a, b) => b.title.localeCompare(a.title)); // Placeholder
            break;
    }

    renderGames();
}

function filterGames(searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredGames = allGames.filter(g => g.title.toLowerCase().includes(term));
    sortGames(currentSort);
}

// ---------------- Data & Actions ----------------
async function loadGames() {
    try {
        const games = await window.electronAPI.getGames();
        allGames = games;
        filteredGames = [...games];
        sortGames(currentSort);
    } catch (error) {
        console.error("Failed to load games:", error);
        document.getElementById("games-grid").innerHTML = `
            <div class="col-span-full flex items-center justify-center py-16">
                <div class="text-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2">error</span>
                    <p class="text-red-400">Failed to load games</p>
                    <p class="text-gray-500 text-sm mt-2">Make sure Steam is installed</p>
                </div>
            </div>
        `;
    }
}

async function launchGame(appid, title) {
    console.log(`Launching game: ${title} (${appid})`);
    try {
        const success = await window.electronAPI.launchGame(appid);
        if (!success) alert(`Failed to launch ${title}`);
    } catch (err) {
        console.error(err);
        alert(`Error launching ${title}`);
    }
}

// ---------------- Events ----------------
document.addEventListener("DOMContentLoaded", () => {
    loadGames();

    const libraryFilter = document.getElementById("library-filter");
    const mainSearch = document.getElementById("main-search");

    [libraryFilter, mainSearch].forEach(input => {
        input.addEventListener("input", e => {
            filterGames(e.target.value);

            if (input === libraryFilter) {
                mainSearch.value = e.target.value;
            } else {
                libraryFilter.value = e.target.value;
            }
        });
    });

    document.getElementById("sort-name").addEventListener("click", () => sortGames("name"));
    document.getElementById("sort-playtime").addEventListener("click", () => sortGames("playtime"));
    document.getElementById("sort-recent").addEventListener("click", () => sortGames("recent"));

    document.getElementById("refresh-games").addEventListener("click", () => {
        document.getElementById("games-count").textContent = "Refreshing...";
        loadGames();
    });
});

// ---------------- Styles ----------------
const style = document.createElement("style");
style.textContent = `
    .sort-btn.active {
        background-color: #611bf8 !important;
        color: white !important;
    }
`;
document.head.appendChild(style);
