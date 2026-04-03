const MUSIC_SERVER = "https://dl2.mokhtalefmusic.com/Music/";


let allMusicData = {};

// DOM Elements
const navHome = document.getElementById("nav-home");
const navSearchBtn = document.getElementById("nav-search-btn");
const searchContainer = document.getElementById("search-container");
const searchInput = document.getElementById("search-input");
const viewTitle = document.getElementById("view-title");
const songListEl = document.getElementById("song-list");
const artistListEl = document.getElementById("artist-list");


// Player DOM Elements
const audioPlayer = document.getElementById("audio-player");
const btnPlay = document.getElementById("btn-play");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const npTitle = document.getElementById("np-title");
const npArtist = document.getElementById("np-artist");
const btnMute = document.getElementById("btn-mute");
const volIcon = document.getElementById("vol-icon");

// Progress DOM
const progressWrapper = document.getElementById("progress-wrapper");
const progressFill = document.getElementById("progress-fill");
const progressThumb = document.getElementById("progress-thumb");
const timeCurrent = document.getElementById("time-current");
const timeTotal = document.getElementById("time-total");
const volumeWrapper = document.getElementById("volume-wrapper");
const volumeFill = document.getElementById("volume-fill");

// State Variables
let selectedArtist = null;
let currentSearchQuery = "";
let currentView = "home"; // 'home', 'search', 'artist'

let playQueue = [];
let currentQueueIndex = 0;
let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists')) || [];
const LOCAL_STORAGE_QUEUE_KEY = 'playQueue';
const LOCAL_STORAGE_INDEX_KEY = 'currentQueueIndex';
let isDraggingProgress = false;
let currentVolume = 1.0;
let searchDebounceTimer = null;
const SONGS_PER_ARTIST_INITIAL = 5;
const ARTISTS_PER_PAGE = 15;

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
    .then(reg => console.log('Service Worker registered', reg))
    .catch(err => console.log('Service Worker registration failed', err));
}

let deferredPrompt;
const installAppBtn = document.getElementById('install-app-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if(installAppBtn) installAppBtn.style.display = 'block';
});

if(installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        deferredPrompt = null;
        installAppBtn.style.display = 'none';
      }
    });
}

// Initialize
function init() {
    loadMusicData();
}

init();

// UI setup
function setupUI() {
    const settingsBtn = document.getElementById('nav-settings-btn');
    if(settingsBtn) settingsBtn.style.display = 'none'; 
}

// Client-side Crawler
async function loadMusicData() {
    try {
        const res = await fetch('./music_data.json');
        if (res.ok) {
            allMusicData = await res.json();
            renderArtistList();
            renderHome();
            renderSidebarPlaylists();
            loadQueueFromStorage();
        }
    } catch (e) {
        console.error("Error loading music data:", e);
        document.querySelector('.song-list-view').innerHTML = `<li class="empty-state">Unable to load music. `+e.message+`</li>`;
    }
}



function showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function parseFilename(filename) {
    let decoded = filename;
    try { decoded = decodeURIComponent(filename); } catch(e) {}
    
    let cleanName = decoded.replace(/\.(mp3|webp|jpg|jpeg|png)$/i, '');
    cleanName = cleanName.replace(/\s*-\s*(128|320)\s*$/i, '');
    
    if (cleanName.includes(' - ')) {
        const parts = cleanName.split(' - ');
        return { artist: parts[0].trim(), title: parts[1].trim() };
    }
    return { artist: "Unknown Artist", title: cleanName.trim() };
}




navHome.addEventListener('click', () => {
    currentView = 'home';
    selectedArtist = null;
    currentSearchQuery = '';
    searchInput.value = '';
    
    navHome.classList.add('active');
    navSearchBtn.classList.remove('active');
    searchContainer.style.display = 'none';
    
    Array.from(artistListEl.children).forEach(li => li.classList.remove('active'));
    renderHome();
});

navSearchBtn.addEventListener('click', () => {
    currentView = 'search';
    selectedArtist = null;
    
    navSearchBtn.classList.add('active');
    navHome.classList.remove('active');
    searchContainer.style.display = 'flex';
    searchInput.focus();
    
    Array.from(artistListEl.children).forEach(li => li.classList.remove('active'));
    handleSearch();
});

// Mobile Navigation
const mNavHome = document.getElementById('m-nav-home');
const mNavSearch = document.getElementById('m-nav-search');
const mNavLibrary = document.getElementById('m-nav-library');

function updateMobileNavActive(id) {
    [mNavHome, mNavSearch, mNavLibrary].forEach(el => {
        if(el) el.classList.toggle('active', el.id === id);
    });
}

if(mNavHome) {
    mNavHome.addEventListener('click', () => {
        navHome.click();
        updateMobileNavActive('m-nav-home');
    });
}

if(mNavSearch) {
    mNavSearch.addEventListener('click', () => {
        navSearchBtn.click();
        updateMobileNavActive('m-nav-search');
    });
}

if(mNavLibrary) {
    mNavLibrary.addEventListener('click', () => {
        currentView = 'library';
        selectedArtist = null;
        viewTitle.innerText = "Your Library";
        songListEl.className = "song-list-view";
        renderLibrary();
        updateMobileNavActive('m-nav-library');
    });
}

