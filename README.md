# EDF Tempo Stream Deck (Elgato)

Mainteneur : **Ménèw**

Plugin Stream Deck + helper local (localhost) pour afficher l’option **EDF Tempo** :
- Couleur **AUJ / DEMAIN / HIER**
- **Stats** : jours **restants** et **consommés** (Bleu / Blanc / Rouge)

## ✅ Code source 100% public
- `plugin/src/` : sources complètes du plugin Stream Deck (JS/HTML/manifest/assets)
- `helper/src/` : sources complètes du helper Python (API locale)

Les binaires prêts à installer sont fournis dans `releases/v1.0.0/` (et recommandés pour tes amis).

## 🚀 Installation rapide (recommandée)
1. Va dans `releases/v1.0.0/`
2. Télécharge `EDF_Tempo_StreamDeck_AllInOne_v1.0.0.zip`
3. Dézippe
4. Clic droit → **Exécuter en tant qu’administrateur** : `INSTALL_SILENT.bat`
5. Dans Stream Deck ajoute les actions :
   - Tempo – Aujourd’hui / Demain / Hier
   - Stats – Bleu / Blanc / Rouge

## 🔎 Vérification
Ouvre :
- http://127.0.0.1:9123/tempo  
Tu dois voir : `today`, `tomorrow`, `yesterday`, `stats`.

## 🧰 Dépannage
Voir : `docs/TROUBLESHOOTING.md`

## 🛠 Build (développeur)
Voir : `docs/BUILD.md`

## Licence
MIT — voir `LICENSE`
