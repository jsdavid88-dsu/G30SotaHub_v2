"""Phase 2.5 — 미디어 첨부 API.

기존 uploads.py (daily_block 10MB 이미지/PDF) 와 별개. 미디어 + annotation 전용.

- POST /api/v1/attachments         — 이미지/영상 multipart 업로드
- GET  /api/v1/attachments/{id}    — 메타데이터 JSON
- GET  /api/v1/attachments/{id}/stream     — 본 파일 (range request 지원 — 영상 streaming)
- GET  /api/v1/attachments/{id}/thumbnail  — 이미지 썸네일 / 영상 첫 프레임
- GET  /api/v1/attachments         — 리스트 (owner_type, owner_id 필터)
- DELETE /api/v1/attachments/{id}  — 본인 또는 admin
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.attachment import Attachment, AttachmentOwnerType
from app.models.user import User, UserRole
from app.services import storage

logger = logging.getLogger(__name__)
router = APIRouter()

# 영상/이미지 — 한 파일 최대 500MB (영상 고려)
MAX_FILE_SIZE = 500 * 1024 * 1024

ALLOWED_MIME_PREFIXES = ("image/", "video/")


def _validate_mime(content_type: str | None) -> str:
    if not content_type or not content_type.startswith(ALLOWED_MIME_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail=f"이미지 또는 영상만 허용됩니다 (받음: {content_type})",
        )
    return content_type


def _validate_owner_type(value: str) -> AttachmentOwnerType:
    try:
        return AttachmentOwnerType(value)
    except ValueError:
        valid = [e.value for e in AttachmentOwnerType]
        raise HTTPException(
            status_code=400,
            detail=f"owner_type 잘못됨. 허용: {valid}",
        )


def _to_response(att: Attachment) -> dict:
    return {
        "id": str(att.id),
        "owner_type": att.owner_type.value if hasattr(att.owner_type, "value") else str(att.owner_type),
        "owner_id": str(att.owner_id),
        "file_name": att.file_name,
        "mime": att.mime,
        "media_type": att.media_type,
        "size_bytes": att.file_size_bytes,
        "width": att.width,
        "height": att.height,
        "duration_sec": att.duration_sec,
        "fps": att.fps,
        "preview_status": att.preview_status,
        "created_by": str(att.created_by) if att.created_by else None,
        "created_at": att.created_at.isoformat() if att.created_at else None,
        # 절대 URL 대신 API path — frontend 에서 그대로 사용 (서버가 web proxy/원본 자동 선택)
        "stream_url": f"/api/v1/attachments/{att.id}/stream",
        "thumbnail_url": f"/api/v1/attachments/{att.id}/thumbnail" if att.thumbnail_relpath or att.media_type == "image" else None,
    }


async def _transcode_and_update(att_id: uuid.UUID) -> None:
    """백그라운드 트랜스코딩 — non-web-safe 영상을 H.264 MP4 프록시로 변환 후 DB 갱신."""
    from app.database import SessionLocal
    async with SessionLocal() as db:
        att = await db.get(Attachment, att_id)
        if not att or not att.storage_relpath:
            return
        relpath = att.storage_relpath
    # CPU 무거운 ffmpeg 은 별도 스레드 (이벤트루프 블록 방지)
    web_relpath = await asyncio.to_thread(storage.transcode_to_web, relpath)
    async with SessionLocal() as db:
        att = await db.get(Attachment, att_id)
        if not att:
            return
        att.web_relpath = web_relpath
        # 변환 성공 → web proxy 서빙. 실패 → 원본 서빙 시도 (failed 표시, 브라우저 호환 시 보임)
        att.preview_status = "ready" if web_relpath else "failed"
        await db.commit()
        logger.info(f"transcode done att={att_id} web={'ok' if web_relpath else 'failed→원본'}")


@router.post("", status_code=201)
async def upload_attachment(
    file: Annotated[UploadFile, File(...)],
    owner_type: Annotated[str, Form(...)],
    owner_id: Annotated[str, Form(...)],
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """이미지 또는 영상 업로드. 영상은 ffmpeg 으로 thumbnail + duration + fps 추출.
    non-web-safe 코덱(ProRes/mkv/avi/hevc)은 백그라운드로 H.264 MP4 트랜스코딩."""
    owner_type_enum = _validate_owner_type(owner_type)
    try:
        owner_uuid = uuid.UUID(owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="owner_id 가 valid UUID 아님")

    mime = _validate_mime(file.content_type)

    # 저장
    relpath, size = storage.save_upload(
        file.file,
        original_filename=file.filename or "unnamed",
        owner_type=owner_type_enum.value,
        owner_id=owner_uuid,
    )
    if size > MAX_FILE_SIZE:
        # 큰 파일이라 다 받은 후 삭제 (적합한 시점에 streaming size check 가능)
        storage.delete_file(relpath)
        raise HTTPException(status_code=413, detail=f"파일이 너무 큽니다 (max {MAX_FILE_SIZE // (1024*1024)}MB)")

    media_type = storage.detect_media_type(mime, file.filename)

    # 메타데이터 추출
    width: int | None = None
    height: int | None = None
    duration_sec: float | None = None
    fps: float | None = None
    thumbnail_relpath: str | None = None
    needs_transcode = False

    if media_type == "video":
        meta = storage.probe_video(relpath)
        width = meta.get("width")
        height = meta.get("height")
        duration_sec = meta.get("duration_sec")
        fps = meta.get("fps")
        codec = meta.get("codec")
        thumbnail_relpath = storage.extract_video_thumbnail(relpath, at_seconds=min(1.0, (duration_sec or 1) / 3))
        # codec 을 알아냈고 web-safe 아니면 트랜스코딩 (codec 모르면=ffprobe 실패 → 원본 그대로)
        needs_transcode = bool(codec) and not storage.is_web_safe_codec(codec)
    elif media_type == "image":
        meta = storage.probe_image(relpath)
        width = meta.get("width")
        height = meta.get("height")

    if media_type == "video":
        preview_status = "transcoding" if needs_transcode else "ready"
    elif media_type == "image":
        preview_status = "ready"
    else:
        preview_status = "pending"

    att = Attachment(
        owner_type=owner_type_enum,
        owner_id=owner_uuid,
        file_name=file.filename,
        file_size_bytes=size,
        storage_kind="local",
        storage_relpath=relpath,
        media_type=media_type,
        mime=mime,
        width=width,
        height=height,
        duration_sec=duration_sec,
        fps=fps,
        thumbnail_relpath=thumbnail_relpath,
        created_by=current_user.id,
        preview_status=preview_status,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)

    # non-web-safe 영상 → 백그라운드 트랜스코딩 (응답은 즉시)
    if needs_transcode:
        background.add_task(_transcode_and_update, att.id)

    return _to_response(att)


@router.get("")
async def list_attachments(
    owner_type: str = Query(...),
    owner_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """소유자 (owner_type + owner_id) 기준 첨부 목록."""
    owner_type_enum = _validate_owner_type(owner_type)
    try:
        owner_uuid = uuid.UUID(owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="owner_id UUID 아님")

    stmt = (
        select(Attachment)
        .where(Attachment.owner_type == owner_type_enum, Attachment.owner_id == owner_uuid)
        .order_by(Attachment.created_at.asc())
    )
    res = await db.execute(stmt)
    items = list(res.scalars().unique().all())
    return [_to_response(a) for a in items]


@router.get("/{att_id}")
async def get_attachment(
    att_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    att = await db.get(Attachment, att_id)
    if not att:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없음")
    return _to_response(att)


def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    """`bytes=START-END` 형식 파싱. 둘 다 inclusive."""
    units, _, ranges = range_header.partition("=")
    if units.strip().lower() != "bytes":
        raise HTTPException(status_code=400, detail="Range 단위는 bytes 만")
    start_s, _, end_s = ranges.partition("-")
    try:
        start = int(start_s) if start_s.strip() else 0
        end = int(end_s) if end_s.strip() else file_size - 1
    except ValueError:
        raise HTTPException(status_code=400, detail="Range 값 잘못됨")
    if start > end or end >= file_size:
        end = file_size - 1
    if start < 0:
        start = 0
    return start, end


@router.get("/{att_id}/stream")
async def stream_attachment(
    att_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """본 파일 streaming. 영상의 경우 Range request 지원 (HTTP 206 Partial Content)."""
    att = await db.get(Attachment, att_id)
    if not att or not att.storage_relpath:
        raise HTTPException(status_code=404, detail="파일 없음")

    # 트랜스코딩된 웹 프록시 우선 (있으면), 없으면 원본
    serve_relpath = att.web_relpath or att.storage_relpath
    full = storage.get_full_path(serve_relpath)
    if not full.exists() or not full.is_file():
        # 웹 프록시 경로가 깨졌으면 원본 fallback
        full = storage.get_full_path(att.storage_relpath)
        if not full.exists() or not full.is_file():
            raise HTTPException(status_code=404, detail="실제 파일이 없음 (DB 와 파일 불일치)")
        serve_relpath = att.storage_relpath

    file_size = full.stat().st_size
    # web 프록시면 mp4, 아니면 원본 mime
    mime = ("video/mp4" if att.web_relpath and serve_relpath == att.web_relpath
            else att.mime or mimetypes.guess_type(str(full))[0] or "application/octet-stream")
    range_header = request.headers.get("range")

    # 이미지 / 짧은 파일은 FileResponse — Range 불필요
    if not range_header or att.media_type != "video":
        return FileResponse(
            full,
            media_type=mime,
            filename=att.file_name or full.name,
        )

    # 영상 — Range 처리 (브라우저 video element 가 seek 시 보냄)
    start, end = _parse_range(range_header, file_size)
    length = end - start + 1

    def iter_chunk():
        with open(full, "rb") as f:
            f.seek(start)
            remaining = length
            chunk_size = 1024 * 1024
            while remaining > 0:
                data = f.read(min(chunk_size, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Type": mime,
    }
    return StreamingResponse(iter_chunk(), status_code=206, headers=headers)


@router.get("/{att_id}/thumbnail")
async def get_thumbnail(
    att_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """이미지면 본 파일, 영상이면 추출된 썸네일 PNG."""
    att = await db.get(Attachment, att_id)
    if not att:
        raise HTTPException(status_code=404, detail="첨부 없음")

    # 영상 — 썸네일 우선, 없으면 try-extract once
    if att.media_type == "video":
        relpath = att.thumbnail_relpath
        if not relpath and att.storage_relpath:
            relpath = storage.extract_video_thumbnail(att.storage_relpath)
            if relpath:
                att.thumbnail_relpath = relpath
                await db.commit()
        if not relpath:
            raise HTTPException(status_code=404, detail="썸네일을 만들 수 없음 (ffmpeg 미설치 또는 영상 손상)")
        full = storage.get_full_path(relpath)
        if not full.exists():
            raise HTTPException(status_code=404, detail="썸네일 파일 손실")
        return FileResponse(full, media_type="image/png")

    # 이미지 — 본 파일을 그냥
    if att.media_type == "image" and att.storage_relpath:
        full = storage.get_full_path(att.storage_relpath)
        if full.exists():
            return FileResponse(full, media_type=att.mime or "image/png")

    raise HTTPException(status_code=404, detail="썸네일 없음")


@router.delete("/{att_id}", status_code=204)
async def delete_attachment(
    att_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = await db.get(Attachment, att_id)
    if not att:
        raise HTTPException(status_code=404, detail="첨부 없음")
    if att.created_by != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="본인 첨부만 삭제 가능합니다")

    # 파일 + 썸네일 + 웹 프록시 삭제 (DB 먼저 — 트랜잭션 안전)
    relpath = att.storage_relpath
    thumb = att.thumbnail_relpath
    web = att.web_relpath
    await db.delete(att)
    await db.commit()

    storage.delete_file(relpath)
    if thumb:
        storage.delete_file(thumb)
    if web:
        storage.delete_file(web)
