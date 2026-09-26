#!/usr/bin/env python3
"""Иконки и сплэш SelfCRM из знака лендинга.

Знак один для всего проекта — favicon страницы раздачи: белая буква «S» на синем
скруглённом квадрате (index.html лендинга, SVG 32×32: rx = 9, font-size = 20,
базовая линия y = 23, цвет #2563eb). Здесь тот же знак раскладывается по ресурсам
Android, чтобы приложение и страница выглядели одинаково.

Что обновляется:
    mipmap-*/ic_launcher.png           — обычный значок (скруглённый квадрат) для API < 26;
    mipmap-*/ic_launcher_round.png     — круглый значок для API < 26;
    mipmap-*/ic_launcher_foreground.png — передний план адаптивного значка (API 26+):
                                          буква без фона, фон задаётся цветом
                                          @color/ic_launcher_background = #2563EB;
    drawable*/splash.png               — заставка при запуске: знак по центру.

Размеры файлов не меняются: новые картинки рисуются в тех же размерах, что и прежние
(для сплэша размер берётся у существующего файла).

Требуется Pillow и шрифт Liberation Sans Bold: он совпадает по метрикам с Arial,
который указан в favicon.

Запуск: python3 scripts/make-icons.py
"""

from __future__ import annotations

import glob
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - сообщение для разработчика
    sys.exit('Нужен Pillow: pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

PRIMARY = (37, 99, 235, 255)  # #2563eb — синий лендинга
WHITE = (255, 255, 255, 255)
FONT_PATH = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

# Пропорции favicon лендинга: 32×32, rx = 9, font-size = 20, базовая линия y = 23.
RATIO_RADIUS = 9 / 32
RATIO_FONT = 20 / 32
RATIO_BASELINE = 23 / 32

# Размеры значков по плотностям (как в шаблоне Capacitor).
LAUNCHER_SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# Передний план адаптивного значка: 108dp, безопасная зона — внутренние 72dp.
FOREGROUND_SIZES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
SAFE_ZONE = 72 / 108

# Рисуем в четыре раза крупнее и уменьшаем: так края сглаживаются.
SUPERSAMPLE = 4
# Доля меньшей стороны заставки, которую занимает знак.
SPLASH_MARK = 0.24


def font_for(size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, max(1, round(size * RATIO_FONT)))


def glyph(size: int) -> Image.Image:
    """Белая буква «S» на прозрачном фоне размером `size` — как в favicon."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.text(
        (big / 2, big * RATIO_BASELINE),
        'S',
        font=font_for(big),
        fill=WHITE,
        anchor='ms',  # по центру, базовая линия — как в SVG лендинга
    )
    return image.resize((size, size), Image.LANCZOS)


def rounded_square(size: int) -> Image.Image:
    """Синий скруглённый квадрат с белой буквой — значок приложения."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=round(big * RATIO_RADIUS), fill=PRIMARY
    )
    image = image.resize((size, size), Image.LANCZOS)
    image.alpha_composite(glyph(size))
    return image


def round_icon(size: int) -> Image.Image:
    """Круглый значок: тот же знак, но фон — окружность."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse([0, 0, big - 1, big - 1], fill=PRIMARY)
    image = image.resize((size, size), Image.LANCZOS)
    image.alpha_composite(glyph(size))
    return image


def foreground(size: int) -> Image.Image:
    """Передний план адаптивного значка: буква внутри безопасной зоны 72dp из 108dp."""
    inner = round(size * SAFE_ZONE)
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    image.alpha_composite(glyph(inner), ((size - inner) // 2, (size - inner) // 2))
    return image


def splash(width: int, height: int) -> Image.Image:
    """Заставка: знак по центру белого поля, как логотип на странице."""
    side = max(32, round(min(width, height) * SPLASH_MARK))
    image = Image.new('RGBA', (width, height), WHITE)
    image.alpha_composite(rounded_square(side), ((width - side) // 2, (height - side) // 2))
    return image.convert('RGB')


def save(path: str, image: Image.Image) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path)
    print(f'{os.path.relpath(path, ROOT)}: {image.size[0]}×{image.size[1]}')


def main() -> None:
    if not os.path.exists(FONT_PATH):
        sys.exit(f'Не найден шрифт {FONT_PATH}: без него буква «S» будет другой формы')

    for density, size in LAUNCHER_SIZES.items():
        folder = os.path.join(RES, f'mipmap-{density}')
        save(os.path.join(folder, 'ic_launcher.png'), rounded_square(size))
        save(os.path.join(folder, 'ic_launcher_round.png'), round_icon(size))

    for density, size in FOREGROUND_SIZES.items():
        save(os.path.join(RES, f'mipmap-{density}', 'ic_launcher_foreground.png'), foreground(size))

    # Заставка: размеры прежних файлов сохраняем — их подбирал шаблон Capacitor
    # под разные экраны, и менять раскладку здесь незачем.
    for path in sorted(glob.glob(os.path.join(RES, 'drawable*', 'splash.png'))):
        with Image.open(path) as current:
            width, height = current.size
        save(path, splash(width, height))


if __name__ == '__main__':
    main()
