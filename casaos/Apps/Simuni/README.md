# Simuni CasaOS Package

CasaOS AppStore-style package for the Simuni family reservation app.

The compose file pulls a pinned image from GHCR (`ghcr.io/mavsar/simuni`) and
stores all app data in:

- `/DATA/AppData/simuni/data`

## Install option 1: CasaOS Custom Install (UI)

1. Open CasaOS → **App Store** → **Custom Install**.
2. Copy the contents of `docker-compose.yml` from this folder.
3. Paste into CasaOS and install.

## Install option 2: CasaOS CLI

```bash
casaos-cli app-management install -f /DATA/AppData/simuni/casaos/Apps/Simuni/docker-compose.yml
```

## First login

A default admin is seeded automatically on first run:

- username: `admin`
- password: `admin`

Change the credentials from the **Družine** page right after the first login.
The seed only runs while no users exist, so editing it later has no effect.

## Upgrading

Update the image tag in `docker-compose.yml`:

```yaml
image: ghcr.io/mavsar/simuni:vX.Y.Z
```
