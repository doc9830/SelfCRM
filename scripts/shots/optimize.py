# Оптимизация кадров и перенос их в лендинг: PNG8, размер 780×1688 (390×844 при DPR 2).
#
#   python3 scripts/shots/optimize.py [--src /tmp/selfcrm-shots] [--dst "../SelfCRM landing/Screenshots v3"]
import glob, os, sys
from PIL import Image


def arg(name, default):
    if '--' + name in sys.argv:
        return sys.argv[sys.argv.index('--' + name) + 1]
    return default


SRC = arg('src', '/tmp/selfcrm-shots')
DST = arg('dst', '../SelfCRM landing/Screenshots v3')
os.makedirs(DST, exist_ok=True)

total = 0
for theme in ('light', 'dark'):
    for path in sorted(glob.glob(os.path.join(SRC, theme, '*.png'))):
        name = os.path.basename(path)
        im = Image.open(path).convert('RGB')
        if im.size != (780, 1688):
            raise SystemExit('неожиданный размер %s у %s' % (im.size, name))
        quantized = im.quantize(256, Image.MEDIANCUT)
        out = os.path.join(DST, name)
        quantized.save(out, optimize=True)
        total += 1
        print('%6d КБ  %s' % (os.path.getsize(out) // 1024, name))
print('всего файлов:', total)
