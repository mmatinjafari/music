import os
import base64
from flask import Flask, send_from_directory, request, Response

app = Flask(__name__)

# Credentials from environment variables
USERNAME = os.environ.get('APP_USER', 'admin')
PASSWORD = os.environ.get('APP_PASS', 'Matinkhan434')

def check_auth(username, password):
    return username == USERNAME and password == PASSWORD

def authenticate():
    return Response(
        'Could not verify your access level for that URL.\n'
        'You have to login with proper credentials', 401,
        {'WWW-Authenticate': 'Basic realm="Login Required"'})

@app.before_request
def require_login():
    # Only protect the app, ignore favicon/manifest if needed, 
    # but for "self only use" we protect everything.
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
