# -----------------------------------------------------------------------
# app.py
# backend for hooked
# authors: Lucille, Eleanor, Sadat, Stephen, Derek
# -----------------------------------------------------------------------

import sys, os, json, random, re
import flask
from flask import Flask, jsonify, request, redirect, url_for, g
from dotenv import load_dotenv
import bcrypt
import requests
import oauthlib.oauth2
import cloudinary_config 
import cloudinary.uploader

# Allow insecure transport for local development
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

load_dotenv()
import datetime
import flask_jwt_extended
from email_utils import (
    send_verification_email, send_reset_email,send_username_reminder_email,
    read_token, VERIFY_SALT, RESET_SALT, VERIFY_MAX_AGE, RESET_MAX_AGE,
)

# URLs from environment variables
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# adds parent directory to path so we can import from data/
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data.db import get_db as _open_db
from data.vector_utils import cosine_similarity, update_weight_vector, l2_normalize, init_weight_vector_from_prefs
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY")
app.config['JWT_SECRET_KEY'] = os.environ.get("FLASK_SECRET_KEY")
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(hours=1)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = datetime.timedelta(days=7)
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024  # 1 MB request body limit

# Input length limits
MAX_EMAIL_LEN    = 254
MAX_USERNAME_LEN = 50
MAX_PASSWORD_LEN = 128
MAX_SEARCH_LEN   = 100
MAX_URL_LEN      = 2048
jwt_manager = flask_jwt_extended.JWTManager(app)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# CORS scoped to API routes; JWT auth doesn't use cookies
allowed_origins = os.environ.get("ALLOWED_ORIGINS", FRONTEND_URL).split(",")
CORS(app, resources={
    r"/api/*": {"origins": allowed_origins},
    r"/auth/*": {"origins": allowed_origins},
})

@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response

# Google OAuth setup
GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration'
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')

# Authentication routes
@app.route("/auth/login", methods=['GET', 'POST'])
def login():
    original_url = request.args.get("originalurl", "/swipe")
    # Only allow safe relative paths — prevent open redirect
    if not re.match(r'^/[a-zA-Z0-9/_-]*$', original_url):
        original_url = '/swipe'
    google_provider_cfg = requests.get(GOOGLE_DISCOVERY_URL, timeout=10).json()
    auth_endpoint = google_provider_cfg['authorization_endpoint']
    client = oauthlib.oauth2.WebApplicationClient(GOOGLE_CLIENT_ID)
    redirect_uri = url_for("auth_callback", _external=True)
    request_uri = client.prepare_request_uri(
        auth_endpoint,
        redirect_uri=redirect_uri,
        scope=['openid', 'email', 'profile'],
        state=original_url
    )
    return redirect(request_uri)
    
def current_user_id():
    email = flask_jwt_extended.get_jwt_identity()
    rows = sql_cmd("SELECT user_id FROM users WHERE email = %s", (email,), fetch=True)
    return rows[0][0] if rows else None