function renderLibrary() {
    songListEl.innerHTML = "";
    const artists = Object.keys(allMusicData).sort();
    
    if (artists.length === 0) {
        songListEl.innerHTML = `<li class="empty-state">No artists found. Try scanning!</li>`;
        return;
    }

    artists.forEach(artist => {
        const li = document.createElement("li");
        li.className = "artist-list-item";
        li.innerHTML = `
            <div class="library-artist-icon"></div>
            <div class="song-info-container">
                <div class="song-title">${artist}</div>
                <div class="song-artist">${allMusicData[artist].length} songs</div>
            </div>
        `;
        li.onclick = () => {
            currentView = 'artist';
            selectedArtist = artist;
            renderSongsList(artist);
        };
        songListEl.appendChild(li);
    });
}

// Rendering views
function renderHome() {
    viewTitle.innerText = "Good Evening";
    songListEl.className = "song-grid";
    songListEl.innerHTML = "";

    let allSongs = [];
    const artists = Object.keys(allMusicData);
    for (let i = 0; i < artists.length; i++) {
        const artist = artists[i];
        const songs = allMusicData[artist];
        for (let j = 0; j < songs.length; j++) {
            allSongs.push({ ...songs[j], artist });
            if (allSongs.length >= 24) break;
        }
        if (allSongs.length >= 24) break;
    }
    
    if (allSongs.length === 0) {
        songListEl.innerHTML = `<li class="empty-state">No music found. Try scanning!</li>`;
        return;
    }
    
    allSongs = allSongs.slice(0, 24);

    allSongs.forEach(song => {
        const li = document.createElement("li");
        const coverHtml = song.cover_url 
            ? `<img src="${song.cover_url}" alt="cover" style="width:100%; height:100%; object-fit:cover;">`
            : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

        li.innerHTML = `
            <div class="card-image-wrapper">
                ${coverHtml}
                <button class="card-play-btn">
                     <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>
            <div class="song-title">${song.title}</div>
            <div class="song-artist">${song.artist}</div>
        `;
        
        li.querySelector('.card-play-btn').onclick = (e) => {
            e.stopPropagation();
            playSongNow(song, allSongs);
        };
        
        li.onclick = () => {
            playSongNow(song, allSongs);
        }

        songListEl.appendChild(li);
    });
}

