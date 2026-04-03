from flask import Flask, send_from_directory, request, Response, jsonify
from flask_cors import CORS
import requests
import urllib.parse
import urllib3
import threading
import queue
import re
import os
import json
import tempfile

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
CORS(app)

# Credentials
USERNAME = os.environ.get('APP_USER', 'admin')
PASSWORD = os.environ.get('APP_PASS', 'admin')

# تغییر به http برای جلوگیری از ارور SSL سایت مقصد
BASE_URL = 'http://dl2.mokhtalefmusic.com/Music/'
DATA_FILE = 'music_data.json'

music_data = {}
visited_urls = set()
data_lock = threading.Lock()

crawl_status = {
    "is_crawling": False,
    "folders_scanned": 0,
    "songs_found": 0
}


def parse_filename(filename):
    decoded = urllib.parse.unquote(filename)
    clean_name = decoded.replace('.mp3', '')
    if ' - ' in clean_name:
        artist, title = clean_name.split(' - ', 1)
    else:
        artist = "Unknown Artist"
        title = clean_name
    return artist.strip(), title.strip()


def save_to_json():
    """Atomic save — write to temp file then rename."""
    if not music_data:
        return
    try:
        dir_name = os.path.dirname(os.path.abspath(DATA_FILE)) or "."
        fd, temp_path = tempfile.mkstemp(dir=dir_name, prefix='.music_tmp_')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json_str = json.dumps(music_data, ensure_ascii=False, indent=2)
            f.write(json_str)
        os.replace(temp_path, DATA_FILE)
        
        # Also create a gzipped version for extremely fast mobile transfer (23MB -> 2MB)
        import gzip
        gz_fd, gz_temp_path = tempfile.mkstemp(dir=dir_name, prefix='.music_gz_')
        with os.fdopen(gz_fd, 'wb') as gf:
            gf.write(gzip.compress(json_str.encode('utf-8')))
        os.replace(gz_temp_path, DATA_FILE + '.gz')
        
    except Exception as e:
        print(f"Save error: {e}")


def crawler_worker(url_q):
    """Each thread gets its own requests — no shared session (thread safety)."""
    while True:
        try:
            url = url_q.get(timeout=10)
        except queue.Empty:
            break

        with data_lock:
            if url in visited_urls:
                url_q.task_done()
                continue
            visited_urls.add(url)

        try:
            response = requests.get(url, verify=False, timeout=15)
            with data_lock:
                crawl_status["folders_scanned"] += 1

            links = re.findall(r'href="([^"]+)"', response.text, re.IGNORECASE)

            for link in links:
                if link == '../':
                    continue
                full_url = urllib.parse.urljoin(url, link)

                # اجبار به استفاده از http به دلیل اکسپایر شدن SSL سرور مبدا
                if full_url.startswith('https://'):
                    full_url = full_url.replace('https://', 'http://', 1)

                if link.endswith('/'):
                    url_q.put(full_url)
                elif link.lower().endswith('.mp3'):
                    artist, title = parse_filename(link)

                    with data_lock:
                        if artist not in music_data:
                            music_data[artist] = []

                        if not any(song['url'] == full_url for song in music_data[artist]):
                            music_data[artist].append({
                                'title': title,
                                'url': full_url,
                                'cover_url': ""
                            })
                            crawl_status["songs_found"] += 1

                            # Save every 10 new songs
                            if crawl_status["songs_found"] % 10 == 0:
                                save_to_json()

        except Exception as e:
            pass

        url_q.task_done()


def load_existing_data():
    global music_data
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
            if isinstance(loaded, dict) and loaded:
                # Merge — additive: keep existing, add loaded
                for artist, songs in loaded.items():
                    if artist not in music_data:
                        music_data[artist] = []
                    existing_urls = {s['url'] for s in music_data[artist]}
                    for song in songs:
                        if song['url'] not in existing_urls:
                            music_data[artist].append(song)

                # رفع خودکار لینکهای https
                for artist, songs in music_data.items():
                    for song in songs:
                        if song['url'].startswith('https://'):
                            song['url'] = song['url'].replace('https://', 'http://', 1)
                        # Ensure cover_url field exists
                        if 'cover_url' not in song:
                            song['cover_url'] = ""

                total = sum(len(s) for s in music_data.values())
                with data_lock:
                    crawl_status["songs_found"] = total
                print(f"Loaded {total} songs from disk.")
        except Exception as e:
            print(f"Load error: {e}")


def start_background_crawl(force_scan=False):
    global visited_urls

    # Load existing data first (additive)
    load_existing_data()

    if not force_scan and os.path.exists(DATA_FILE):
        with data_lock:
            crawl_status["is_crawling"] = False
        print("Skipping network scan. Use the 'Scan New' button to fetch new music.")
        return

    print("Starting MULTI-THREADED scan for new music...")

    # Fresh queue for each scan
    url_q = queue.Queue()

    with data_lock:
        crawl_status["is_crawling"] = True
        visited_urls = set()
        crawl_status["folders_scanned"] = 0

    url_q.put(BASE_URL)

    threads = []
    for _ in range(15):
        t = threading.Thread(target=crawler_worker, args=(url_q,), daemon=True)
        t.start()
        threads.append(t)

    url_q.join()

    # Final save
    save_to_json()

    with data_lock:
        crawl_status["is_crawling"] = False
        total_songs = crawl_status["songs_found"]
        print(f"Crawl complete. Total songs: {total_songs}")


# --- Authentication ---
def check_auth(u, p):
    return u == USERNAME and p == PASSWORD

def authenticate():
    return Response(
        'Login required', 401,
        {'WWW-Authenticate': 'Basic realm="Login Required"'})

@app.before_request
def require_login():
    public_paths = ['/manifest.webmanifest', '/music_data.json', '/favicon.ico',
                    '/sw.js', '/sw-cache.js']
    if request.path in public_paths:
        return
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()


# --- API ---
@app.route('/api/status', methods=['GET'])
def get_status():
    with data_lock:
        return jsonify(crawl_status)

@app.route('/api/tracks', methods=['GET'])
def get_tracks():
    with data_lock:
        return jsonify(music_data)

@app.route('/api/scan', methods=['POST'])
def trigger_scan():
    with data_lock:
        if crawl_status["is_crawling"]:
            return jsonify({"message": "Already scanning"}), 400
    threading.Thread(target=start_background_crawl, args=(True,), daemon=True).start()
    return jsonify({"message": "Scan started"}), 202


# --- Static files ---
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/music_data.json')
def serve_compressed_music_data():
    if 'gzip' in request.headers.get('Accept-Encoding', '').lower():
        if os.path.exists(DATA_FILE + '.gz'):
            with open(DATA_FILE + '.gz', 'rb') as f:
                data = f.read()
            resp = Response(data)
            resp.headers['Content-Encoding'] = 'gzip'
            resp.headers['Content-Type'] = 'application/json'
            resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            return resp
            
    resp = send_from_directory('.', DATA_FILE)
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp

@app.route('/scannew')
def scannew():
    return send_from_directory('.', 'scannew.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)


if __name__ == '__main__':
    threading.Thread(target=start_background_crawl, daemon=True).start()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)), debug=False)