# callback route that Google redirects to after login
@app.route("/auth/callback", methods=['GET'])
def auth_callback():
    authorization_code = request.args.get('code')
    original_url = request.args.get('state', '/swipe')
    # Only allow safe relative paths — prevent open redirect
    if not re.match(r'^/[a-zA-Z0-9/_-]*$', original_url):
        original_url = '/swipe'
    google_provider_cfg = requests.get(GOOGLE_DISCOVERY_URL, timeout=10).json()
    token_endpoint = google_provider_cfg['token_endpoint']
    userinfo_endpoint = google_provider_cfg['userinfo_endpoint']
    client = oauthlib.oauth2.WebApplicationClient(GOOGLE_CLIENT_ID)
    redirect_uri = url_for("auth_callback", _external=True)
    
    token_url, headers, body = client.prepare_token_request(
        token_endpoint,
        authorization_response=request.url,
        redirect_url=redirect_uri,
        code=authorization_code
    )
    token_response = requests.post(
        token_url,
        headers=headers,
        data=body,
        auth=(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET),
        timeout=10
    )
    
    if token_response.status_code != 200:
        return jsonify({"error": "Failed to get token"}), 400
    client.parse_request_body_response(json.dumps(token_response.json()))

    uri, headers, body = client.add_token(userinfo_endpoint)
    userinfo_response = requests.get(uri, headers=headers, data=body, timeout=10)

    if userinfo_response.status_code != 200:
        return jsonify({"error": "Failed to get user info"}), 400
    if not userinfo_response.json().get('email_verified'):
        return jsonify({"error": "Email not verified"}), 400
    user_info = userinfo_response.json()
    email = user_info.get('email', '')
    name = user_info.get('name', '')
    google_picture = user_info.get('picture', '')
    # Derive a clean username from email local-part (before @), only for new users
    email_local = email.split('@')[0]
    sql_cmd(
        """INSERT INTO users (email, username, email_verified, user_image_url) 
        VALUES (%s, %s, TRUE, %s) 
        ON CONFLICT (email) DO UPDATE SET email_verified = TRUE;""",
        (email, email_local, google_picture)
    )
    rows = sql_cmd(
        "SELECT user_id FROM users WHERE email = %s",
        (email,),
        fetch=True
    )
    user_id = rows[0][0] if rows else None
    user_profile_rows = sql_cmd(
        "SELECT 1 FROM user_profiles WHERE user_id = %s",
        (user_id,),
        fetch=True
    )
    is_new_user = len(user_profile_rows) == 0

    nonce = os.urandom(20).hex()
    sql_cmd(
        "INSERT INTO nonces (nonce, username) VALUES (%s, %s)",
        (nonce, email)  # store email so JWT identity = email for current_user_id()
    )
    path = "/seedprefs" if is_new_user else original_url
    return redirect(f"{FRONTEND_URL}{path}?nonce={nonce}")

@app.route("/api/gettokens", methods=["GET"])
def get_tokens():
    nonce = request.args.get("nonce")
    if not nonce:
        return jsonify({"error": "Missing nonce"}), 400
    rows = sql_cmd("SELECT username FROM nonces WHERE nonce = %s",
                   (nonce,), fetch=True)
    if not rows:
        return jsonify({"error": "Invalid nonce"}), 401
    email = rows[0][0]  # nonce stores email
    sql_cmd("DELETE FROM nonces WHERE nonce = %s", (nonce,))
    # JWT identity = email (matches current_user_id() lookup)
    access = flask_jwt_extended.create_access_token(identity=email)
    refresh = flask_jwt_extended.create_refresh_token(identity=email)
    # Fetch display username for sessionStorage
    username_rows = sql_cmd("SELECT username FROM users WHERE email = %s", (email,), fetch=True)
    display_username = username_rows[0][0] if username_rows else email
    return jsonify([display_username, access, refresh])

@app.route("/api/refreshaccesstoken", methods=["POST"])
@flask_jwt_extended.jwt_required(refresh=True)
def refresh_accesstoken():
    identity = flask_jwt_extended.get_jwt_identity()
    return jsonify(flask_jwt_extended.create_access_token(identity=identity))

@app.route("/logoutapp", methods=["GET"])
def logoutapp():
    # Frontend clears its tokens; we just redirect
    return redirect(f"{FRONTEND_URL}/logout")

@app.route("/logoutgoogle", methods=["GET"])
def logoutgoogle():
    return redirect("https://www.google.com/accounts/Logout")

# returns the logged-in user's info, or 401 if not logged in
@app.route("/api/getuserinfo")
@flask_jwt_extended.jwt_required()
def get_user():
    email = flask_jwt_extended.get_jwt_identity()
    rows = sql_cmd(
        "SELECT user_id, email, username, email_verified FROM users WHERE email = %s",
        (email,), fetch=True
    )
    if not rows:
        return jsonify(None), 401
    r = rows[0]
    return jsonify({
        "user_id": r[0], "email": r[1], "name": r[2],
        "email_verified": bool(r[3]),
    })