function renderArtistList() {
    const artists = Object.keys(allMusicData).sort();
    if (artists.length === 0) {
        artistListEl.innerHTML = "<li style='cursor:default;'>No artists found</li>";
        return;
    }

    const html = artists.map(artist => {
        const isActive = (artist === selectedArtist && currentView === 'artist') ? 'active' : '';
        const safeArtist = artist.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        return `<li class="sidebar-artist-item ${isActive}" data-artist="${safeArtist}">${artist}</li>`;
    }).join("");
    
    artistListEl.innerHTML = html;
    
    // Event delegation
    artistListEl.onclick = (e) => {
        const li = e.target.closest('li.sidebar-artist-item');
        if (li) {
            const artist = li.getAttribute('data-artist');
            currentView = 'artist';
            selectedArtist = artist;
            currentSearchQuery = "";
            searchInput.value = "";
            navHome.classList.remove('active');
            navSearchBtn.classList.remove('active');
            searchContainer.style.display = 'none';
            
            artistListEl.querySelectorAll('li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            
            renderSongsList(artist);
        }
    };
}

function renderSongsList(artistName) {
    viewTitle.innerText = artistName;
    songListEl.className = "song-list-view";
    songListEl.innerHTML = "";

    const songs = allMusicData[artistName] || [];
    if(songs.length === 0) {
        songListEl.innerHTML = `<li class="empty-state">No songs found for this artist.</li>`;
        return;
    }

    songs.forEach((song, index) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="song-index">
                <span class="song-index-num">${index + 1}</span>
                <svg viewBox="0 0 24 24" class="song-play-icon"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="song-info-container">
                <div class="song-title">${song.title}</div>
            </div>
            <button class="queue-btn" title="Add to Queue">Add</button>
        `;
        
        li.onclick = () => playSongNow({ ...song, artist: artistName }, songs.map(s => ({...s, artist: artistName})));
        
        li.querySelector('.queue-btn').onclick = (e) => {
            e.stopPropagation();
            addToQueue(song.url, song.title, artistName, song.cover_url);
        };

        songListEl.appendChild(li);
    });
}

// Search Logic — debounced to prevent overload on large datasets
searchInput.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value.toLowerCase().trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => handleSearch(), 300);
});

function handleSearch() {
    viewTitle.innerText = currentSearchQuery ? `Results for "${currentSearchQuery}"` : "Search";
    songListEl.className = "search-results-view";
    songListEl.innerHTML = "";

    if (!currentSearchQuery) {
        songListEl.innerHTML = `<li class="empty-state">Type an artist or song name to search</li>`;
        return;
    }

    // Build grouped results: { artistName: [songs...] }
    // Priority: artist-name matches first, then song-title-only matches
    const artistNameMatches = {};  // artist name itself matches query
    const songOnlyMatches = {};    // only song titles match (not artist name)

    for (const [artist, songs] of Object.entries(allMusicData)) {
        const artistMatches = artist.toLowerCase().includes(currentSearchQuery);

        if (artistMatches) {
            // All songs from this artist go in (artist name matched)
            artistNameMatches[artist] = songs;
        } else {
            // Only include songs whose title matches
            const titleHits = songs.filter(s => s.title.toLowerCase().includes(currentSearchQuery));
            if (titleHits.length > 0) {
                songOnlyMatches[artist] = titleHits;
            }
        }
    }

    // Merge: artist-name matches first, then song-only matches
    const groupedResults = [];
    for (const [artist, songs] of Object.entries(artistNameMatches)) {
        groupedResults.push({ artist, songs, isArtistMatch: true });
    }
    for (const [artist, songs] of Object.entries(songOnlyMatches)) {
        groupedResults.push({ artist, songs, isArtistMatch: false });
    }

    // Sort: artist-name matches first, then by number of songs descending
    groupedResults.sort((a, b) => {
        if (a.isArtistMatch !== b.isArtistMatch) return a.isArtistMatch ? -1 : 1;
        return b.songs.length - a.songs.length;
    });

    if (groupedResults.length === 0) {
        songListEl.innerHTML = `<li class="empty-state">No matching results found</li>`;
        return;
    }

    // Count totals for summary
    const totalArtists = groupedResults.length;
    const totalSongs = groupedResults.reduce((sum, g) => sum + g.songs.length, 0);

    // Summary badge
    const summaryEl = document.createElement('div');
    summaryEl.className = 'search-summary';
    summaryEl.innerHTML = `Found <strong>${totalSongs.toLocaleString()}</strong> songs across <strong>${totalArtists.toLocaleString()}</strong> artists`;
    songListEl.appendChild(summaryEl);

    // Render only first batch of artist groups
    let artistsRendered = 0;
    const renderBatch = (startIdx, count) => {
        const end = Math.min(startIdx + count, groupedResults.length);
        for (let i = startIdx; i < end; i++) {
            renderArtistGroup(groupedResults[i]);
            artistsRendered++;
        }

        // If more artists remain, add "Load More" button
        const existingLoadMore = songListEl.querySelector('.search-load-more');
        if (existingLoadMore) existingLoadMore.remove();

        if (artistsRendered < groupedResults.length) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'search-load-more';
            loadMoreBtn.innerHTML = `Show more artists (${groupedResults.length - artistsRendered} remaining)`;
            loadMoreBtn.onclick = () => renderBatch(artistsRendered, ARTISTS_PER_PAGE);
            songListEl.appendChild(loadMoreBtn);
        }
    };

    renderBatch(0, ARTISTS_PER_PAGE);
}

function renderArtistGroup(group) {
    const { artist, songs, isArtistMatch } = group;
    const section = document.createElement('div');
    section.className = 'search-artist-group';

    // Artist header — clickable to navigate to full artist view
    const header = document.createElement('div');
    header.className = 'search-artist-header';
    header.innerHTML = `
        <div class="search-artist-info">
            <div class="search-artist-avatar"></div>
            <div>
                <div class="search-artist-name">${artist}</div>
                <div class="search-artist-meta">${songs.length} song${songs.length !== 1 ? 's' : ''}${isArtistMatch ? '' : ' matched'}</div>
            </div>
        </div>
        <button class="search-play-all-btn" title="Play all from ${artist}">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
    `;

    // Click artist name to go to full artist page
    header.querySelector('.search-artist-info').onclick = () => {
        currentView = 'artist';
        selectedArtist = artist;
        currentSearchQuery = '';
        searchInput.value = '';
        navHome.classList.remove('active');
        navSearchBtn.classList.remove('active');
        searchContainer.style.display = 'none';
        renderArtistList();
        renderSongsList(artist);
    };

    // Play all button
    header.querySelector('.search-play-all-btn').onclick = (e) => {
        e.stopPropagation();
        const allSongs = songs.map(s => ({ ...s, artist }));
        playSongNow(allSongs[0], allSongs);
    };

    section.appendChild(header);

    // Song list within this group
    const songContainer = document.createElement('div');
    songContainer.className = 'search-songs-container';

    const songsToShow = songs.slice(0, SONGS_PER_ARTIST_INITIAL);
    const hasMore = songs.length > SONGS_PER_ARTIST_INITIAL;

    songsToShow.forEach((song, index) => {
        songContainer.appendChild(createSearchSongItem(song, artist, index, songs));
    });

    if (hasMore) {
        const showMoreBtn = document.createElement('button');
        showMoreBtn.className = 'search-show-more-songs';
        showMoreBtn.innerHTML = `Show all ${songs.length} songs from ${artist}`;
        showMoreBtn.onclick = () => {
            // Remove the button
            showMoreBtn.remove();
            // Render remaining songs
            for (let i = SONGS_PER_ARTIST_INITIAL; i < songs.length; i++) {
                songContainer.appendChild(createSearchSongItem(songs[i], artist, i, songs));
            }
        };
        songContainer.appendChild(showMoreBtn);
    }

    section.appendChild(songContainer);
    songListEl.appendChild(section);
}

function createSearchSongItem(song, artist, index, allSongsInGroup) {
    const li = document.createElement('div');
    li.className = 'search-song-item';
    li.innerHTML = `
        <div class="song-index">
            <span class="song-index-num">${index + 1}</span>
            <svg viewBox="0 0 24 24" class="song-play-icon"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="song-info-container">
            <div class="song-title">${song.title}</div>
        </div>
        <button class="queue-btn" title="Add to Queue">Add</button>
    `;

    const contextList = allSongsInGroup.map(s => ({ ...s, artist }));
    li.onclick = () => playSongNow({ ...song, artist }, contextList);
    li.querySelector('.queue-btn').onclick = (e) => {
        e.stopPropagation();
        addToQueue(song.url, song.title, artist, song.cover_url);
    };

    return li;
}

// --- Player Logic ---

// Preloader for queue auto-advance (when song ends, next starts instantly)
let preloadAudio = new Audio();
preloadAudio.preload = 'auto';

function playSongNow(songObj, contextList = []) {
    if(contextList.length > 0) {
        playQueue = [...contextList];
        const idx = playQueue.findIndex(s => s.url === songObj.url);
        currentQueueIndex = idx !== -1 ? idx : 0;
    } else {
        playQueue = [songObj];
        currentQueueIndex = 0;
    }
    loadCurrentSong();
    saveQueueToStorage();
    renderQueuePanel();
}

function addToQueue(url, title, artist, cover_url = null) {
    if(!playQueue.find(s => s.url === url)) { // prevent exact duplicates for simplicity
        playQueue.push({url, title, artist, cover_url});
        if (audioPlayer.paused && playQueue.length === 1) {
            currentQueueIndex = 0;
            loadCurrentSong();
        } else {
            showToast("Added to queue");
            preloadNextInQueue();
        }
        saveQueueToStorage();
        renderQueuePanel();
    }
}

function updateQueueBadge() {
    const badge = document.getElementById("queue-badge");
    if(badge) {
        if(playQueue.length > 0) {
            badge.style.display = "flex";
            badge.innerText = playQueue.length;
        } else {
            badge.style.display = "none";
        }
    }
}

function saveQueueToStorage() {
    localStorage.setItem(LOCAL_STORAGE_QUEUE_KEY, JSON.stringify(playQueue));
    localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, currentQueueIndex.toString());
    updateQueueBadge();
}

function loadQueueFromStorage() {
    try {
        const storedQueue = localStorage.getItem(LOCAL_STORAGE_QUEUE_KEY);
        const storedIndex = localStorage.getItem(LOCAL_STORAGE_INDEX_KEY);
        if(storedQueue) {
            playQueue = JSON.parse(storedQueue);
            currentQueueIndex = parseInt(storedIndex, 10) || 0;
            if (playQueue.length > 0 && currentQueueIndex >= 0 && currentQueueIndex < playQueue.length) {
                // Don't auto-play, just load the UI
                const song = playQueue[currentQueueIndex];
                updatePlayerUI(song);
                audioPlayer.src = song.url;
                updatePlayState(false);
            }
            updateQueueBadge();
        }
    } catch (e) {
        console.log("Error loading queue from storage");
    }
}

function updatePlayerUI(song) {
    npTitle.innerText = song.title;
    npArtist.innerText = song.artist || "Unknown Artist";
    const npArt = document.getElementById("np-art");
    if (song.cover_url) {
        npArt.innerHTML = `<img src="${song.cover_url}" alt="cover" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
    } else {
        npArt.innerHTML = `<svg viewBox="0 0 24 24"><path fill="#b3b3b3" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
    }
    progressFill.style.width = '0%';
    progressThumb.style.left = '0%';
    timeCurrent.innerText = '0:00';
    timeTotal.innerText = '0:00';
    updatePlayState(true);
}

function loadCurrentSong() {
    if (currentQueueIndex >= 0 && currentQueueIndex < playQueue.length) {
        const song = playQueue[currentQueueIndex];
        updatePlayerUI(song);
        audioPlayer.src = song.url;
        audioPlayer.play().catch(() => {});
        // Start preloading the next song in queue for auto-advance
        preloadNextInQueue();
    }
}

function preloadNextInQueue() {
    const nextIdx = currentQueueIndex + 1;
    if (nextIdx < playQueue.length) {
        const nextSong = playQueue[nextIdx];
        if (preloadAudio.src !== nextSong.url) {
            preloadAudio.src = nextSong.url;
            preloadAudio.load();
        }
    }
}

// Queue auto-advance: when a song ends, use preloaded audio for instant start
audioPlayer.addEventListener('ended', () => {
    if (playQueue.length === 0) return;
    currentQueueIndex++;
    if (currentQueueIndex < playQueue.length) {
        const song = playQueue[currentQueueIndex];
        updatePlayerUI(song);

        // Use preloaded audio if available — instant gapless playback
        if (preloadAudio.src && preloadAudio.src === song.url) {
            audioPlayer.src = preloadAudio.src;
            audioPlayer.currentTime = 0;
            audioPlayer.play().catch(() => {});
        } else {
            audioPlayer.src = song.url;
            audioPlayer.play().catch(() => {});
        }
        // Preload the next one
        preloadNextInQueue();
    } else {
        currentQueueIndex = 0;
        audioPlayer.pause();
        updatePlayState(false);
    }
});

btnPlay.addEventListener('click', () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
});

// Next/Prev buttons — normal behavior, no preload
btnNext.addEventListener('click', () => {
    if (playQueue.length === 0) return;
    currentQueueIndex++;
    if (currentQueueIndex < playQueue.length) {
        loadCurrentSong();
    } else {
        currentQueueIndex = 0;
        audioPlayer.pause();
        updatePlayState(false);
    }
});

btnPrev.addEventListener('click', () => {
    if (playQueue.length === 0) return;
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
    } else {
        currentQueueIndex--;
        if (currentQueueIndex < 0) currentQueueIndex = 0;
        loadCurrentSong();
    }
});

audioPlayer.addEventListener('play', () => updatePlayState(true));
audioPlayer.addEventListener('pause', () => updatePlayState(false));

function updatePlayState(isPlaying) {
    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

function formatTime(seconds) {
    if(isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

audioPlayer.addEventListener('timeupdate', () => {
    if (!isDraggingProgress && audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressFill.style.width = `${progress}%`;
        progressThumb.style.left = `${progress}%`;
        timeCurrent.innerText = formatTime(audioPlayer.currentTime);
        timeTotal.innerText = formatTime(audioPlayer.duration);
    }
});

audioPlayer.addEventListener('loadedmetadata', () => {
    timeTotal.innerText = formatTime(audioPlayer.duration);
});

progressWrapper.addEventListener('click', (e) => {
    if(!audioPlayer.duration) return;
    const rect = progressWrapper.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPlayer.currentTime = percent * audioPlayer.duration;
});

progressWrapper.addEventListener('mousedown', () => isDraggingProgress = true);
document.addEventListener('mouseup', () => {
    if(isDraggingProgress) isDraggingProgress = false;
});
document.addEventListener('mousemove', (e) => {
    if (isDraggingProgress && audioPlayer.duration) {
        const rect = progressWrapper.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        progressFill.style.width = `${percent * 100}%`;
        progressThumb.style.left = `${percent * 100}%`;
        audioPlayer.currentTime = percent * audioPlayer.duration;
    }
});

function setVolume(val) {
    currentVolume = Math.max(0, Math.min(1, val));
    audioPlayer.volume = currentVolume;
    volumeFill.style.width = `${currentVolume * 100}%`;
    
    if (currentVolume === 0) {
        volIcon.innerHTML = `<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
    } else {
        volIcon.innerHTML = `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
    }
}

volumeWrapper.addEventListener('click', (e) => {
    const rect = volumeWrapper.getBoundingClientRect();
    setVolume((e.clientX - rect.left) / rect.width);
});

btnMute.addEventListener('click', () => {
    if (audioPlayer.volume > 0) {
        setVolume(0);
    } else {
        setVolume(1);
    }
});

// init() is already called on line 101 — no duplicate call needed

// Additional CSS for mobile library icons
const style = document.createElement('style');
style.textContent = `
    .library-artist-icon {
        width: 48px;
        height: 48px;
        background-color: #282828;
        border-radius: 50%;
        margin-right: 16px;
        flex-shrink: 0;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }
    .artist-list-item {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        cursor: pointer;
    }
    .artist-list-item:hover {
        background-color: rgba(255,255,255,0.1);
    }
`;
document.head.appendChild(style);

/* =========================================================
   NEW FEATURES: Playlists, Queue, Mobile, Feedback
========================================================= */

// --- 1. Playlists Logic ---
function savePlaylists() {
    localStorage.setItem('userPlaylists', JSON.stringify(userPlaylists));
}

function createPlaylist(name) {
    if (!name.trim()) return;
    userPlaylists.push({ id: Date.now().toString(), name: name.trim(), songs: [] });
    savePlaylists();
    showToast(`Playlist "${name}" created`);
    renderSidebarPlaylists();
    document.getElementById('create-playlist-modal').style.display = 'none';
    document.getElementById('playlist-name-input').value = '';
}

function renderSidebarPlaylists() {
    const list = document.getElementById('sidebar-playlists');
    if (!list) return;
    
    if (userPlaylists.length > 0) {
        list.style.display = 'block';
        list.innerHTML = '';
        userPlaylists.forEach(pl => {
            const li = document.createElement('li');
            li.className = 'playlist-sidebar-item';
            li.style.cssText = 'padding: 12px; color: var(--text-secondary); cursor: pointer; border-radius: 8px; font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 12px; transition: all 0.2s;';
            li.innerHTML = `
                <div style="width:40px; height:40px; background:linear-gradient(135deg, #1db954, #121212); border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:white;"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                </div>
                <div style="flex:1; overflow:hidden;">
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pl.name}</div>
                    <div style="font-size:12px;">${pl.songs.length} songs</div>
                </div>
            `;
            li.onmouseover = () => { li.style.backgroundColor = 'var(--bg-hover)'; li.style.color = 'var(--text-primary)'; };
            li.onmouseout = () => { li.style.backgroundColor = 'transparent'; li.style.color = 'var(--text-secondary)'; };
            li.onclick = () => renderPlaylistDetail(pl);
            list.appendChild(li);
        });
    } else {
        list.style.display = 'none';
    }
}

function renderPlaylistDetail(playlist) {
    currentView = 'playlist';
    selectedArtist = null;
    viewTitle.innerText = playlist.name;
    songListEl.className = "song-list-view";
    songListEl.innerHTML = "";
    
    // Header for playlist controls
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'display:flex; gap:16px; margin-bottom:24px; padding:0 16px;';
    controlsDiv.innerHTML = `
        <button id="pl-play-all" style="background:var(--accent); color:#000; border:none; width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Play All">
             <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:currentColor;"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button id="pl-delete" style="background:transparent; color:#ff4444; border:1px solid #ff4444; padding:0 24px; border-radius:500px; font-weight:600; cursor:pointer;" title="Delete Playlist">
             Delete
        </button>
    `;
    songListEl.appendChild(controlsDiv);
    
    controlsDiv.querySelector('#pl-play-all').onclick = () => {
        if(playlist.songs.length > 0) playSongNow(playlist.songs[0], playlist.songs);
    };
    controlsDiv.querySelector('#pl-delete').onclick = () => {
        if(confirm(`Delete playlist "${playlist.name}"?`)) {
            userPlaylists = userPlaylists.filter(p => p.id !== playlist.id);
            savePlaylists();
            renderSidebarPlaylists();
            navHome.click();
        }
    };

    if(playlist.songs.length === 0) {
        const empty = document.createElement('li');
        empty.className = "empty-state";
        empty.innerText = "This playlist is empty. Add some songs!";
        songListEl.appendChild(empty);
        return;
    }

    playlist.songs.forEach((song, index) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="song-index">
                <span class="song-index-num">${index + 1}</span>
                <svg viewBox="0 0 24 24" class="song-play-icon"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="song-info-container">
                <div class="song-title">${song.title}</div>
                <div class="song-artist">${song.artist}</div>
            </div>
            <button class="queue-btn" title="Remove from Playlist">Remove</button>
        `;
        li.onclick = () => playSongNow(song, playlist.songs);
        li.querySelector('.queue-btn').onclick = (e) => {
            e.stopPropagation();
            playlist.songs.splice(index, 1);
            savePlaylists();
            renderPlaylistDetail(playlist);
            renderSidebarPlaylists();
        };
        songListEl.appendChild(li);
    });
}

