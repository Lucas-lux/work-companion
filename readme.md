# 🐱 Work Companion

Un petit chat de bureau qui t'aide à rester concentré·e, inspiré de [Workcat](https://workcat.app/en/).
Il vit en bas de ton écran, se promène, fait la sieste quand tu t'absentes… et vient **fermer d'un coup de patte**
les Shorts, TikTok, Reels et tout ce que tu t'es interdit.

Fonctionne sur **Windows** et **macOS** (Electron).

<p align="center"><img src="build/icon.png" width="160" alt="Mochi, le maneki-neko de Work Companion"></p>

## Télécharger

Dernière version : **[Releases](https://github.com/Lucas-lux/work-companion/releases/latest)**

| Système | Fichier |
| --- | --- |
| Windows 10/11 | `WorkCompanion-Setup-x.y.z.exe` |
| macOS, puce Apple (M1, M2…) | `WorkCompanion-x.y.z-arm64.dmg` |
| macOS, processeur Intel | `WorkCompanion-x.y.z-x64.dmg` |

L'app n'est pas signée par un certificat payant, donc le système affiche un avertissement au premier lancement :

- **Windows** : SmartScreen → « Informations complémentaires » → « Exécuter quand même ».
- **macOS** : glisse l'app dans Applications, ouvre-la une première fois (elle sera bloquée), puis
  Réglages Système → Confidentialité et sécurité → « Ouvrir quand même ».
  Si macOS dit que l'app est « endommagée », lance dans le Terminal :
  `xattr -dr com.apple.quarantine "/Applications/Work Companion.app"`

## Ce qu'il fait

- **Compagnon animé** : il marche, cligne des yeux, ronronne quand tu le caresses (clic), se laisse porter (glisser),
  dort quand tu es absent·e et reste sagement dans un coin pendant les sessions focus.
- **Ferme les distractions** : quand tu ouvres un site ou une app interdite, il se fâche, court jusqu'à la fenêtre,
  te laisse quelques secondes pour partir de toi-même, puis ferme l'onglet ou l'app.
- **Suivi du temps** : travail / distraction / autre, avec une frise de la journée, le détail par app ou site,
  un score de focus et un historique sur 7 ou 30 jours. Le temps d'absence n'est pas compté.
- **Sessions focus** (façon Pomodoro) : pendant une session, il bloque en plus les sites marqués « pendant le focus »,
  coupe les notifications et ferme les apps qui te dérangent (Discord, WhatsApp…). Une pause est enchaînée automatiquement.
- **Rappels de pause** après 50 minutes de travail d'affilée.
- Tout reste **en local** : rien n'est envoyé sur Internet.

## Lancer en développement

```bash
npm install
npm start
```

L'app se loge dans la zone de notification (Windows) ou la barre de menus (macOS).
Clic droit sur le chat ou sur l'icône pour lancer un focus, mettre les blocages en pause ou ouvrir le tableau de bord.
Double-clic sur le chat pour ouvrir le tableau de bord.

## Créer l'installeur

```bash
npm run dist:win   # sous Windows -> dist/WorkCompanion-Setup-x.y.z.exe
npm run dist:mac   # sous macOS   -> dist/WorkCompanion-x.y.z-arm64.dmg et -x64.dmg
```

L'installeur macOS doit être construit sur un Mac. Pas besoin d'en avoir un : à chaque release publiée sur GitHub,
le workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) construit les deux `.dmg` sur un runner
macOS et les attache à la release. Il se lance aussi à la main depuis l'onglet Actions (« Build macOS », avec le tag).

## Comment il sait sur quel site tu es (sans rien installer dans le navigateur)

- **Windows** : l'app lit la barre d'adresse du navigateur actif via l'API d'accessibilité (UI Automation).
  Ça marche avec Chrome, Edge, Brave, Comet, Opera, Vivaldi, Arc, Firefox… sans extension.
- **macOS** : l'app interroge directement Chrome, Edge, Brave, Arc et Safari (macOS demande l'autorisation
  d'« automatisation » pour chaque navigateur, une seule fois).
- En dernier recours, il se rabat sur le **titre de la fenêtre** (mots-clés des règles).

### L'extension navigateur (optionnelle)

Elle n'est utile que si ton navigateur n'est pas reconnu, ou pour fermer l'onglet proprement au lieu d'envoyer Ctrl+W.

