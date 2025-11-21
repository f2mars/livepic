# Livepic

Small utility to generate a grid of face images with slightly different head/eye positions using Replicate, then build a sprite sheet for a mouse-following avatar preview.

## Requirements

- Node.js 18+ (ESM + top-level await)
- ImageMagick with `montage` available on PATH
- A Replicate API token (`REPLICATE_API_TOKEN`)
- Source photo at `input/photo.jpeg` (JPEG/PNG; HEIC not supported)

## Setup

1. Install dependencies:

```bash
npm i
```

2. Create `.env` with your Replicate token:

```bash
REPLICATE_API_TOKEN=your_token_here
```

3. Place your source photo at `input/photo.jpeg`.

## Generate images

- Run with an odd grid size (default 5x5). The cost is estimated up front.

```bash
npm run generate            # generates 5x5 grid by default
npm run generate -- 7       # example: 7x7 grid
```

- The script is interactive and asks for confirmation before spending credits. In non-interactive environments it aborts unless you explicitly allow it:

```bash
LIVEPIC_AUTO_CONFIRM=1 npm run generate
```

- Outputs are written to `output/`:
  - Individual frames: `avatar_000.webp`, `avatar_001.webp`, ...
  - Sprite sheet: `AvatarSprite.webp`
  - Metadata: `sprite.json` (grid size + sprite cell size)

## Preview the sprite

Start the dev server and open the preview page:

```bash
npm run preview
```

## Notes

- Missing frames are retried up to two attempts; failures remain logged so you can rerun.
- Sprite generation needs `montage`; if it's missing, install ImageMagick (`brew install imagemagick` on macOS).
- Paths in the preview are relative and respect `import.meta.env.BASE_URL`, so deploying under a subpath (e.g. GitHub Pages) works.
