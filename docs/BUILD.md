# Build

Ce dépôt contient les sources complètes.

## Plugin Stream Deck
Le plugin est un dossier `*.sdPlugin` empaqueté en `.streamDeckPlugin` (zip).

Sous Windows (PowerShell) depuis `plugin/src/` :

```powershell
# Exemple : packer le plugin
Compress-Archive -Path .\* -DestinationPath EDF_Tempo_StreamDeck_Plugin.streamDeckPlugin -Force
```

## Helper
Le helper est un package Python + scripts.

- Lance manuellement pour tester :
```bat
py -3 tempo_helper.py --port 9123
```
