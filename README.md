# MC_HEXA_MAP

Jednoduchý projekt pro návrh a tisk hexagonové herní mapy ve stylu objekového JS/HTML projektu.

## Charakter projektu

- flat-top hex grid
- pouze design a tisk
- více projektů v prohlížeči
- ukládání a načítání dat do JSON
- objektový přístup `MC_HEXA_MAP`

## Struktura

- `index.html` – základní UI
- `styles.css` – vizuální design a tiskový režim
- `js/` – modulární JS logika

## Spuštění

Pro lokální test stačí otevřít `index.html` v prohlížeči nebo spustit server:

```bash
cd D:/CODE
python -m http.server 8000
```

Poté otevřete:

```text
http://localhost:8000
```

## Další rozšíření

- export do SVG / PDF
- vrstvy terénu a dekorací
- nástroje pro editaci
- ukládání projektů do souboru JSON
- tisková příprava s marginy a měřítkem

## Terény jako PNG tiles (64x64)

Každý terén nyní používá vlastní PNG dlaždici 64x64 px:

- `terrains/louka/tile.png`
- `terrains/les/tile.png`
- `terrains/voda/tile.png`
- `terrains/hory/tile.png`
- `terrains/cesta/tile.png`
- `terrains/mesto/tile.png`
- `terrains/most/tile.png`
- `terrains/zed/tile.png`

Tyto soubory můžete editovat v libovolném grafickém editoru (Aseprite, Krita, Photoshop, GIMP). Po uložení se změna projeví přímo při dalším renderu mapy.

## Přechody Les/Louka (4 textury)

Pro dvojici `les` + `louka` je připravený režim se 4 přechodovými PNG (64x64, s průhledností):

- `terrains/transitions/les_louka/edge_canopy.png`
- `terrains/transitions/les_louka/edge_trunks.png`
- `terrains/transitions/les_louka/corner_canopy.png`
- `terrains/transitions/les_louka/corner_trunks.png`

Mapování je definované v:

- `terrains/transitions/les_louka/meta.json`
- `terrains/transitions/index.js`

Pravidlo varianty:

- sousední les pod loukou (na obrazovce níž) -> `canopy`
- sousední les nad loukou (na obrazovce výš nebo stejně) -> `trunks`

Orientační pravidla pro kreslení textur:

- edge textury jsou kreslené pro hranu s normálou 90° (spodní hrana)
- corner textury jsou kreslené pro vrchol 120° (spodní levý roh)

Renderer textury automaticky rotuje na správnou hranu/roh.

## Texture Lab (pixelart editor)

V aplikaci je nová záložka `Texture Lab` pro kreslení textur 64x64:

- výběr cílové textury (základní terény i přechody les/louka)
- kreslení jen do středové textury, vedle je náhled navazování v 7 hexech
- nástroje: štětec, guma, kapátko, obdélníkový výběr, výplň
- vrstvy: aktivní vrstva, viditelnost, krytí, pořadí
- maska vrstvy: přepínač `Edit masky` (maluješ do masky místo barvy)
- import PNG: načte obrázek a přepočítá jej nearest-neighbor na 64x64
- export PNG: uloží aktuálně složený výsledek jako PNG

Poznámka: export jde přes stažení PNG souboru v prohlížeči, pak jej stačí uložit zpět na odpovídající cestu textury v projektu.
