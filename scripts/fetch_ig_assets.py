#!/usr/bin/env python3
"""
Download profile picture + latest N posts from an Instagram account.
Usage:
  pip install instaloader
  python3 fetch_ig_assets.py <username> [--posts 10] [--out ./ig-assets]

For a private account or to avoid rate limits, log in:
  instaloader --login <your_ig_username>   # saves session to ~/.config/instaloader/
The script will reuse that saved session automatically.
"""

import argparse
import sys
import os

try:
    import instaloader
except ImportError:
    sys.exit("Run:  pip install instaloader")

import itertools


def run(username: str, n_posts: int, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)

    L = instaloader.Instaloader(
        download_pictures=True,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        post_metadata_txt_pattern="",
        dirname_pattern=out_dir,
        filename_pattern="{date_utc:%Y%m%d_%H%M%S}_{shortcode}",
        quiet=False,
    )

    # Reuse saved instaloader session if available (run `instaloader --login <user>` once)
    try:
        L.load_session_from_file(username)
        print(f"✓ Loaded saved session for {username}")
    except FileNotFoundError:
        print("No saved session — proceeding anonymously (public accounts only).")
        print("Tip: run  instaloader --login <your_username>  once to save a session.")

    profile = instaloader.Profile.from_username(L.context, username)

    # Profile picture
    print(f"\n↓ Profile picture…")
    L.download_profilepic(profile)

    # Latest N posts
    print(f"\n↓ Latest {n_posts} posts…")
    posts = itertools.islice(profile.get_posts(), n_posts)
    for post in posts:
        L.download_post(post, target=out_dir)

    print(f"\n✓ Done — files saved to  {os.path.abspath(out_dir)}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Fetch IG profile pic + latest posts")
    p.add_argument("username", help="Instagram username (e.g. lindentar)")
    p.add_argument("--posts", type=int, default=10, help="Number of posts (default 10)")
    p.add_argument("--out", default="./ig-assets", help="Output directory")
    args = p.parse_args()
    run(args.username, args.posts, args.out)
