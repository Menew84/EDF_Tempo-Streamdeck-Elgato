# Dépannage

## Port 9123 déjà utilisé / dossier ProgramData “utilisé”
Le helper tourne encore.

1) Trouver le PID sur 9123 :
```bat
netstat -ano | findstr :9123
```

2) Tuer le PID (remplace 12345) :
```bat
taskkill /PID 12345 /F
```

---

## Les stats affichent "?"
Le helper ne renvoie pas de stats (API inaccessible au moment T).

- Vérifie : http://127.0.0.1:9123/tempo
- Regarde `last_error`
