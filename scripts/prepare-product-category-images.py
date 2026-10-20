from __future__ import annotations

import io
import hashlib
import json
import tempfile
import time
import urllib.request
from http.client import IncompleteRead
from pathlib import Path
from urllib.error import URLError

from PIL import Image, ImageCms, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / "assets" / "product-categories" / "sources.json"
OUTPUT_DIRECTORY = ROOT / "assets" / "product-categories" / "master"
CACHE_DIRECTORY = Path(tempfile.gettempdir()) / "agritainment-product-category-sources"
MIN_SOURCE_EDGE = 1200
OUTPUT_EDGE = 128
MAX_OUTPUT_BYTES = 24 * 1024


def download(url: str, target: Path) -> None:
    if target.exists():
        return
    for attempt in range(3):
        request = urllib.request.Request(url, headers={"User-Agent": "agritainment-category-assets/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                content = response.read()
            target.write_bytes(content)
            return
        except (IncompleteRead, TimeoutError, URLError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def convert_to_srgb(image: Image.Image) -> Image.Image:
    profile = image.info.get("icc_profile")
    if profile:
        try:
            return ImageCms.profileToProfile(
                image,
                ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                ImageCms.createProfile("sRGB"),
                outputMode="RGB",
            )
        except (ImageCms.PyCMSError, OSError):
            pass
    return image.convert("RGB")


def prepare(source: Path, target: Path) -> tuple[int, int, int]:
    with Image.open(source) as raw:
        image = ImageOps.exif_transpose(raw)
        source_size = image.size
        if min(source_size) < MIN_SOURCE_EDGE:
            raise ValueError(f"{source.name} short edge is below {MIN_SOURCE_EDGE}px: {source_size}")
        image = convert_to_srgb(image)
        image = ImageOps.fit(image, (OUTPUT_EDGE, OUTPUT_EDGE), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        image = ImageEnhance.Brightness(image).enhance(1.035)
        image = ImageEnhance.Color(image).enhance(1.035)
        image = ImageEnhance.Sharpness(image).enhance(1.04)
        image.save(target, "WEBP", quality=82, method=6, exact=True, icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
    size = target.stat().st_size
    if size > MAX_OUTPUT_BYTES:
        raise ValueError(f"{target.name} exceeds {MAX_OUTPUT_BYTES // 1024}KB: {size} bytes")
    return source_size[0], source_size[1], size


def main() -> None:
    sources = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    for item in sources:
        source_key = hashlib.sha256(item["sourceImage"].encode("utf-8")).hexdigest()[:12]
        cached = CACHE_DIRECTORY / f"{Path(item['file']).stem}-{source_key}.source"
        target = OUTPUT_DIRECTORY / item["file"]
        download(item["sourceImage"], cached)
        width, height, size = prepare(cached, target)
        print(f"{item['file']}: {width}x{height} -> {OUTPUT_EDGE}x{OUTPUT_EDGE}, {size / 1024:.1f}KB")


if __name__ == "__main__":
    main()