@app.route("/auth/signup", methods=["POST"])
def signup():
    data = request.get_json()
    email = data.get("email", "")
    username = data.get("username", "")
    password = data.get("password", "")
    pfp = data.get("user_image_url", "")

    if not email or not username or not password:
        return jsonify({"error": "Email, username, and password are required"}), 400
    if len(email) > MAX_EMAIL_LEN:
        return jsonify({"error": "Email too long"}), 400
    if len(username) > MAX_USERNAME_LEN:
        return jsonify({"error": "Username must be 50 characters or fewer"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if len(password) > MAX_PASSWORD_LEN:
        return jsonify({"error": "Password too long"}), 400
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    try:
        rows = sql_cmd(
            """INSERT INTO users (email, username, password_hash, user_image_url)
            VALUES (%s, %s, %s, %s)
            RETURNING user_id;""",
            (email, username, hashed, pfp if pfp else None),
            fetch=True
        )
        user_id = rows[0][0]
        try:
            send_verification_email(email, FRONTEND_URL)
        except Exception as mail_err:
            print(f"[signup] failed to send verification email: {mail_err}")
        return jsonify({"user_id": user_id}), 201
    except Exception as e:
        if "users_email_key" in str(e):
            return jsonify({"error": "Email already taken"}), 409
        if "users_username_key" in str(e):
            return jsonify({"error": "Username already taken"}), 409
        return jsonify({"error": str(e)}), 500


EPSILON = 0.15  # fraction of requests served randomly for exploration

# returns the DB connection for the current request, opening one if needed
# Flask's teardown closes it automatically when the request ends
def get_db():
    if 'db' not in g:
        g.db = _open_db()
    return g.db

# closes the DB connection at the end of the request
@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# helper to run SQL commands. reuses the single per-request connection
# before this would open multiple conenections per request which
# was not neccessary
def sql_cmd(command, params=(), fetch=False):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(command, params)
    conn.commit()
    result = cur.fetchall() if fetch else None
    cur.close()
    return result


# API route to handle user interactions (like/dislike) and update their profile vector accordingly
@app.route("/api/songs/action", methods=["POST"])
@flask_jwt_extended.jwt_required()
def store_interaction():
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "not logged in"}), 401
    
    data = request.get_json()
    song_id = data.get("song_id")
    action = data.get("action")
    served_by = data.get("served_by")
    session_id = data.get("session_id")

    if not song_id or not action:
        return jsonify({"error": "song_id and action are required"}), 400

    # Update interactions table
    sql_cmd(
        "INSERT INTO interactions (user_id, song_id, type, served_by, session_id) VALUES (%s, %s, %s, %s, %s);",
        (user_id, song_id, action, served_by, session_id)
    )

    # Update liked/disliked tables
    if action == "like":
        sql_cmd(
            "INSERT INTO liked (user_id, song_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;",
            (user_id, song_id)
        )
    elif action == "dislike":
        sql_cmd(
            "INSERT INTO disliked (user_id, song_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;",
            (user_id, song_id)
        )

    # Fetch song feature vector and user profile in one query
    # Cast to text so psycopg returns strings we can parse
    rows = sql_cmd(
        """SELECT s.feature_vector::text, up.weight_vector::text
           FROM songs s
           LEFT JOIN user_profiles up ON up.user_id = %s
           WHERE s.song_id = %s""",
        (user_id, song_id), fetch=True
    )

    if not rows:
        return jsonify({"status": "ok"}), 201

    song_vec_str = rows[0][0]
    prof_vec_str = rows[0][1]

    # Parse vectors if they exist
    if song_vec_str:
        song_vec = json.loads(song_vec_str) if isinstance(song_vec_str, str) else song_vec_str
    else:
        return jsonify({"status": "ok"}), 201

    if prof_vec_str:
        prof_vec = json.loads(prof_vec_str) if isinstance(prof_vec_str, str) else prof_vec_str
    else:
        prof_vec = []

    # Update weight vector
    new_vec = update_weight_vector(prof_vec, song_vec, action)

    vec_str = "[" + ",".join(str(v) for v in new_vec) + "]"
    sql_cmd(
        """INSERT INTO user_profiles (user_id, weight_vector, updated_at)
           VALUES (%s, %s::text::vector, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET weight_vector = EXCLUDED.weight_vector, updated_at = NOW()""",
        (user_id, vec_str)
    )

    return jsonify({"status": "ok"}), 201

