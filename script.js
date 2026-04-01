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
let isDraggingProgress = false;
let currentVolume = 1.0;

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
        }
    } catch (e) {
        console.log("No existing music data found.");
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
    for (const [artist, songs] of Object.entries(allMusicData)) {
        songs.forEach(s => allSongs.push({ ...s, artist }));
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

    artistListEl.innerHTML = "";
    artists.forEach((artist) => {
        const li = document.createElement("li");
        li.innerText = artist;
        
        if (artist === selectedArtist && currentView === 'artist') {
            li.classList.add("active");
        }

        li.onclick = () => {
            currentView = 'artist';
            selectedArtist = artist;
            currentSearchQuery = "";
            searchInput.value = "";
            
            navHome.classList.remove('active');
            navSearchBtn.classList.remove('active');
            searchContainer.style.display = 'none';

            renderArtistList();
            renderSongsList(artist);
        };
        artistListEl.appendChild(li);
    });
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

// Search Logic
searchInput.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value.toLowerCase().trim();
    handleSearch();
});

function handleSearch() {
    viewTitle.innerText = currentSearchQuery ? `Top Results for "${currentSearchQuery}"` : "Search";
    songListEl.className = "song-list-view";
    songListEl.innerHTML = "";

    if (!currentSearchQuery) return;

    let resultsFound = false;
    let allMatches = [];

    for (const [artist, songs] of Object.entries(allMusicData)) {
        const artistMatches = artist.toLowerCase().includes(currentSearchQuery);

        songs.forEach((song) => {
            const songMatches = song.title.toLowerCase().includes(currentSearchQuery);
            if (artistMatches || songMatches) {
                allMatches.push({ ...song, artist });
            }
        });
    }

    if (allMatches.length > 0) {
        resultsFound = true;
        allMatches.forEach((song, index) => {
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
                <button class="queue-btn" title="Add to Queue">Add</button>
            `;
            
            li.onclick = () => playSongNow(song, allMatches);
            li.querySelector('.queue-btn').onclick = (e) => {
                e.stopPropagation();
                addToQueue(song.url, song.title, song.artist, song.cover_url);
            };

            songListEl.appendChild(li);
        });
    }

    if (!resultsFound) {
        songListEl.innerHTML = `<li class="empty-state">No matching results found</li>`;
    }
}

// --- Player Logic ---

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
}

function addToQueue(url, title, artist, cover_url = null) {
    playQueue.push({url, title, artist, cover_url});
    if (audioPlayer.paused && playQueue.length === 1) {
        currentQueueIndex = 0;
        loadCurrentSong();
    } else {
        const oldText = statusBadge.innerText;
        statusBadge.innerText = "Added to queue";
        statusBadge.style.color = "var(--accent)";
        setTimeout(() => {
            statusBadge.innerText = oldText;
            statusBadge.style.color = "var(--text-secondary)";
        }, 2000);
    }
}

function loadCurrentSong() {
    if (currentQueueIndex >= 0 && currentQueueIndex < playQueue.length) {
        const song = playQueue[currentQueueIndex];
        audioPlayer.src = song.url;
        audioPlayer.play();
        npTitle.innerText = song.title;
        npArtist.innerText = song.artist || "Unknown Artist";
        
        const npArt = document.getElementById("np-art");
        if (song.cover_url) {
            npArt.innerHTML = `<img src="${song.cover_url}" alt="cover" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
        } else {
            npArt.innerHTML = `<svg viewBox="0 0 24 24"><path fill="#b3b3b3" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
        }
        
        updatePlayState(true);
    }
}

audioPlayer.addEventListener('ended', playNext);

btnPlay.addEventListener('click', () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
});

btnNext.addEventListener('click', playNext);
btnPrev.addEventListener('click', playPrev);

function playNext() {
    if (playQueue.length === 0) return;
    currentQueueIndex++;
    if (currentQueueIndex < playQueue.length) {
        loadCurrentSong();
    } else {
        currentQueueIndex = 0;
        audioPlayer.pause();
        updatePlayState(false);
    }
}

function playPrev() {
    if (playQueue.length === 0) return;
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
    } else {
        currentQueueIndex--;
        if (currentQueueIndex < 0) currentQueueIndex = 0;
        loadCurrentSong();
    }
}

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

