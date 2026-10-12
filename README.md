<p align="center">
  <img src="src/brand/logo.png" alt="Blade & Blood: Adaptive AI Edition" width="720">
</p>

<p align="center">
  <b>A pixel-art fighting game where the CPU learns how you fight.</b><br>
  <a href="https://blade-and-blood.web.app">Play it in your browser</a>
</p>

Blade & Blood is a 2D fighting game that runs in the browser. It's written in plain HTML, JavaScript and canvas, with no build step and no server code. The CPU watches your habits during a fight and learns to counter them, so it gets harder the more predictable you are.

- **10 heroes and 5 bosses**, each with a special, an ultimate and a passive
- **Story mode:** five bosses in a row who remember how you fight
- **Two arenas:** Twilight Forest and Cold Corridors
- **Two players** on one keyboard, or on two devices over Wi-Fi by scanning QR codes
- **AI vs AI:** watch two learning AIs study each other
- **AI Vision:** an overlay that shows what the CPU predicts you'll do next
- **English and Bengali (বাংলা)**, plus touch controls for phones and tablets

Based on the original game by Tierra Bynum (https://tierrabynum-fighting-game.netlify.app).

[[_TOC_]]

## Screenshots

![Nyra the Huntress fights Mordrak the Evil Wizard in the Cold Corridors](media/gameplay.mp4)

| Main menu | Fighter select | AI Vision |
| --- | --- | --- |
| ![Main menu](media/menu.png) | ![Fighter select](media/select.png) | ![A fight with AI Vision on](media/fight.png) |

## Play it

**Online:** https://blade-and-blood.web.app

**On your own computer:** open `index.html` through any local web server. Opening the file directly doesn't work, because browsers block loading the sprites from `file://`. For example:

```
python -m http.server
```

then visit http://localhost:8000.

### Hosting it yourself

Any static host works. Wi-Fi play needs the game served over HTTPS, because it uses a direct browser-to-browser connection (WebRTC) and the camera. Every other mode works anywhere.

- **Firebase Hosting** (already set up in `firebase.json`): `firebase deploy --only hosting`. The `media/` folder and the README aren't uploaded.
- **GitLab Pages:** add a `.gitlab-ci.yml` like this one, push, and the game appears at `https://<you>.gitlab.io/<repo>/`.

  ```yaml
  pages:
    image: alpine:latest
    script:
      - mkdir public
      - cp -r index.html src public/
    artifacts:
      paths:
        - public
    rules:
      - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  ```

- **Netlify:** drag the folder onto https://app.netlify.com/drop.

## Modes

| Mode | What it is |
| --- | --- |
| **Story mode** | Five bosses in a row, each harder than the last. They talk before each fight and call out your habits. |
| **Quick match: Easy, Medium, Hard** | One match against a learning CPU. Hard unlocks after you beat Medium. |
| **2 players, one keyboard** | Two people on one computer. |
| **Wi-Fi 2 players (QR)** | Two phones, tablets or computers on the same Wi-Fi, connected by scanning QR codes. |
| **AI vs AI** | Watch two learning AIs study each other. |

The learning AI is on in every single-player mode and off in both two-player modes. While you're on the main menu, two CPU fighters battle in the background with random fighters and a random arena.

## Controls

| Action | Player 1 | Player 2 | Notes |
| --- | --- | --- | --- |
| Move | A / D (or arrows when playing alone) | ← / → | |
| Jump | W | ↑ | Press again in the air to double jump |
| Block | S (hold) | ↓ (hold) | 15% chip damage, must face the attack |
| Parry | Tap S just before a hit | Tap ↓ | The attacker is stunned and open to a counter |
| Dash | Left Shift or H | Right Shift or Numpad 0 | Short invincible burst |
| Quick slash | J or Space | , or Numpad 1 | Chain them into combos |
| Heavy slash | K | . or Numpad 2 | Launches and knocks back |
| Special | L, or ↓ → + J | / or Numpad 3 | Costs part of the power bar (the notch) |
| Ultimate | U | ' or Numpad 5 | Needs a full power bar |
| Throw | O, or → + K up close | ; or Numpad 6 | Beats blocking. Press Heavy as you're grabbed to escape |
| Guard Break | ↓ ← + K | | Unblockable heavy, costs 25 power |
| Autopilot | T | | Your own AI fights for you; any fight key takes over |
| AI Vision | V | | Show or hide the learning overlay |
| Pause | Esc or P | | |

Critical hits: 10% of heavy hits do 1.5× damage. Finishing blows zoom in with slow motion.

**Phones and tablets:** on-screen buttons appear automatically. Held upright, the arrows are on the left and six attack buttons on the right. Held sideways, the buttons sit in the margins beside the arena so they never cover the fight. **Swipe up** on the left half of the screen to jump. Android phones **vibrate** on hits, parries, throws and K.O. (turn it off in Settings; iPhones don't support web vibration).

**Choosing a fighter:** fighters come six to a page: heroes (two pages), then bosses. Arrow keys move between tiles and roll over to the next or previous page at the edges. Q / E or Page Up / Page Down jump a page, and on touch screens you can tap ◀ ▶ or swipe the grid.

## Fighters

| Fighter | Title | Health | Special | Ultimate | Passive |
| --- | --- | --- | --- | --- | --- |
| **SAMURAI MACK** | The Wandering Blade | 95 | Flame Orb | Inferno | Builds power 20% faster |
| **KENJI** | The Masked Ronin | 95 | Gale Crescent | Tempest | Dash recharges 40% faster |
| **ALDRIC** | The Oathsworn | 120 | Holy Lance | Judgement | Blocking takes no damage and builds double power |
| **SIR GARETH** | The Iron Wall | 125 | Shield Charge | Earthquake | Heavy slash and Shield Charge shrug off hits |
| **NYRA** | The Huntress | 88 | Spear Throw | Spear Volley | Triple jump and the fastest run |
| **KAITO** | The Blade Dancer | 90 | Flash Step | Thousand Cuts | Two air dashes |
| **BRANN** | The Berserker | 100 | Leap Slam | Blood Rage | Hits harder as his health drops |
| **MORDRAK** | The Evil Wizard | 95 | Shadow Orb | Doom Rain | Power refills on its own |
| **SLY** | The Pickpocket | 92 | Throwing Knives | Ambush | Every hit steals power |
| **BRUTUS** | The Brute | 135 | Ground Slam | Avalanche | Heavy swing shrugs off hits |

Bosses (unlock them in story mode):

| Boss | Special | Ultimate | Passive |
| --- | --- | --- | --- |
| The Fallen King | Crown Slash | Royal Decree | Heavy slash can't be interrupted |
| The Archmage | Arcane Bolt | Arcane Storm | Dash is a teleport |
| The Bladekeeper | Steel Shard | Blade Field | Guard stance, rolling dash, 4-hit heavy, air attack |
| Bringer of Death | Grasp of Death | Death's Harvest | Heals for 25% of damage dealt |
| The Demon Lord | Hellfire Wave | Infernal Rain | 160 health, giant reach |

## Story mode

| Chapter | Boss | Arena |
| --- | --- | --- |
| 1 | The Fallen King | Twilight Forest |
| 2 | The Archmage | Cold Corridors |
| 3 | The Bladekeeper | Twilight Forest |
| 4 | Bringer of Death | Cold Corridors |
| 5 | The Demon Lord | Cold Corridors |

- Each boss walks in as a shadow, stops and talks. Tap or press Enter to read on, or Skip.
- One learning AI follows you through the whole story, so later bosses already know your habits and say so ("He says you always walk straight at your enemy").
- Losing lets you retry the chapter. Beating a boss unlocks it in the other modes.
- Difficulty, tested with a medium-skill AI playing the hero (50 matches per chapter): the hero wins 100%, 64%, 54%, 52% and 14% of chapters 1 to 5.

## The learning AI

The CPU records every action you take (quick, heavy, special, ultimate, throw, guard break, jump, dash, block, approach, retreat, wait) along with the situation. It keeps three tables of counts:

1. What you do after your last action (a first-order Markov chain).
2. What you do after your last two actions (a second-order Markov chain).
3. What you do in the current situation: distance (close, mid, far) plus what the CPU is doing.

Older habits fade with every update, so the model follows you when you change style. When it's confident, the CPU counters:

| You are likely to | CPU counter |
| --- | --- |
| Attack | Block, then punish the recovery |
| Approach or dash in | Swing first as you walk into range |
| Jump in | Step back so the jump lands short, then hit on landing |
| Throw a special | Jump over it, or block and punish |
| Retreat or wait | Zone with its special, or dash in |
| Block | Jump over (cross up) or chip with its special |
| Throw | Jump back out of reach |
| Guard break | Dash back out of range |

Against blockers it also throws and uses guard breaks, and it escapes throws and parries more often on higher levels (bosses parry most). Easy learns slowly, Medium faster, Hard at full speed. What each AI learns is saved in your browser and loaded next time; "Forget AI memory" clears it (click twice).

**AI Vision** (V) shows the learning live: a tracking box that locks on when the CPU winds up, a movement trail and floor heatmap, next-move probability bars, "PREDICTED!" or "MISSED" after each guess, an AI log, an AI brain panel, a "PATTERN LOCKED" stamp and an accuracy meter.

**Autopilot** (T): in a CPU match, "YOUR AI" studies the CPU from the first second. Turn Autopilot on and it fights for you.

## Settings, stats and records

Settings (menu, pause screen, or the Settings chip under the arena) are saved in your browser:

| Setting | Options |
| --- | --- |
| Language | English, বাংলা |
| Round time | 30 s, 60 s, 99 s |
| Match length | 1 round, best of 3, best of 5 |
| Game speed | Normal, Fast (1.25×), Turbo (1.5×) |
| Music, sound effects | Off, Low, Mid, High |
| Vibration | On, Off |
| AI Vision | On, Off |

**Reset progress** (two clicks) erases story progress, unlocked bosses, the Hard level and records, and keeps your settings.

**Language:** switching to বাংলা changes the whole game at once: menus, the HUD, story dialogue, fighter names and bios, move names, the AI Vision overlay, stats and the Wi-Fi screens. Bengali uses Bengali digits (০১২…). Browsers set to Bengali start in Bengali. Bengali letters use the bundled Baloo Da 2 font, so nothing extra is downloaded.

**Music** is generated in code, like the sound effects: a step sequencer plays a title theme, a Forest and a Castle track, a boss theme, a story walk-in theme, and win and lose stings. Browsers only allow sound after the first tap or key press.

**Stats** after every match and story chapter: damage dealt, hits landed, accuracy, best combo, blocks, parries, throws, specials and ultimates.

**Records:** wins and losses per fighter, shown on the menu, the select screen and the result screen. Matches with Autopilot or AI vs AI don't count.

## Wi-Fi 2 players

1. Open the hosted game on both devices, on the same Wi-Fi.
2. Device A: **Wi-Fi 2 Players → Host a game**. A QR code appears.
3. Device B: scan that QR code with the camera app. It opens the game and shows an answer QR code. (Or choose **Join** and paste the code.)
4. Device A: **Next**, then scan device B's answer code (or paste it).
5. Both pick a fighter; the host picks the arena. The host plays on the left and the host's settings are used.

How it works: there's no server. The QR codes carry the WebRTC connection details, compressed to about 200 characters so they scan easily. The game runs in **lockstep**: both devices simulate the same fight, frame by frame, from the same inputs and the same random numbers, with a 3-frame (50 ms) input delay. Every half second the host sends a checksum; if the guest ever drifts, it takes the host's state and carries on. In testing, two browsers stayed identical for 1,900 frames, held 60 fps with 40 ms of random lag, and repaired a forced desync within half a second.

If it won't connect, check that both devices are on the same network. Guest or hotel Wi-Fi often keeps devices apart. Pages that block WebRTC or the camera show "Wi-Fi play needs the hosted version".

**Testing from your own computer:** if the host opens the game at `localhost` or `127.0.0.1`, the phone can't open that address. Step 1 then shows a box for this computer's Wi-Fi address: find its IPv4 address with `ipconfig`, type it with the port (for example `192.168.1.5:8000`) and press **Use**, and the QR code points there instead. The web server has to accept other devices: `python -m http.server` does; VS Code Live Server needs its host setting changed from `127.0.0.1` to `0.0.0.0`. Windows may ask to allow it through the firewall.

## Project layout

Everything the game loads lives in `src/`. `index.html` stays at the root, because that's the page the host serves.

```
index.html              the page: menus, styles, script tags
src/
  main.js               game loop, rounds, combat, HUD, menus
  characters/
    roster.js           every fighter and boss: stats, moves, persona, quotes
    heroes/<name>/      sprite sheets (and licence) for each hero
    bosses/<name>/      sprite sheets (and licence) for each boss
  arenas/
    arenas.js           the two arenas
    forest/             Twilight Forest
    castle/             Cold Corridors
  engine/               utils, Sprite and Fighter classes, effects, input
  ai/                   CPU opponent, learning model, AI Vision overlay
  audio/                sound effects and generated music
  modes/                story mode, Wi-Fi play
  ui/                   fighter and arena select, settings, stats, saved progress, text
  brand/                logo and cover art
  fonts/                Baloo Da 2 (Bengali letters only)
  vendor/               QR code libraries, loaded only for Wi-Fi play
media/                  README video and screenshots (not deployed)
```

| File | What it does |
| --- | --- |
| `src/main.js` | Game loop (fixed 60 steps a second), rounds, combat, HUD, menus |
| `src/characters/roster.js` | Every fighter and boss: stats, moves, persona, quotes |
| `src/arenas/arenas.js` | The two arenas |
| `src/engine/classes.js` | `Sprite` and `Fighter`, including throws, parries and motion inputs |
| `src/engine/effects.js` | Particles, floating text, projectiles, screen shake |
| `src/engine/input.js` | Keyboard, touch, swipe-to-jump and vibration |
| `src/engine/utils.js` | Canvas, image loading and small helpers |
| `src/ai/ai.js` | CPU opponent and difficulty levels |
| `src/ai/learner.js` | The learning model and saved AI memory |
| `src/ai/aivision.js` | The AI Vision overlay |
| `src/audio/audio.js`, `src/audio/music.js` | Sound effects and generated music (Web Audio) |
| `src/modes/story.js` | Story chapters, dialogue and flow |
| `src/modes/net.js` | Wi-Fi play: QR connection and lockstep netcode |
| `src/ui/select.js` | Fighter and arena select |
| `src/ui/settings.js` | Settings and the settings panel |
| `src/ui/stats.js` | Per-match stats |
| `src/ui/progress.js` | Saved progress (localStorage, every access wrapped in try/catch) |
| `src/ui/i18n.js` | Every piece of text, in English and Bengali |

The scripts are plain browser scripts loaded in order by `index.html`, so there's no build step. If you add a file, add its `<script>` tag there too.

**Adding a fighter:** put the sprite sheets in `src/characters/heroes/<name>/` (or `bosses/`) and add an entry to `ROSTER` and `ROSTER_ORDER` in `src/characters/roster.js`, with `folder` pointing at that directory. `anchor` is the point between the feet inside one frame, and `facing` is the direction the art faces (1 = right, -1 = left). Add the fighter's text to `src/ui/i18n.js` in both languages.

## Credits

- Original game: Tierra Bynum, https://tierrabynum-fighting-game.netlify.app
- Samurai Mack, Kenji, Fantasy Warrior, Hero Knight, Huntress, Martial Hero 3, Medieval Warrior Pack 3, Evil Wizard 2, Evil Wizard 3 and Medieval King Pack 2 art: LuizMelo, https://luizmelo.itch.io (CC0).
- Light Bandit and Heavy Bandit art: Sven Thole, used under his EULA (free for games; do not redistribute the raw assets on asset or file-sharing sites). See `src/characters/heroes/sly/EULA.txt`.
- Bringer of Death art: Clembod, https://clembod.itch.io (free for games; do not redistribute the raw files).
- Boss Demon Slime and Elementals: Metal Bladekeeper art: chierit, https://chierit.itch.io, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Frames were stitched into sprite sheets for this game.
- Cold Corridors arena: ansimuz, https://ansimuz.itch.io (CC0).
- Logo and cover art (`src/brand/`): made with ChatGPT image generation for this project.
- QR Code Generator for JavaScript: Kazuhiko Arase (MIT). jsQR: Cosmo Wolfe (Apache 2.0). See `src/vendor/README.md`.
- Fonts: Press Start 2P and VT323 from Google Fonts, and Baloo Da 2 by Ek Type (bundled in `src/fonts/`), all under the SIL Open Font License (`src/fonts/OFL.txt`).

Because the Sven Thole and Clembod licences forbid redistributing their raw files, keep the repository's art inside the game rather than offering it as a separate download.

<p align="center">
  <img src="src/brand/cover.png" alt="Blade & Blood cover art: a samurai and an evil wizard face off between a twilight forest and a castle" width="100%">
</p>