# API route to get a list of songs the user has liked, along with artist info and when they liked it
@app.route("/api/songs/liked", methods=["GET"])
@flask_jwt_extended.jwt_required()
def get_liked_songs():
    user_id = current_user_id()

    rows = sql_cmd("""
        SELECT s.song_id, s.song_name, s.song_image_url, s.preview_mp3_url,
               a.artist_name, l.created_at
        FROM liked l
        JOIN songs s ON l.song_id = s.song_id
        JOIN song_artists sa ON s.song_id = sa.song_id
        JOIN artists a ON sa.artist_id = a.artist_id
        WHERE l.user_id = %s
        ORDER BY l.created_at DESC;
        """, (user_id,), fetch=True)

    return jsonify([{
            "song_id":        r[0],
            "song_name":      r[1],
            "song_image_url": r[2],
            "preview_mp3_url": r[3],
            "artist_name":    r[4],
            "liked_at":       r[5].isoformat() if r[5] else None
        } for r in rows])

# API route to get the next song recommendation for a user, using pgvector similarity ranking with epsilon-greedy exploration
@app.route("/api/songs/next", methods=["GET"])
@flask_jwt_extended.jwt_required()
def next_song():
    try:
        user_id = current_user_id()
        if not user_id:
            app.logger.error(f"next_song: user_id is None from JWT identity")
            return jsonify({"error": "user not found"}), 401

        # Check if user has any songs in liked/disliked
        excluded_songs = sql_cmd("""
            SELECT COUNT(*) FROM (
                SELECT song_id FROM liked WHERE user_id = %s
                UNION
                SELECT song_id FROM disliked WHERE user_id = %s
            ) t
        """, (user_id, user_id), fetch=True)
        
        # Check total songs with feature_vector
        total_songs = sql_cmd(
            "SELECT COUNT(*) FROM songs WHERE feature_vector IS NOT NULL",
            (), fetch=True
        )
        
        app.logger.info(f"next_song for user {user_id}: total_songs={total_songs[0][0] if total_songs else 0}, excluded={excluded_songs[0][0] if excluded_songs else 0}")

        profile_rows = sql_cmd(
            "SELECT weight_vector::text FROM user_profiles WHERE user_id = %s",
            (user_id,), fetch=True
        )

        has_profile = profile_rows and profile_rows[0][0] is not None

        # The usage of pgvector (line 443) was suggested by Claude when discussing potential optimizations.
        if has_profile and random.random() > EPSILON:
            served_by = "similarity"
            rows = sql_cmd("""
                SELECT s.song_id, s.song_name, s.song_image_url, s.preview_mp3_url, a.artist_name
                FROM songs s
                JOIN song_artists sa ON s.song_id = sa.song_id
                JOIN artists a ON sa.artist_id = a.artist_id
                WHERE s.song_id NOT IN (
                    SELECT song_id FROM liked WHERE user_id = %s
                    UNION
                    SELECT song_id FROM disliked WHERE user_id = %s
                )
                AND s.feature_vector IS NOT NULL
                ORDER BY s.feature_vector <=> %s::text::vector
                LIMIT 1
            """, (user_id, user_id, profile_rows[0][0]), fetch=True)
        else:
            served_by = "exploration"
            rows = sql_cmd("""
                SELECT s.song_id, s.song_name, s.song_image_url, s.preview_mp3_url, a.artist_name
                FROM songs s
                JOIN song_artists sa ON s.song_id = sa.song_id
                JOIN artists a ON sa.artist_id = a.artist_id
                WHERE s.song_id NOT IN (
                    SELECT song_id FROM liked WHERE user_id = %s
                    UNION
                    SELECT song_id FROM disliked WHERE user_id = %s
                )
                AND s.feature_vector IS NOT NULL
                ORDER BY RANDOM()
                LIMIT 1
            """, (user_id, user_id), fetch=True)

        if not rows:
            # Fallback: serve any unseen song even without feature_vector
            served_by = "exploration"
            rows = sql_cmd("""
                SELECT s.song_id, s.song_name, s.song_image_url, s.preview_mp3_url, a.artist_name
                FROM songs s
                JOIN song_artists sa ON s.song_id = sa.song_id
                JOIN artists a ON sa.artist_id = a.artist_id
                WHERE s.song_id NOT IN (
                    SELECT song_id FROM liked WHERE user_id = %s
                    UNION
                    SELECT song_id FROM disliked WHERE user_id = %s
                )
                ORDER BY RANDOM()
                LIMIT 1
            """, (user_id, user_id), fetch=True)

        if not rows:
            app.logger.warning(f"next_song for user {user_id}: no available songs")
            return jsonify({"message": "no more songs"}), 404

        best = rows[0]
        return jsonify({
            "song_id":        best[0],
            "song_name":      best[1],
            "song_image_url": best[2],
            "preview_mp3_url": best[3],
            "artist_name":    best[4],
            "served_by":      served_by
        })
    except Exception as e:
        app.logger.error(f"Error in next_song: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

# For deleting a liked song from liked songs
@app.route("/api/songs/liked/<int:song_id>", methods=["DELETE"])
@flask_jwt_extended.jwt_required()
def delete_liked_song(song_id):
    user_id = current_user_id()
    sql_cmd("DELETE FROM liked WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
    sql_cmd("DELETE FROM interactions WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
    return jsonify({"status": "deleted"}), 200

# For deleting a song action (like/dislike) from interactions
@app.route("/api/songs/action/<int:song_id>", methods=["DELETE"])
@flask_jwt_extended.jwt_required()
def delete_song_action(song_id):
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "not logged in"}), 401

    try:
        sql_cmd("DELETE FROM interactions WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
        sql_cmd("DELETE FROM liked WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
        sql_cmd("DELETE FROM disliked WHERE user_id = %s AND song_id = %s;", (user_id, song_id))
        return jsonify({"status": "deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# this is for the search bar function...
@app.route("/api/songs/search", methods=["GET"])
@flask_jwt_extended.jwt_required()
def search_songs():
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "not logged in"}), 401

    query = request.args.get("params", "")

    if not query:
        return jsonify({"error": "params parameter is required"}), 400

    query = query[:MAX_SEARCH_LEN]  # truncate oversized input
    rows = sql_cmd("""
        SELECT s.song_id, s.song_name, s.song_image_url, s.preview_mp3_url,
               a.artist_name
        FROM songs s
        LEFT JOIN song_artists sa ON s.song_id = sa.song_id
        LEFT JOIN artists a ON sa.artist_id = a.artist_id
        WHERE s.song_name ILIKE %s OR a.artist_name ILIKE %s
        LIMIT 8;
    """, (f"%{query}%", f"%{query}%",), fetch=True)

    if not rows:
        return jsonify({"message": "no songs found"}), 200

    results = []
    for r in rows:
        results.append({
            "song_id":        r[0],
            "song_name":      r[1],
            "song_image_url": r[2],
            "preview_mp3_url": r[3],
            "artist_name":    r[4]
        })

    return jsonify(results)

# this is for the search bar for freiendsfunction...
@app.route("/api/friends/search", methods=["GET"])
@flask_jwt_extended.jwt_required()
def search_friends():
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "not logged in"}), 401

    query = request.args.get("query", "")

    if not query:
        return jsonify({"error": "query parameter is required"}), 400

    query = query[:MAX_SEARCH_LEN]  # truncate oversized input
    rows = sql_cmd("""
        SELECT u.user_id, u.username, u.user_image_url
        FROM users u
        WHERE (u.username ILIKE %s OR u.email ILIKE %s)
        AND u.email_verified = TRUE
        LIMIT 8;
    """, (f"%{query}%", f"%{query}%",), fetch=True)

    if not rows:
        return jsonify({"users": []}), 200

    results = []
    for r in rows:
        results.append({
            "user_id":        r[0],
            "username":       r[1],
            "user_image_url": r[2],
        })

    return jsonify({"users": results}), 200

@app.route("/api/users/get/<username>", methods=["GET"])
@flask_jwt_extended.jwt_required()
def get_user_profile(username):
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "not logged in"}), 401

    try:
        rows = sql_cmd("""
            SELECT username, user_image_url
            FROM users
            WHERE username = %s
        """, (username,), fetch=True)

        if not rows:
            return jsonify({"error": "user not found"}), 404

        r = rows[0]
        return jsonify({
            "username":       r[0],
            "user_image_url": r[1],
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/users/update-pfp", methods=["POST"])
@flask_jwt_extended.jwt_required()
def update_pfp():
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "not logged in"}), 401
    data = request.get_json()
    image_url = data.get("user_image_url", "")
    if image_url and len(image_url) > MAX_URL_LEN:
        return jsonify({"error": "URL too long"}), 400
    sql_cmd(
        "UPDATE users SET user_image_url = %s WHERE user_id = %s",
        (image_url if image_url else None, user_id)
    )
    return jsonify({"ok": True}), 200

