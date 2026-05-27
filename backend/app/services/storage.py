"""Storage 추상화 — Phase 2.5 (2026-05-21).

원칙:
- DB 에는 **상대 경로 (storage_relpath)** 만 저장
- 절대 경로는 runtime 에 `STORAGE_BASE_PATH (env)` + relpath 로 join
- NAS 이전 시 robocopy + env 변경만으로 끝. DB 변경 X.

env 설정:
- 지금 (NAS 없음):  `STORAGE_BASE_PATH=./backend/uploads/`
- 나중 (NAS 마운트): `STORAGE_BASE_PATH=M:\\sota_files\\`

ffmpeg 설치 필요 (영상 thumbnail / duration / dimension 추출용).
5090 PC: `winget install ffmpeg` 또는 ffmpeg.org 에서 다운.
"""
from __future__ import annotations

import logging
import mimetypes
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import IO

logger = logging.getLogger(__name__)


# ─── Config ──────────────────────────────────────────────────────────────


def get_base_path() -> Path:
    """STORAGE_BASE_PATH env 변수에서 base 디렉토리 가져옴.

    default = `./backend/uploads/` (개발용).
    """
    from app.config import settings
    raw = getattr(settings, "storage_base_path", None) or "./backend/uploads/"
    p = Path(raw).expanduser().resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_full_path(relpath: str) -> Path:
    """상대 경로를 절대 경로로 변환."""
    return get_base_path() / relpath


# ─── 미디어 타입 ──────────────────────────────────────────────────────────


def detect_media_type(mime: str | None, filename: str | None = None) -> str:
    """mime / filename 에서 media_type 추정."""
    if mime:
        if mime.startswith("image/"):
            return "image"
        if mime.startswith("video/"):
            return "video"
    if filename:
        guess, _ = mimetypes.guess_type(filename)
        if guess:
            if guess.startswith("image/"):
                return "image"
            if guess.startswith("video/"):
                return "video"
    return "other"


# ─── 저장 ────────────────────────────────────────────────────────────────


def save_upload(
    src: IO[bytes],
    *,
    original_filename: str,
    owner_type: str,
    owner_id: uuid.UUID | str,
) -> tuple[str, int]:
    """업로드 파일을 storage 에 저장. relpath + 바이트 크기 반환.

    경로 패턴: `{owner_type}/{YYYY}/{MM}/{owner_id}/{uuid}_{filename}`
    """
    safe_name = Path(original_filename).name  # path traversal 방지
    now = datetime.utcnow()
    rel_dir = f"{owner_type}/{now:%Y/%m}/{owner_id}"
    file_id = uuid.uuid4().hex[:12]
    relpath = f"{rel_dir}/{file_id}_{safe_name}"

    full = get_full_path(relpath)
    full.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    with open(full, "wb") as dst:
        while True:
            chunk = src.read(1024 * 1024)  # 1MB 청크
            if not chunk:
                break
            dst.write(chunk)
            size += len(chunk)
    return relpath, size


def delete_file(relpath: str | None) -> None:
    """relpath 의 파일 + (가능하면) parent 폴더 정리."""
    if not relpath:
        return
    full = get_full_path(relpath)
    try:
        if full.exists():
            full.unlink()
    except Exception as e:
        logger.warning(f"storage.delete_file failed: {e}")


# ─── ffmpeg — 영상 thumbnail / metadata ───────────────────────────────────


def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess:
    """ffmpeg 실행. 미설치 시 FileNotFoundError."""
    return subprocess.run(
        ["ffmpeg", *args],
        capture_output=True,
        timeout=60,
    )


def _run_ffprobe(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["ffprobe", *args],
        capture_output=True,
        timeout=30,
    )


def probe_video(relpath: str) -> dict:
    """ffprobe 로 영상 메타 추출. {duration_sec, width, height}.

    ffmpeg 미설치 시 빈 dict.
    """
    full = get_full_path(relpath)
    try:
        result = _run_ffprobe([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration",
            "-of", "default=noprint_wrappers=1",
            str(full),
        ])
        if result.returncode != 0:
            return {}
        out = result.stdout.decode("utf-8", errors="ignore")
        meta: dict = {}
        for line in out.splitlines():
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k == "width":
                meta["width"] = int(float(v))
            elif k == "height":
                meta["height"] = int(float(v))
            elif k == "duration":
                meta["duration_sec"] = float(v)
        return meta
    except FileNotFoundError:
        logger.warning("ffprobe 미설치 — 영상 메타데이터 추출 skip. ffmpeg 설치 권장.")
        return {}
    except Exception as e:
        logger.warning(f"ffprobe 실패: {e}")
        return {}


def extract_video_thumbnail(relpath: str, *, at_seconds: float = 1.0) -> str | None:
    """영상의 특정 시간 프레임을 PNG 썸네일로 저장. thumbnail relpath 반환.

    ffmpeg 미설치 시 None.
    """
    full = get_full_path(relpath)
    # 썸네일 경로: 같은 폴더에 .thumb.png
    thumb_relpath = f"{relpath}.thumb.png"
    thumb_full = get_full_path(thumb_relpath)
    thumb_full.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = _run_ffmpeg([
            "-y",  # overwrite
            "-ss", str(at_seconds),
            "-i", str(full),
            "-frames:v", "1",
            "-q:v", "2",
            str(thumb_full),
        ])
        if result.returncode != 0:
            logger.warning(
                f"ffmpeg thumbnail 실패 (rc={result.returncode}): "
                f"{result.stderr.decode('utf-8', errors='ignore')[:300]}"
            )
            return None
        return thumb_relpath
    except FileNotFoundError:
        logger.warning("ffmpeg 미설치 — 영상 썸네일 skip. ffmpeg 설치 권장.")
        return None
    except Exception as e:
        logger.warning(f"ffmpeg 썸네일 실패: {e}")
        return None


# ─── 이미지 dimension (PIL/Pillow) ────────────────────────────────────────


def probe_image(relpath: str) -> dict:
    """PIL 로 이미지 dimension 추출. PIL 미설치 시 빈 dict."""
    full = get_full_path(relpath)
    try:
        from PIL import Image  # type: ignore

        with Image.open(full) as img:
            return {"width": img.width, "height": img.height}
    except ImportError:
        logger.debug("Pillow 미설치 — 이미지 dimension skip.")
        return {}
    except Exception as e:
        logger.warning(f"이미지 probe 실패: {e}")
        return {}
