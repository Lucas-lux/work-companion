# Sprites du chat (pixel art)

Dépose ici les images de ton maneki-neko. Dès qu'un `idle.png` est présent, le compagnon utilise tes sprites
à la place du chat vectoriel. Dans le tableau de bord : Réglages → « Recharger ».

## Les fichiers attendus

| Fichier | Quand il est joué | Images conseillées |
| --- | --- | --- |
| `idle.png` | au repos : le chat fait signe de la patte comme un maneki-neko | 6 (boucle) |
| `walk.png` | il marche / court vers la fenêtre à fermer | 6 (boucle) |
| `sleep.png` | tu es absent·e, il dort | 4 (boucle) |
| `click.png` | il tape sur la fenêtre pour la fermer | 4 (une seule fois) |
| `alert.png` *(optionnel)* | il vient de repérer une distraction | 2 à 4 |
| `happy.png` *(optionnel)* | caresse, session terminée | 4 |
| `dangle.png` *(optionnel)* | tu le portes avec la souris | 2 |

Sans `alert.png` / `happy.png` / `dangle.png`, l'app réutilise `idle.png`. Sans `run.png`, elle accélère `walk.png`.

## Le format (important)

- **Une bande horizontale par animation** : toutes les images côte à côte, de gauche à droite, **même taille, sans marge**.
  Exemple : 6 images de 64×64 → un PNG de 384×64.
- **Images carrées** (64×64, 96×96 ou 128×128). L'app déduit le nombre d'images avec largeur ÷ hauteur.
  Si tes images ne sont pas carrées, indique le nombre d'images dans `sprites.json` (voir plus bas).
- **Le chat regarde vers la droite.** L'app le retourne toute seule quand il va à gauche.
- **Fond transparent**, ou fond uni **vert `#00FF00`** ou **magenta `#FF00FF`** : l'app le détoure automatiquement.
  Pas de damier gris/blanc « façon transparence », il ne serait pas retiré.
- Le chat est **centré horizontalement** et ses **pattes touchent le bas** de chaque image, à la même position d'une image à l'autre.
- Même personnage, même palette et même taille dans toutes les animations.

## Ce que l'app corrige toute seule

Les planches générées par IA sont rarement parfaites, alors au chargement l'app :

- accepte les **JPEG renommés en .png** (mais sans transparence : préfère un vrai PNG si ton outil le permet) ;
- **détoure** le fond uni, y compris les poches entre les pattes, et nettoie les franges ;
- **repère chaque figure** grâce aux vides entre elles (et coupe les groupes qui se touchent), puis recadre,
  centre et pose chaque figure au sol dans une case de taille commune ;
- réduit la bande à deux fois la taille d'affichage, et met le résultat en cache.

Si la détection se trompe (figure ratée, glitch de génération), choisis les figures à garder avec `pick` (voir ci-dessous) :
les numéros commencent à 0, de gauche à droite. La ligne « Sprites » des Réglages indique combien de figures ont été trouvées.

## `sprites.json` (optionnel)

```json
{
  "displayHeight": 128,
  "animations": {
    "idle":  { "pick": [2, 3, 4, 6], "fps": 4 },
    "walk":  { "frames": 6, "fps": 10 },
    "sleep": { "fps": 2 },
    "click": { "fps": 9, "loop": false }
  }
}
```