@app.route("/api/users/<username>/liked", methods=["GET"])
@flask_jwt_extended.jwt_required()
def get_user_liked_songs(username):
    """Get the last 5 liked songs for a given user"""
    try:
        # Get user_id from username
        rows = sql_cmd(
            "SELECT user_id FROM users WHERE username = %s",
            (username,),
            fetch=True
        )
        if not rows:
            return jsonify({"error": "user not found"}), 404
        
        user_id = rows[0][0]
        
        # Get the last 5 liked songs ordered by most recent
        liked_rows = sql_cmd("""
            SELECT s.song_id, s.song_name, s.song_image_url, s.preview_mp3_url,
                   a.artist_name, l.created_at
            FROM liked l
            JOIN songs s ON l.song_id = s.song_id
            JOIN song_artists sa ON s.song_id = sa.song_id
            JOIN artists a ON sa.artist_id = a.artist_id
            WHERE l.user_id = %s
            ORDER BY l.created_at DESC
            LIMIT 5;
        """, (user_id,), fetch=True)
        
        return jsonify([{
            "song_id": r[0],
            "song_name": r[1],
            "song_image_url": r[2],
            "preview_mp3_url": r[3],
            "artist_name": r[4],
            "liked_at": r[5].isoformat() if r[5] else None
        } for r in liked_rows]), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/friends/add', methods=['POST'])
