# Data Licensing

The **code** in this repository is licensed under [AGPL-3.0](./LICENSE).

The **camera dataset** in this repository (`public/data/*` and the GitHub Release assets at `cameras-us.json`, `cameras-by-city/*.json`) is derived from two upstream sources:

- **OpenStreetMap** via Overpass API — © OpenStreetMap contributors, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- **DeFlock** (deflock.me) — see `scripts/build-dataset/DEFLOCK-ARCHITECTURE.md` for upstream license details verified at build time

Downstream users of this dataset must comply with the most restrictive upstream license (ODbL). Attribution required.
