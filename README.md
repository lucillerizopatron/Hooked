# Hooked

A full-stack, three-tier music discovery app: a swipe-based React interface on top of a Flask REST API, backed by PostgreSQL with pgvector-powered similarity search. Swipe on songs Tinder-style and the app learns your taste in real time — every song carries a feature vector (genre, release year/duration, and an NLP lyric embedding), each user has a taste vector that shifts toward what they like and away from what they skip, and recommendations are ranked by cosine similarity with an epsilon-greedy explore/exploit split so the feed doesn't collapse into a filter bubble.

## Features

**Interface**
- Tinder-style swipe interface (drag or button) with live card animations and undo
- Glow/lift micro-interactions on buttons and inputs, gradient-lit swipe cards, animated floating-note background
- Song search with hover effects, a liked-songs library with previews, protected client-side routing that redirects unauthenticated users

**API & business logic**
- Flask REST API handling auth, swipes, search, friends, and recommendations
- JWT access/refresh tokens, bcrypt password hashing, Google OAuth2, email verification and password reset via signed tokens
- Friends system (add/view friends and their profiles)
- Content-based recommendation engine — per-song feature vectors (genre + metadata + NLP lyric embeddings) ranked against a continuously-updated per-user taste vector by cosine similarity, with epsilon-greedy exploration to avoid over-narrowing
- Data pipeline that builds the song catalog from the iTunes API and real lyrics (LRCLIB/lyrics.ovh), threaded for throughput

**Data**
- PostgreSQL schema modeling users, songs, artists, albums, interactions, and friendships
- pgvector for vector storage and cosine-similarity nearest-neighbor queries
- Cloudinary for profile picture storage/delivery

**Stack:** React (presentation) · Flask REST API (application) · PostgreSQL + pgvector (data) · sentence-transformers (all-MiniLM-L6-v2) for lyric embeddings

## Prerequisites
- Python 3 + pip
- Node.js + npm
- PostgreSQL
- Cloudinary account

## Backend Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   pip install cloudinary
   ```

2. Configure `.env`:
   ```
   DATABASE_URL=...
   CLOUDINARY_URL=...       # required for profile picture uploads
   # other secrets (JWT, email, etc.)
   ```

3. Set up PostgreSQL:
   ```bash
   psql -U postgres
   # enter password when prompted
   ```
   ```sql
   CREATE DATABASE hooked;
   ```
   ```bash
   psql -U postgres -d hooked -f data/schema.sql
   ```

   `schema.sql` needs the [pgvector](https://github.com/pgvector/pgvector) extension. If you're on Windows without Visual Studio's C++ build tools (pgvector's native build requires it), use `data/schema.windows-no-buildtools.sql`.

4. Run the backend:
   ```bash
   python backend/app.py
   ```

## Frontend Setup

```bash
cd frontend
npm install
npm start
```
