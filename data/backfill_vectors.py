"""Backfill feature_vector for songs already in the DB that have NULL vectors."""
import json
from db import get_db
from vector_utils import build_full_feature_vector, fetch_lyrics, l2_normalize
import time

# Reads DATABASE_URL from .env via db.get_db(), same as the rest of data/*.py.
# Pass a different DB with: DATABASE_URL="postgresql://..." python backfill_vectors.py
conn = get_db()
cur = conn.cursor()

# Get all songs missing feature_vector
cur.execute("""
    SELECT s.song_id, s.song_name, s.genre, s.release_date, s.duration_ms, a.artist_name
    FROM songs s
    JOIN song_artists sa ON s.song_id = sa.song_id
    JOIN artists a ON sa.artist_id = a.artist_id
    WHERE s.feature_vector IS NULL
""")
songs = cur.fetchall()
print(f"Found {len(songs)} songs without feature_vector")

updated = 0
failed = 0
for i, (song_id, song_name, genre, release_date, duration_ms, artist_name) in enumerate(songs):
    try:
        lyrics, is_instrumental = fetch_lyrics(artist_name, song_name)
        label = "instrumental" if is_instrumental else ("found" if lyrics else "not found")

        release_str = release_date.isoformat() if release_date else None
        full_vec = l2_normalize(build_full_feature_vector(genre, release_str, duration_ms, lyrics))

        # pgvector accepts the format [1,2,3] as text
        vec_str = "[" + ",".join(str(v) for v in full_vec) + "]"
        cur.execute(
            "UPDATE songs SET feature_vector = %s::vector WHERE song_id = %s",
            (vec_str, song_id)
        )
        updated += 1
        print(f"  [{updated}/{len(songs)}] {artist_name} — {song_name} ... lyrics {label}")

        if updated % 50 == 0:
            conn.commit()
            print(f"  --- committed {updated} ---")

        time.sleep(0.3)
    except Exception as e:
        failed += 1
        print(f"  FAILED: {artist_name} — {song_name}: {e}")

conn.commit()
print(f"\nDone! Updated: {updated}, Failed: {failed}")
conn.close()
