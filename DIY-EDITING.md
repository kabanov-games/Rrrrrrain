# Rrrrrrain — быстрый DIY (без ИИ)

Как поменять модели, звуки и карту руками.
Все правки: сохранить файл → билд клиента → пуш → Railway задеплоит.

```bash
cd client
npm run build
```

Источник правды по геймплею: `CONCEPT.md` (петля ливня) и `shared/index.js`.
Карта систем: `docs/ARCHITECTURE.md`.

---

## Враги

Живые типы забега: **CACO**, **GROUND_CRAWLER**, **FLYING_SHOOTER**, босс **COLOSSUS**.
Скрытые DOOM-спрайты (IMP/PINKY/BARON) в каталоге не спавнятся.

Файлы: `client/public/models/monsters/*.glb`, реестр в `client/src/enemies3d.js` и `client/src/enemyV3.js`.

## Оружие и карты

`shared/index.js` → `WEAPONS`, `CARDS`, `ITEMS`, `LEVELS`, `RUN`.
Клиентские иконки: `client/src/weaponHud.js`, `client/src/pedestal.js`.

## Управление (concept2)

`E` — взаимодействие. `Q` — снаряжение. `R` — рывок (utility). `Tab` — инвентарь. Камера — третье лицо.

Вид **от третьего лица** (`client/src/controller.js`, `WORLD.CAM_DIST`). Модель мага — `client/src/otherplayer.js`.

Лобби: `client/src/world.js`. Арена/тема этапа: `client/src/worldV3.js` + `LEVELS`.
Портал: `client/src/netherPortal.js`.
