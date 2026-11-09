"""Génère le favicon et les icônes du site à partir de application-web/fichiers-statiques/logo-source.png.

Usage : python outils/generer-icones.py   (dépendance : pip install pillow)

- Le fond noir du logo devient transparent (la transparence est calculée d'après la luminosité,
  ce qui garde des bords lisses).
- favicon.ico (16, 32, 48 px) et icones/favicon-32.png : fond transparent, pour l'onglet du navigateur.
- icones/apple-touch-icon.png (180 px) et icones/icone-192.png / icone-512.png : fond de la couleur du site,
  car iOS et les applications installées n'aiment pas la transparence.
- icones/icone-masquable-512.png : version « maskable » pour Android (le système découpe l'icône en rond,
  en carré arrondi...) : logo réduit pour rester dans la zone sûre (cercle de 80 % du côté).
"""
import os

from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIQUES = os.path.join(RACINE, "application-web", "fichiers-statiques")
SOURCE = os.path.join(STATIQUES, "logo-source.png")
DOSSIER_ICONES = os.path.join(STATIQUES, "icones")
FOND_SITE = (11, 18, 32, 255)  # --fond : #0b1220


def logo_transparent() -> Image.Image:
    """Fond noir vers transparent : alpha = luminosité maximale du pixel, couleur = orange pur."""
    image = Image.open(SOURCE).convert("RGB")
    pixels = image.load()
    largeur, hauteur = image.size
    # Couleur dominante du logo (pixels les plus vifs) pour reconstruire des bords propres.
    vifs = [pixels[x, y] for x in range(largeur) for y in range(hauteur) if max(pixels[x, y]) > 200]
    orange = tuple(sorted(c[i] for c in vifs)[len(vifs) // 2] for i in range(3))
    sortie = Image.new("RGBA", image.size)
    sp = sortie.load()
    for x in range(largeur):
        for y in range(hauteur):
            alpha = min(255, round(max(pixels[x, y]) * 255 / max(orange)))
            sp[x, y] = (*orange, alpha)
    return sortie.crop(sortie.getbbox())


def carre(logo: Image.Image, cote: int, marge: float, fond=(0, 0, 0, 0)) -> Image.Image:
    """Centre le logo dans un carré, avec une marge (en proportion du côté)."""
    toile = Image.new("RGBA", (cote, cote), fond)
    utile = round(cote * (1 - 2 * marge))
    copie = logo.copy()
    copie.thumbnail((utile, utile), Image.Resampling.LANCZOS)
    toile.alpha_composite(copie, ((cote - copie.width) // 2, (cote - copie.height) // 2))
    return toile


def main() -> None:
    os.makedirs(DOSSIER_ICONES, exist_ok=True)
    logo = logo_transparent()

    grand = carre(logo, 256, 0.02)
    grand.save(os.path.join(STATIQUES, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    carre(logo, 32, 0.02).save(os.path.join(DOSSIER_ICONES, "favicon-32.png"))
    carre(logo, 180, 0.12, FOND_SITE).save(os.path.join(DOSSIER_ICONES, "apple-touch-icon.png"))
    carre(logo, 192, 0.12, FOND_SITE).save(os.path.join(DOSSIER_ICONES, "icone-192.png"))
    carre(logo, 512, 0.12, FOND_SITE).save(os.path.join(DOSSIER_ICONES, "icone-512.png"))
    carre(logo, 512, 0.24, FOND_SITE).save(os.path.join(DOSSIER_ICONES, "icone-masquable-512.png"))
    carre(logo, 512, 0.02).save(os.path.join(DOSSIER_ICONES, "logo-transparent-512.png"))
    print("Icônes générées dans", DOSSIER_ICONES)


if __name__ == "__main__":
    main()