- **Chrome / Edge / Brave / Comet / Opera** : `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → dossier `extension/`
- **Firefox** : `about:debugging` → « Ce Firefox » → « Charger un module temporaire » → `extension/manifest.json`

Le bouton « Ouvrir le dossier de l'extension » (onglet Blocages) ouvre le bon dossier, y compris dans l'app installée.
L'extension communique avec l'app via `ws://127.0.0.1:17345`. Seules les extensions peuvent s'y connecter, pas les pages web.

## Les sprites du chat (pixel art)

Le maneki-neko livré avec l'app est dans `assets/sprites/` : une planche par animation (`idle`, `walk`, `sleep`,
`click`, `alert`, `happy`) et un `sprites.json` (vitesse, figures à garder). Au chargement, l'app détoure le fond,
repère chaque figure, la recadre et la pose au sol, puis réduit la bande : les planches générées par IA n'ont pas
besoin d'être parfaitement régulières. Les JPEG renommés en `.png` sont acceptés.

Pour remplacer les sprites sans toucher au projet : Réglages → « Ouvrir le dossier des sprites »
(`%APPDATA%\Work Companion\sprites`), dépose tes fichiers, « Recharger ». Ce dossier a priorité sur ceux de l'app.
Le format complet, les options de `sprites.json` et les **prompts pour générer chaque animation** sont dans
[assets/sprites/LISEZMOI.md](assets/sprites/LISEZMOI.md).

## Le logo

`build/icon-source.jpg` est le logo d'origine (fond magenta). `npm run icons` le détoure et génère l'icône de
l'app (`build/icon.png`), celles de la barre des tâches (`assets/icon/`) et celles de l'extension.
Sans image source, un maneki-neko en pixel art dessiné dans le code sert d'icône.

## Permissions macOS

- **Accessibilité** (Réglages Système → Confidentialité et sécurité → Accessibilité) : lire le titre des fenêtres
  et envoyer ⌘W pour fermer un onglet.
- **Automatisation** : lire l'onglet actif des navigateurs.
- **Ne pas déranger** : macOS ne permet pas de l'activer directement. Crée deux raccourcis dans l'app Raccourcis
  (« Activer Concentration » / « Désactiver Concentration ») et renseigne leurs noms dans Réglages → Sessions focus.

## Règles de blocage

Chaque règle a un mode :

| Mode | Effet |
| --- | --- |
| **Toujours** | fermé dès qu'il est au premier plan (Shorts, TikTok, Reels par défaut) |
| **Pendant le focus** | fermé seulement pendant une session focus (Instagram, X, Reddit, Netflix, Twitch, Steam…) |
| **Compter** | autorisé, mais compté comme distraction (YouTube par défaut) |

Un motif peut contenir un chemin (`youtube.com/shorts`) ou plusieurs adresses séparées par des virgules
(`x.com, twitter.com`). Les « mots du titre » servent de secours quand l'extension n'est pas installée.
Dans l'onglet « Aujourd'hui », tu peux reclasser une activité (travail / distraction / neutre) : le chat s'en souvient.

## Limites connues

- **Notifications Windows** : l'app désactive les bannières via le même réglage que Paramètres → Notifications.
  Selon la version de Windows, le changement peut ne s'appliquer qu'aux nouvelles notifications. Pour une coupure
  totale, active aussi « Ne pas déranger » depuis le centre de notifications.
- La fermeture d'un onglet envoie **Ctrl+W / ⌘W** à la fenêtre du navigateur (seulement si elle est toujours au premier plan) ; avec l'extension, l'onglet est fermé directement.
- Sous Windows, si tu es en train de taper dans la barre d'adresse, c'est ce texte qui est lu pendant quelques secondes.
- Les apps de la liste « à fermer au début d'un focus » sont **fermées de force** (pense à enregistrer ton travail).
- Le chat vit sur l'écran principal.

## Structure

```
src/main/          process principal : surveillance, règles, focus, stockage, barre des tâches
src/main/platform/ détection de la fenêtre active + actions (PowerShell sous Windows, JXA sous macOS)
src/renderer/      le chat (companion/) et le tableau de bord (dashboard/)
assets/sprites/    sprites pixel art livrés avec l'app + LISEZMOI (format et prompts)
extension/         extension navigateur optionnelle (Manifest V3, Chrome + Firefox)
```

Les données sont stockées dans `%APPDATA%\Work Companion\work-companion.json` (Windows)
ou `~/Library/Application Support/Work Companion/work-companion.json` (macOS).