@flask_jwt_extended.jwt_required()
def add_friend():
    user_id = current_user_id()
    if not user_id:
        return flask.jsonify({'error': 'Not authenticated'}), 401
    
    data = flask.request.get_json()
    friend_username = data.get('friend_username')

    if not friend_username:
        return flask.jsonify({'error': 'friend_username required'}), 400

    # look up the friend's user_id from their username
    rows = sql_cmd(
        "SELECT user_id FROM users WHERE username = %s",
        (friend_username,), fetch=True
    )
    if not rows:
        return flask.jsonify({'error': 'user not found'}), 404

    friend_id = rows[0][0]

    if user_id == friend_id:
        return flask.jsonify({'error': 'cannot add yourself'}), 400

    # insert both directions
    sql_cmd(
        """INSERT INTO friends (user_id, friend_id)
           VALUES (%s, %s)
           ON CONFLICT (user_id, friend_id) DO NOTHING""",
        (user_id, friend_id)
    )
    sql_cmd(
        """INSERT INTO friends (user_id, friend_id)
           VALUES (%s, %s)
           ON CONFLICT (user_id, friend_id) DO NOTHING""",
        (friend_id, user_id)
    )

    return flask.jsonify({'added': True}), 200

@app.route('/api/users/<username>/friends', methods=['GET'])
@flask_jwt_extended.jwt_required()
def get_user_friends(username):
    """Get list of friends for a specific user"""
    # Get user_id from username
    rows = sql_cmd(
        "SELECT user_id FROM users WHERE username = %s",
        (username,), fetch=True
    )
    if not rows:
        return flask.jsonify({'error': 'user not found'}), 404
    
    user_id = rows[0][0]
    
    # Get all friends for this user
    rows = sql_cmd("""
        SELECT u.user_id, u.username, u.user_image_url, u.email
        FROM friends f
        JOIN users u ON f.friend_id = u.user_id
        WHERE f.user_id = %s
    """, (user_id,), fetch=True)
    
    if not rows:
        return flask.jsonify([]), 200
    
    friends = []
    for r in rows:
        friends.append({
            'user_id': r[0],
            'username': r[1],
            'user_image_url': r[2],
            'email': r[3]
        })
    
    return flask.jsonify(friends), 200

# seed preference
@app.route('/api/preferences', methods=['POST'])
@flask_jwt_extended.jwt_required()
def save_preferences():
    data = flask.request.get_json()
    genres = data.get('prefs', [])
    vec = init_weight_vector_from_prefs(genres)
    user_id = current_user_id()

    # Update weight vector in users table
    sql_cmd(
        "UPDATE users SET weight_vector = %s WHERE user_id = %s",
        (json.dumps(vec), user_id)
    )
    
    # Create user_profile entry (marks preferences as completed)
    vec_str = "[" + ",".join(str(v) for v in vec) + "]"
    sql_cmd(
        """INSERT INTO user_profiles (user_id, weight_vector, seed_genres)
           VALUES (%s, %s::text::vector, %s)
           ON CONFLICT (user_id) DO UPDATE
           SET weight_vector = EXCLUDED.weight_vector,
               seed_genres = EXCLUDED.seed_genres""",
        (user_id, vec_str, json.dumps(genres))
    )

    return flask.jsonify({'added weight vec to DB': True})