// Map Create Playlist UI
document.getElementById('sidebar-create-playlist').onclick = () => {
    document.getElementById('create-playlist-modal').style.display = 'block';
};
const closePlaylistModal = document.getElementById('close-playlist-modal');
if(closePlaylistModal) closePlaylistModal.onclick = () => document.getElementById('create-playlist-modal').style.display = 'none';

document.getElementById('create-playlist-confirm').onclick = () => {
    createPlaylist(document.getElementById('playlist-name-input').value);
};

// Add to Playlist modal logic
let songToAdd = null;
function openAddToPlaylistModal(song) {
    if(!song) {
        showToast("No song selected");
        return;
    }
    songToAdd = song;
    const list = document.getElementById('add-to-playlist-list');
    list.innerHTML = '';
    
    if(userPlaylists.length === 0) {
        list.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:20px;">No playlists yet</div>';
    } else {
        userPlaylists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'playlist-modal-item';
            item.innerHTML = `
                <div class="playlist-icon"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2z"/></svg></div>
                <div style="flex:1;">
                    <div style="font-weight:600;">${pl.name}</div>
                    <div style="font-size:12px; color:var(--text-secondary);">${pl.songs.length} songs</div>
                </div>
            `;
            item.onclick = () => {
                if(!pl.songs.find(s => s.url === songToAdd.url)) {
                    pl.songs.push(songToAdd);
                    savePlaylists();
                    showToast(`Added to "${pl.name}"`);
                    renderSidebarPlaylists();
                } else {
                    showToast(`Already in "${pl.name}"`);
                }
                document.getElementById('add-to-playlist-modal').style.display = 'none';
            };
            list.appendChild(item);
        });
    }
    document.getElementById('add-to-playlist-modal').style.display = 'block';
}

