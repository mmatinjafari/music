# MusicSt 🎵

A fully functional, modern web-based music player and crawler. Designed to deliver a Spotify-inspired UI/UX, MusicSt combines a fast client-side Progressive Web App (PWA) with a lightweight, multi-threaded Python backend that crawls and indexes external music libraries.

## Features ✨

### Player & UI
* **Spotify-Inspired Design:** Beautiful dark mode interface with immersive album art and smooth ripple click interactions.
* **Mobile First:** Automatically transitions from a desktop sidebar layout to a mobile bottom-navigation and immersive full-screen playing view.
* **Swipe Gestures:** On mobile, easily swipe left and right on the album art to advance to the next or previous tracks.
* **Media Session API:** Fully hooks into your phone's lock screen or macOS media keys so you can pause or skip tracks seamlessly via hardware controls.

### Library & Queue Management
* **Custom Playlists:** Create playlists natively. Everything is linked and instantly saved to your browser's local storage.
* **Smart Queue System:** Drag and drop songs in the Queue slide-out panel, with real-time numeric badges and Native single-click playback.
* **Lightning Fast Search:** Client-side dynamic search automatically filters thousands of loaded tracks in milliseconds without network calls.

### Python Backend & Crawler
* **Multi-threaded Web Crawler:** The `static_server.py` backend crawls and maps MP3 links recursively from designated proxy-bypassing environments. 
* **Optimized Payloads:** The backend automatically executes atomic saves and generates native Gzip compressions (`music_data.json.gz`), dropping 25MB database payloads down to just 2MB for lightning-fast mobile library syncing.
* **Serverless Front-End Feel:** All layout filtering sits 100% on the client. The Python backend simply serves static assets and performs on-demand library crawls.

---

## Getting Started 🚀

### Prerequisites
You'll need Python 3 installed. We recommend setting up a virtual environment.

```bash
pip install -r requirements.txt
```

### Running the App
The backend serves both the API for the scraper and the static frontend app.

1. Start the Flask server:
```bash
python3 static_server.py
```
2. Open your browser and navigate to: `http://localhost:5001`
3. To trigger a fresh crawl and index new songs, click the **"Scan New"** button in the app or navigate to `/scannew.html`.

### Installation as PWA
Since MusicSt supports full PWA guidelines, you can click "Add to Home Screen" on iOS/Android or install the app onto your desktop through Chrome for a seamless native-app experience!

## Tech Stack 🛠
* **Frontend:** Vanilla JS, CSS3, DOM Manipulation, CSS Flexbox/Grid, HTML5 LocalStorage, Service Workers
* **Backend:** Python, Flask, Multi-threading Request Crawling, Gzip Compression
