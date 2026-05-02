# Same Place

Same Place is a scrollytelling web project about the persistence of far-right support in Germany. This repository currently contains the initial scaffold: a dark Astro front end, a sticky MapLibre stage, Intersection Observer scene triggers, placeholder data files, and Python entry points for the later data pipeline.

## Current status

- All data files are placeholders for now.
- The regional geometry source is an empty GeoJSON `FeatureCollection`.
- The five-step story flow, sticky layout, and map state transitions are wired so real data can be dropped in later.

## Data sources

- GESIS for the historical 1933 election material.
- Der Bundeswahlleiter for contemporary federal election results.
- Amadeu Antonio Stiftung for right-wing incident reporting.

## Methodology note

Historical and modern regional boundaries do not line up directly. The intended processing pipeline will map historical results onto modern regional units while keeping each transformation explicit. The aggregation approach is informed by Voigtländer & Voth (2012) and will be documented in more detail once the real processing logic is added.

## Tech stack

- Astro
- MapLibre GL JS
- D3.js
- Vanilla JavaScript with Intersection Observer
- Python for data preparation scripts

## Development

```bash
pnpm install
pnpm run dev
```

The comparison scene is scaffolded to enhance with `maplibre-gl-compare` on the client. If the plugin cannot be fetched in the browser, the project falls back to a static split placeholder so the rest of the story still runs.

## Licence

The code scaffold is released under the MIT licence. Source datasets retain their own licences and attribution requirements.

## Package notes

The comparison scene uses `@maplibre/maplibre-gl-compare` as a local dependency. The project includes a scoped `.npmrc` entry so the `@maplibre` packages resolve from npmjs even if your wider environment defaults to a private registry.