const closeAddPlaylistModal = document.getElementById('close-add-playlist-modal');
if(closeAddPlaylistModal) closeAddPlaylistModal.onclick = () => document.getElementById('add-to-playlist-modal').style.display = 'none';

document.getElementById('add-to-playlist-new').onclick = () => {
    document.getElementById('add-to-playlist-modal').style.display = 'none';
    document.getElementById('create-playlist-modal').style.display = 'block';
};

// Map current song add buttons
document.getElementById('btn-add-to-playlist-bar').onclick = () => {
    if(playQueue.length > 0) openAddToPlaylistModal(playQueue[currentQueueIndex]);
};
document.getElementById('mpf-add-to-playlist').onclick = () => {
    if(playQueue.length > 0) openAddToPlaylistModal(playQueue[currentQueueIndex]);
};

// --- 2. Queue Panel Logic ---
const queuePanel = document.getElementById('queue-panel');
const queueOverlay = document.getElementById('queue-overlay');

document.getElementById('btn-queue-toggle').onclick = () => {
    queuePanel.classList.add('open');
    queueOverlay.classList.add('open');
    renderQueuePanel();
};
document.getElementById('btn-queue-close').onclick = () => {
    queuePanel.classList.remove('open');
    queueOverlay.classList.remove('open');
};
queueOverlay.onclick = () => {
    queuePanel.classList.remove('open');
    queueOverlay.classList.remove('open');
};