@app.route('/api/checkpw', methods=['POST'])
def check_password():
    data = flask.request.get_json()
    username = data.get('username', "")
    password = data.get('password', "")

    result = sql_cmd(
        "SELECT user_id, email, password_hash, email_verified FROM users WHERE username = %s",
        (username,),
        fetch=True
    )


    if not result:
        return flask.jsonify({'logged_in': False, 'error': 'User not found'}), 401

    user_id, email, stored_hash, email_verified = result[0]


    import bcrypt
    if bcrypt.checkpw(password.encode(), stored_hash.encode()):
        if not email_verified:
            return flask.jsonify({
                'logged_in': False,
                'error': 'Please verify your email before logging in. Check your inbox.'
            }), 403
        access = flask_jwt_extended.create_access_token(identity=email)
        refresh = flask_jwt_extended.create_refresh_token(identity=email)

        # Check if user has completed seed preferences
        profile_rows = sql_cmd(
            "SELECT 1 FROM user_profiles WHERE user_id = %s AND weight_vector IS NOT NULL",
            (user_id,), fetch=True
        )
        has_preferences = len(profile_rows) > 0

        return jsonify({
            'logged_in': True,
            'username': username,
            'accesstoken': access,
            'refreshtoken': refresh,
            'email_verified': bool(email_verified),
            'has_preferences': has_preferences,
        })



    return flask.jsonify({'logged_in': False, 'error': 'Wrong password'}), 401

@app.route("/auth/verify-email/<token>", methods=["GET"])
def verify_email(token):
    email = read_token(token, VERIFY_SALT, VERIFY_MAX_AGE)
    if not email:
        return jsonify({"verified": False, "error": "Invalid or expired link"}), 400
    sql_cmd("UPDATE users SET email_verified = TRUE WHERE email = %s", (email,))
    return jsonify({"verified": True, "email": email})


@app.route("/auth/resend-verification", methods=["POST"])
def resend_verification():
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email required"}), 400
    rows = sql_cmd("SELECT email_verified FROM users WHERE email = %s",
                   (email,), fetch=True)
    if rows and rows[0][0]:
        return jsonify({"status": "already_verified"})
    if rows and not rows[0][0]:
        try:
            send_verification_email(email, FRONTEND_URL)
        except Exception as e:
            print(f"[resend_verification] {e}")
    # "sent" is returned even when no user exists, so we don't leak registration
    return jsonify({"status": "sent"})

@app.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email required"}), 400
    rows = sql_cmd("SELECT 1 FROM users WHERE email = %s", (email,), fetch=True)
    if rows:
        try:
            send_reset_email(email, FRONTEND_URL)
        except Exception as e:
            print(f"[forgot_password] {e}")
    # Always return ok so we don't reveal which emails are registered
    return jsonify({"sent": True})


@app.route("/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}
    token = data.get("token", "")
    new_password = data.get("password", "")
    if not token or not new_password:
        return jsonify({"error": "Token and password required"}), 400
    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    email = read_token(token, RESET_SALT, RESET_MAX_AGE)
    if not email:
        return jsonify({"error": "Invalid or expired link"}), 400

    hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    sql_cmd("UPDATE users SET password_hash = %s WHERE email = %s",
            (hashed, email))
    return jsonify({"reset": True})

@app.route("/auth/forgot-username", methods=["POST"])
def forgot_username():
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email required"}), 400
    rows = sql_cmd("SELECT username FROM users WHERE email = %s",
                   (email,), fetch=True)
    if rows:
        try:
            send_username_reminder_email(email, rows[0][0])
        except Exception as e:
            print(f"[forgot_username] {e}")
    # Always return ok — don't reveal whether email is registered
    return jsonify({"sent": True})


if __name__ == "__main__":
    # Get port from environment (Render sets this), default to 5000 for local dev
    port = int(os.environ.get("PORT", 5000))
    # Disable debug mode in production (when not on localhost)
    debug_mode = "localhost" in os.environ.get("FRONTEND_URL", "")
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