- `displayHeight` : hauteur du chat à l'écran en pixels (128 par défaut) ;
- `height` (par animation) : hauteur à l'écran de cette animation. Les planches générées n'ont pas toutes la même
  échelle : règle `height` pour que la tête du chat fasse la même taille dans toutes les poses (prends une animation
  comme référence, ici `walk`, et ajuste les autres à l'œil) ;
- `frames` : force une découpe régulière en N cases si la détection automatique échoue ;
- `pick` : numéros des figures détectées à garder, dans l'ordre de lecture ;
- `fps`, `loop`, et `"file": "mon-fichier.png"` pour un nom différent.

## Prompts pour générer les sprites

Le plus fiable : générer **d'abord une planche de référence** du personnage, puis la joindre comme image de référence
à chaque prompt d'animation (Nano Banana / Gemini, GPT Image, Midjourney `--cref`, Leonardo…).
Pour un vrai rendu pixel art avec des frames propres, PixelLab (pixellab.ai) ou Aseprite donnent les meilleurs résultats ;
les générateurs classiques produisent parfois des « faux pixels » irréguliers et des frames décalées.

### 0. Planche de référence du personnage

```
Pixel art character reference sheet of a kawaii maneki-neko lucky cat, chibi proportions (big round head, small body),
white fur with one orange patch over the left eye and a black patch on the back, pink inner ears, rosy blush cheeks,
happy closed eyes drawn as two small arches (^ ^), tiny pink nose, red collar with a golden bell, right front paw raised
in the classic beckoning pose. Show the same character from the front, from the side facing right, and from the back.
Clean 1-bit black outline, limited palette (8 colors), no anti-aliasing, no dithering, crisp 64x64 pixel grid,
flat solid magenta background (#FF00FF), no text, no watermark.
```

### 1. `idle.png` – signe de la patte (maneki-neko)

```
Pixel art sprite sheet, exactly 6 frames in a single horizontal row, evenly spaced, each frame 64x64 pixels,
total image 384x64. Same kawaii maneki-neko cat as the reference image, side view facing right, sitting upright
like a lucky cat statue. Animation loop of the beckoning gesture: the raised right paw slowly waves down and back up,
the bell on the collar swings slightly, the tail tip flicks on the last frames. The body and head stay at the same
position in every frame, paws touching the bottom edge of the frame. Clean outline, limited palette, no anti-aliasing,
flat solid magenta background (#FF00FF), no grid lines, no frame borders, no numbers, no text.
```

### 2. `walk.png` – marche vers la fenêtre

```
Pixel art sprite sheet, exactly 6 frames in a single horizontal row, evenly spaced, each frame 64x64 pixels,
total image 384x64. Same kawaii maneki-neko cat as the reference image, walking cycle on four paws, side view facing
right, determined cute expression with small eyebrows, bell bouncing on the collar, tail up. Classic 6-frame walk cycle
(contact, down, passing, up), the cat stays centered in each frame with paws touching the bottom edge.
Clean outline, limited palette, no anti-aliasing, flat solid magenta background (#FF00FF), no grid lines, no text.
```

### 3. `sleep.png` – il dort

```
Pixel art sprite sheet, exactly 4 frames in a single horizontal row, evenly spaced, each frame 64x64 pixels,
total image 256x64. Same kawaii maneki-neko cat as the reference image, curled up asleep in a loaf position,
side view facing right, eyes closed, tail wrapped around the body. Gentle breathing loop: the body rises and falls
by one or two pixels, a small "z" appears above the head on frames 3 and 4. Cat centered, touching the bottom edge.
Clean outline, limited palette, no anti-aliasing, flat solid magenta background (#FF00FF), no grid lines, no text.
```

### 4. `click.png` – il tape sur la fenêtre

```
Pixel art sprite sheet, exactly 4 frames in a single horizontal row, evenly spaced, each frame 64x64 pixels,
total image 256x64. Same kawaii maneki-neko cat as the reference image, side view facing right, standing on its hind
legs and slapping something in front of it with its right front paw: frame 1 paw raised high, frame 2 paw swinging
forward, frame 3 paw fully extended to the right with two small pink impact sparks, frame 4 paw back, satisfied
smug expression. Cat stays at the same position, paws touching the bottom edge. Clean outline, limited palette,
no anti-aliasing, flat solid magenta background (#FF00FF), no grid lines, no text.
```

### 5. `alert.png` – il a repéré une distraction *(optionnel)*

```
Pixel art sprite sheet, exactly 2 frames in a single horizontal row, each frame 64x64 pixels, total image 128x64.
Same kawaii maneki-neko cat as the reference image, side view facing right, startled and slightly angry: ears up,
fur puffed, tail straight up and bushy, small frown, a small "!" above the head. Frame 2 is the same pose shifted
one pixel up (hop). Clean outline, limited palette, no anti-aliasing, flat solid magenta background (#FF00FF), no text.
```

### 6. `happy.png` – content *(optionnel)*

```
Pixel art sprite sheet, exactly 4 frames in a single horizontal row, each frame 64x64 pixels, total image 256x64.
Same kawaii maneki-neko cat as the reference image, side view facing right, happy little bounce: eyes as joyful arches,
open smiling mouth, small pink hearts floating up, tail wagging, bell bouncing. Cat centered, paws on the bottom edge.
Clean outline, limited palette, no anti-aliasing, flat solid magenta background (#FF00FF), no text.
```

### Logo (haute résolution)

```
App icon, kawaii maneki-neko lucky cat, pixel art style, chibi proportions, white fur with an orange patch over one eye
and a black patch on the body, happy closed eyes (^ ^), pink blush cheeks, red collar with a golden bell, right paw raised
in the beckoning pose, front view, centered, clean bold outline, limited palette, no anti-aliasing, 1024x1024,
flat solid magenta background (#FF00FF), no text.
```

## Vérifier le résultat

Après génération, ouvre l'image et vérifie que :

1. les images sont toutes de la même largeur et régulièrement espacées (sinon découpe/réaligne dans Aseprite, Piskel ou Photopea) ;
2. le fond est bien un aplat uni (pas de dégradé, pas de damier) ;
3. le chat ne « saute » pas d'une image à l'autre.

Ensuite : dépose les PNG ici → Réglages → Recharger.