document.getElementById('btn-queue-clear').onclick = () => {
    if(playQueue.length === 0) return;
    const current = playQueue[currentQueueIndex];
    playQueue = [current]; // Keep only current
    currentQueueIndex = 0;
    saveQueueToStorage();
    renderQueuePanel();
};

document.getElementById('btn-queue-shuffle').onclick = () => {
    if(playQueue.length <= 1) return;
    const current = playQueue[currentQueueIndex];
    const rest = playQueue.filter((_, i) => i !== currentQueueIndex);
    // Fisher-Yates shuffle
    for(let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    playQueue = [current, ...rest];
    currentQueueIndex = 0;
    saveQueueToStorage();
    renderQueuePanel();
    showToast("Queue shuffled");
};

let draggedItemIndex = null;

function renderQueuePanel() {
    const npContainer = document.getElementById('queue-now-playing');
    const listContainer = document.getElementById('queue-list');
    npContainer.innerHTML = '';
    listContainer.innerHTML = '';
    
    if(playQueue.length === 0) {
        npContainer.innerHTML = '<div style="color:var(--text-secondary);">Queue is empty</div>';
        return;
    }

    // Render Now Playing
    const currentSong = playQueue[currentQueueIndex];
    if(currentSong) {
        npContainer.innerHTML = `
            <div style="font-size:12px; color:var(--accent); font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                <div class="currently-playing-indicator"><div></div><div></div><div></div></div>
                NOW PLAYING
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:48px;height:48px; background:var(--bg-surface-elevated); border-radius:4px; overflow:hidden;">
                    ${currentSong.cover_url ? `<img src="${currentSong.cover_url}" style="width:100%;height:100%;object-fit:cover;">` : ''}
                </div>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--accent);">${currentSong.title}</div>
                    <div style="font-size:14px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${currentSong.artist}</div>
                </div>
            </div>
        `;
    }

    // Render Next Up
    playQueue.forEach((song, idx) => {
        if(idx <= currentQueueIndex) return; // Skip played/current
        
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.draggable = true;
        el.dataset.index = idx;
        el.innerHTML = `
            <div class="queue-item-drag"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg></div>
            <div class="queue-item-info" style="flex:1; overflow:hidden; cursor:pointer;">
                <div style="font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${song.title}</div>
                <div style="font-size:13px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${song.artist}</div>
            </div>
            <button class="queue-item-remove" title="Remove" data-idx="${idx}"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
        `;
        
        // Single click to play
        el.querySelector('.queue-item-info').onclick = () => {
            currentQueueIndex = idx;
            loadCurrentSong();
        };
        
        // --- Mobile Touch Drag ---
        const dragHandle = el.querySelector('.queue-item-drag');
        dragHandle.addEventListener('touchstart', (e) => {
            e.preventDefault(); // prevent scrolling
            el.style.opacity = '0.5';
            el.style.background = 'var(--bg-surface-elevated)';
            el.style.position = 'relative';
            el.style.zIndex = '1000';
        }, {passive: false});

        dragHandle.addEventListener('touchmove', (e) => {
            e.preventDefault(); // stop scrolling
            const touch = e.touches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!targetEl) return;
            const targetItem = targetEl.closest('.queue-item');
            
            if (targetItem && targetItem !== el) {
                const list = document.getElementById('queue-list');
                const items = Array.from(list.querySelectorAll('.queue-item'));
                const dragIndex = items.indexOf(el);
                const dropIndex = items.indexOf(targetItem);
                
                if (dragIndex < dropIndex) {
                    targetItem.after(el);
                } else {
                    targetItem.before(el);
                }
            }
        }, {passive: false});

        dragHandle.addEventListener('touchend', (e) => {
            el.style.opacity = '';
            el.style.background = '';
            el.style.position = '';
            el.style.zIndex = '';
            
            const list = document.getElementById('queue-list');
            const items = Array.from(list.querySelectorAll('.queue-item'));
            const newTailOrder = items.map(node => playQueue[parseInt(node.dataset.index)]);
            
            playQueue.length = currentQueueIndex + 1; 
            playQueue.push(...newTailOrder); 
            
            saveQueueToStorage();
            renderQueuePanel(); 
        });

        // --- Desktop HTML5 Drag ---
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            el.style.opacity = '0.5';
            draggedItemIndex = parseInt(el.dataset.index);
        });
        
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const targetEl = e.target.closest('.queue-item');
            if(targetEl && targetEl !== el) {
                const list = document.getElementById('queue-list');
                const items = Array.from(list.querySelectorAll('.queue-item'));
                const dragIdx = items.findIndex(n => parseInt(n.dataset.index) === draggedItemIndex);
                const dropIdx = items.indexOf(targetEl);
                if (dragIdx > -1 && dropIdx > -1) {
                     const draggingNode = items[dragIdx];
                     if (dragIdx < dropIdx) targetEl.after(draggingNode);
                     else targetEl.before(draggingNode);
                }
            }
        });
        
        el.addEventListener('drop', (e) => {
            e.preventDefault();
        });

        el.addEventListener('dragend', () => { 
            el.style.opacity = ''; 
            
            const list = document.getElementById('queue-list');
            const items = Array.from(list.querySelectorAll('.queue-item'));
            const newTailOrder = items.map(node => playQueue[parseInt(node.dataset.index)]);
            
            playQueue.length = currentQueueIndex + 1; 
            playQueue.push(...newTailOrder); 
            
            saveQueueToStorage();
            renderQueuePanel();
        });
        
        // Remove button
        el.querySelector('.queue-item-remove').onclick = (e) => {
            e.stopPropagation();
            playQueue.splice(idx, 1);
            saveQueueToStorage();
            renderQueuePanel();
        };

        listContainer.appendChild(el);
    });
}

