# Ambient Audio

Add ambient MP3 loops here. Target: ~2-4 minute loops, 128kbps.

## Required files

- `road-ambient.mp3`   — wind + tire on asphalt, open road
- `desert-ambient.mp3` — dry wind, sparse, occasional distant hawk
- `city-ambient.mp3`   — low urban hum, distant traffic

## Free sources

- freesound.org (Creative Commons)
- pixabay.com/music (free commercial use)
- soundsnap.com (loops section)

## Usage

AmbientSound.tsx selects the track based on SPOKY's current scene type.
Volume is fixed at 0.15 (very subtle, under commentary).
Auto-fades in/out over 2 seconds on toggle.
