-- Alternate schema for machines that can't get the real pgvector extension —
-- typically Windows without Visual Studio's C++ build tools, which pgvector's
-- native build requires. Use this INSTEAD of schema.sql, not in addition to it.
--
-- It's a byte-for-byte copy of schema.sql, except the "CREATE EXTENSION vector"
-- line is replaced with a plain SQL/PLpgSQL stand-in: a `vector` domain (really
-- just `text` underneath) plus the one operator (`<=>`, cosine distance) the
-- app actually uses. It stores/returns vectors in pgvector's own "[1,2,3]" text
-- format, so the app's `::text::vector` casts work identically either way — no
-- app code differs based on which schema file you used.

-- Windows-friendly stand-in for the pgvector extension
CREATE DOMAIN vector AS text;

CREATE OR REPLACE FUNCTION vector_cosine_distance(a vector, b vector) RETURNS double precision AS $$
DECLARE
  va double precision[];
  vb double precision[];
  dot double precision := 0;
  norm_a double precision := 0;
  norm_b double precision := 0;
  i int;
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN NULL;
  END IF;
  va := string_to_array(trim(both '[]' from a), ',')::double precision[];
  vb := string_to_array(trim(both '[]' from b), ',')::double precision[];
  IF array_length(va, 1) IS DISTINCT FROM array_length(vb, 1) THEN
    RAISE EXCEPTION 'vector dimension mismatch: % vs %', array_length(va,1), array_length(vb,1);
  END IF;
  FOR i IN 1..array_length(va, 1) LOOP
    dot := dot + va[i] * vb[i];
    norm_a := norm_a + va[i] * va[i];
    norm_b := norm_b + vb[i] * vb[i];
  END LOOP;
  IF norm_a = 0 OR norm_b = 0 THEN
    RETURN 1;
  END IF;
  RETURN 1 - (dot / (sqrt(norm_a) * sqrt(norm_b)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OPERATOR <=> (
  LEFTARG = vector,
  RIGHTARG = vector,
  PROCEDURE = vector_cosine_distance
);

--- stores user data ---
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_image_url TEXT,
    weight_vector JSONB DEFAULT '{}'::jsonb
);

--- stores artist data ---
CREATE TABLE artists (
    artist_id SERIAL PRIMARY KEY,
    artist_name TEXT NOT NULL UNIQUE
);

--- stores album data ---
CREATE TABLE albums (
    album_id SERIAL PRIMARY KEY,
    album_name TEXT NOT NULL,
    release_date DATE,
    cover_image_url TEXT
);

--- stores song data ---
CREATE TABLE songs (
    song_id SERIAL PRIMARY KEY,
    song_name TEXT NOT NULL,
    album_id INTEGER REFERENCES albums(album_id) ON DELETE CASCADE,
    preview_mp3_url TEXT UNIQUE,
    song_image_url TEXT,
    feature_vector vector -- 398 dims, enforced by app code (data/vector_utils.py); our shim domain has no typmod support
);

--- joins songs to artists ---
CREATE TABLE song_artists (
    PRIMARY KEY (song_id, artist_id),
    song_id INTEGER REFERENCES songs(song_id) ON DELETE CASCADE,
    artist_id INTEGER REFERENCES artists(artist_id) ON DELETE CASCADE
);

--- interaction table ---
CREATE TABLE interactions (
    interaction_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    song_id INTEGER REFERENCES songs(song_id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('play', 'like', 'dislike', 'favorite')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    served_by TEXT CHECK (served_by IN ('similarity', 'exploration')),
    session_id TEXT
);

--- stores user taste profiles ---
CREATE TABLE user_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    weight_vector vector, -- 398 dims, enforced by app code; see note above
    seed_genres JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--- friend connections ---
CREATE TABLE friends (
    PRIMARY KEY (user_id, friend_id),
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    friend_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--- liked songs for quick access ---
CREATE TABLE liked (
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    song_id INTEGER REFERENCES songs(song_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, song_id)
);

--- disliked songs for quick access ---
CREATE TABLE disliked (
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    song_id INTEGER REFERENCES songs(song_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, song_id)
);

--- temporary nonces for OAuth flows ---
CREATE TABLE nonces (
    nonce TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--- indexes for hot query paths ---
CREATE INDEX ON interactions (user_id, song_id);
CREATE INDEX ON songs (song_id) WHERE feature_vector IS NOT NULL;