// --- 3. Mobile Player Full ---
const mpfPlayer = document.getElementById('mobile-player-full');
const playerBar = document.getElementById('player-bar');

playerBar.addEventListener('click', (e) => {
    // Prevent opening if clicking controls
    if(e.target.closest('.player-controls') || e.target.closest('.extra-controls')) return;
    if(window.innerWidth <= 768 && playQueue.length > 0) {
        mpfPlayer.classList.add('open');
        syncMpfUI();
    }
});

document.getElementById('mpf-close').onclick = () => mpfPlayer.classList.remove('open');
document.getElementById('mpf-queue-btn').onclick = () => {
    mpfPlayer.classList.remove('open');
    document.getElementById('btn-queue-toggle').click();
};

const mpfPlayBtn = document.getElementById('mpf-play');
const mpfPlayIcon = document.getElementById('mpf-play-icon');
const mpfPauseIcon = document.getElementById('mpf-pause-icon');

mpfPlayBtn.onclick = () => btnPlay.click();
document.getElementById('mpf-prev').onclick = () => btnPrev.click();
document.getElementById('mpf-next').onclick = () => btnNext.click();

function syncMpfUI() {
    if(playQueue.length === 0) return;
    const song = playQueue[currentQueueIndex];
    document.getElementById('mpf-title').innerText = song.title;
    document.getElementById('mpf-artist').innerText = song.artist || "Unknown Artist";
    const art = document.getElementById('mpf-art');
    art.innerHTML = song.cover_url 
        ? `<img src="${song.cover_url}" style="width:100%;height:100%;object-fit:cover;">`
        : `<svg viewBox="0 0 24 24" style="width:64px;height:64px;fill:#727272;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
}

// Hook into existing updatePlayerUI/updatePlayState to sync mobile
const originalUpdatePlayerUI = updatePlayerUI;
updatePlayerUI = (song) => {
    originalUpdatePlayerUI(song);
    syncMpfUI();
    updateMediaSession(song);
};

const originalUpdatePlayState = updatePlayState;
updatePlayState = (isPlaying) => {
    originalUpdatePlayState(isPlaying);
    if(isPlaying) {
        mpfPlayIcon.style.display = 'none';
        mpfPauseIcon.style.display = 'block';
    } else {
        mpfPlayIcon.style.display = 'block';
        mpfPauseIcon.style.display = 'none';
    }
    if(navigator.mediaSession) {
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
};

// Sync Mobile Progress
const mpfProgressWrapper = document.getElementById('mpf-progress-wrapper');
const mpfProgressFill = document.getElementById('mpf-progress-fill');
const mpfProgressThumb = document.getElementById('mpf-progress-thumb');
const mpfTimeCurrent = document.getElementById('mpf-time-current');
const mpfTimeTotal = document.getElementById('mpf-time-total');
let mpfDragging = false;

audioPlayer.addEventListener('timeupdate', () => {
    if (!mpfDragging && audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        mpfProgressFill.style.width = `${progress}%`;
        mpfProgressThumb.style.left = `${progress}%`;
        mpfTimeCurrent.innerText = formatTime(audioPlayer.currentTime);
        mpfTimeTotal.innerText = formatTime(audioPlayer.duration);
    }
});

mpfProgressWrapper.addEventListener('touchstart', () => mpfDragging = true);
mpfProgressWrapper.addEventListener('touchmove', (e) => {
    if (!mpfDragging || !audioPlayer.duration) return;
    const rect = mpfProgressWrapper.getBoundingClientRect();
    const touch = e.touches[0];
    let percent = (touch.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    mpfProgressFill.style.width = `${percent * 100}%`;
    mpfProgressThumb.style.left = `${percent * 100}%`;
    audioPlayer.currentTime = percent * audioPlayer.duration;
});
mpfProgressWrapper.addEventListener('touchend', () => mpfDragging = false);

// Swipe to next/prev on Mobile Art
let touchStartX = 0;
const mpfArt = document.getElementById('mpf-art');
mpfArt.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
mpfArt.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if(diff > 50) btnNext.click(); // swipe left
    else if(diff < -50) btnPrev.click(); // swipe right
});

// Media Session API
function updateMediaSession(song) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist || 'Unknown Artist',
            album: 'Web Music Player',
            artwork: song.cover_url ? [
                { src: song.cover_url, sizes: '512x512', type: 'image/jpeg' }
            ] : []
        });

        navigator.mediaSession.setActionHandler('play', () => btnPlay.click());
        navigator.mediaSession.setActionHandler('pause', () => btnPlay.click());
        navigator.mediaSession.setActionHandler('previoustrack', () => btnPrev.click());
        navigator.mediaSession.setActionHandler('nexttrack', () => btnNext.click());
    }
}

// --- 4. Ripple & Click Feedback ---
function createRipple(event) {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    const rect = button.getBoundingClientRect();

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add("ripple");

    const existing = button.querySelector('.ripple');
    if(existing) existing.remove();

    button.appendChild(circle);
}

// Attach ripple to buttons
document.querySelectorAll('.btn-icon, .btn-play, .nav-links li, .card-play-btn, .mobile-nav-item').forEach(btn => {
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.addEventListener('mousedown', createRipple);
    btn.addEventListener('touchstart', (e) => {
        // use first touch point for ripple
        const touch = e.touches[0];
        createRipple({
            currentTarget: btn,
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }, {passive:true});
});

// Setup song list active track highligher
setInterval(() => {
    if(audioPlayer.paused || playQueue.length === 0) return;
    const current = playQueue[currentQueueIndex];
    document.querySelectorAll('.song-list-view li, .search-song-item').forEach(li => {
        const titleEl = li.querySelector('.song-title');
        if(titleEl && titleEl.innerText === current.title) {
           li.classList.add('playing');
        } else {
           li.classList.remove('playing');
        }
    });
}, 1000);

