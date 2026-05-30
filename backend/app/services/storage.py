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


class StorageError(Exception):
    """저장 관련 오류 (크기 초과, 경로 escape 등)."""


def get_full_path(relpath: str) -> Path:
    """상대 경로를 절대 경로로 변환. base 디렉토리 밖으로 escape 시 StorageError.

    이슈 #18 P2: DB relpath 에 '../' 가 섞여도 storage base 밖을 못 건드리게 방어.
    (현재 relpath 는 서버가 uuid 로 생성하지만 defense-in-depth)
    """
    base = get_base_path()
    full = (base / relpath).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        raise StorageError(f"경로가 storage base 를 벗어남: {relpath!r}")
    return full


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
    max_bytes: int | None = None,
) -> tuple[str, int]:
    """업로드 파일을 storage 에 저장. relpath + 바이트 크기 반환.

    경로 패턴: `{owner_type}/{YYYY}/{MM}/{owner_id}/{uuid}_{filename}`

    이슈 #18 P1: max_bytes 지정 시 쓰는 도중 초과하면 즉시 중단 + 부분 파일 삭제 +
    StorageError (전체를 다 받은 뒤 검사하지 않음 → 디스크/IO 낭비·DoS 방지).
    """
    safe_name = Path(original_filename).name  # path traversal 방지
    now = datetime.utcnow()
    rel_dir = f"{owner_type}/{now:%Y/%m}/{owner_id}"
    file_id = uuid.uuid4().hex[:12]
    relpath = f"{rel_dir}/{file_id}_{safe_name}"

    full = get_full_path(relpath)
    full.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with open(full, "wb") as dst:
            while True:
                chunk = src.read(1024 * 1024)  # 1MB 청크
                if not chunk:
                    break
                size += len(chunk)
                if max_bytes is not None and size > max_bytes:
                    raise StorageError(f"파일이 너무 큼 (> {max_bytes} bytes)")
                dst.write(chunk)
    except StorageError:
        # 부분 저장 파일 정리 후 전파
        try:
            full.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    return relpath, size


def delete_file(relpath: str | None) -> None:
    """relpath 의 파일 정리. StorageError(경로 escape) 포함 모든 예외 swallow."""
    if not relpath:
        return
    try:
        full = get_full_path(relpath)  # StorageError 가능
        if full.exists():
            full.unlink()
    except Exception as e:
        logger.warning(f"storage.delete_file failed: {e}")


# ─── ffmpeg — 영상 thumbnail / metadata ───────────────────────────────────


def _run_ffmpeg(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    """ffmpeg 실행. 미설치 시 FileNotFoundError. timeout 기본 60s (트랜스코딩은 길게)."""
    return subprocess.run(
        ["ffmpeg", *args],
        capture_output=True,
        timeout=timeout,
    )


def _run_ffprobe(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["ffprobe", *args],
        capture_output=True,
        timeout=30,
    )


# 브라우저 <video> 가 native 디코딩 가능한 코덱 (트랜스코딩 불필요).
# hevc(h265) 는 OS/하드웨어 의존이라 안전하게 트랜스코딩 대상으로 둠.
WEB_SAFE_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}


def is_web_safe_codec(codec: str | None) -> bool:
    return bool(codec) and codec.lower() in WEB_SAFE_VIDEO_CODECS


def _parse_fps(rate: str) -> float | None:
    """ffprobe r_frame_rate ("30000/1001", "25/1") → float fps."""
    if not rate or rate == "0/0":
        return None
    try:
        if "/" in rate:
            num, den = rate.split("/", 1)
            d = float(den)
            return round(float(num) / d, 3) if d else None
        return float(rate)
    except (ValueError, ZeroDivisionError):
        return None


def probe_video(relpath: str) -> dict:
    """ffprobe 로 영상 메타 추출. {duration_sec, width, height, fps, codec}.

    ffmpeg 미설치 시 빈 dict.
    """
    full = get_full_path(relpath)
    try:
        result = _run_ffprobe([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration,r_frame_rate,codec_name",
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
            elif k == "r_frame_rate":
                fps = _parse_fps(v)
                if fps:
                    meta["fps"] = fps
            elif k == "codec_name":
                meta["codec"] = v.lower()
        return meta
    except FileNotFoundError:
        logger.warning("ffprobe 미설치 — 영상 메타데이터 추출 skip. ffmpeg 설치 권장.")
        return {}
    except Exception as e:
        logger.warning(f"ffprobe 실패: {e}")
        return {}


def transcode_to_web(relpath: str) -> str | None:
    """non-web-safe 영상을 H.264 MP4 웹 프록시로 변환. web relpath 반환.

    원본은 보존. 출력: `{relpath}.web.mp4`. ffmpeg 미설치/실패 시 None (graceful).
    긴 영상 고려 timeout 30분.
    """
    full = get_full_path(relpath)
    web_relpath = f"{relpath}.web.mp4"
    web_full = get_full_path(web_relpath)
    web_full.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = _run_ffmpeg(
            [
                "-y", "-i", str(full),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-pix_fmt", "yuv420p",            # 호환성 (10bit/422 → 8bit 420)
                "-c:a", "aac", "-b:a", "160k",
                "-movflags", "+faststart",        # 웹 스트리밍 (moov atom 앞으로)
                str(web_full),
            ],
            timeout=1800,
        )
        if result.returncode != 0:
            logger.warning(
                f"transcode 실패 (rc={result.returncode}): "
                f"{result.stderr.decode('utf-8', errors='ignore')[:300]}"
            )
            delete_file(web_relpath)
            return None
        return web_relpath
    except FileNotFoundError:
        logger.warning("ffmpeg 미설치 — 트랜스코딩 skip. 원본 그대로 서빙 (브라우저 호환 시).")
        return None
    except Exception as e:
        logger.warning(f"transcode 실패: {e}")
        delete_file(web_relpath)
        return None


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
