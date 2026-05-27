"""Seed script for 10 VFX categories.

Run: docker compose exec backend python seed.py
"""
import asyncio

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Category

CATEGORIES = [
    {
        "slug": "video_matting",
        "name_ko": "비디오 매팅",
        "name_en": "Video Matting",
        "description": "실시간/고정밀 비디오 매트 추출. 모발 경계, 반투명, 모션 블러 대응.",
        "icon": "🎨",
        "keywords": [
            "video matting", "alpha matte", "trimap-free", "robust video matting",
            "BiRefNet", "ViTMatte", "MODNet", "VideoMaMa", "MatAnyone",
            "background removal", "foreground extraction", "hair matting",
        ],
        "github_topics": ["video-matting", "alpha-matting", "background-removal"],
        "hf_tags": ["video-matting", "image-matting", "image-segmentation"],
        "subreddits": ["MachineLearning", "computervision", "vfx"],
        "x_accounts": ["_akhaliq", "arankomatsuzaki"],
        "current_sota": ["VideoMaMa (2026.01)", "MatAnyone 2 (2026.03)"],
        "display_order": 1,
    },
    {
        "slug": "video_removal",
        "name_ko": "비디오 리무벌",
        "name_en": "Video Removal / Inpainting",
        "description": "비디오 오브젝트 제거 및 인페인팅. 시간적 일관성, 그림자/반사 처리.",
        "icon": "✂️",
        "keywords": [
            "video inpainting", "video object removal", "video completion",
            "VOID", "ProPainter", "EffectErase", "EasyOmnimatte", "MiniMax-Remover",
            "temporal inpainting", "flow-guided", "physics-aware removal",
        ],
        "github_topics": ["video-inpainting", "object-removal", "video-completion"],
        "hf_tags": ["video-inpainting", "inpainting"],
        "subreddits": ["MachineLearning", "computervision", "StableDiffusion", "vfx"],
        "x_accounts": ["_akhaliq", "multimodalart"],
        "current_sota": ["VOID (Netflix 2026.04)", "EffectErase (2026.03)"],
        "display_order": 2,
    },
    {
        "slug": "face_parsing",
        "name_ko": "페이스 파싱",
        "name_en": "Face Parsing",
        "description": "얼굴 시맨틱 세그멘테이션. 광대/이마/코 브릿지 등 세분화.",
        "icon": "👤",
        "keywords": [
            "face parsing", "face segmentation", "facial semantic",
            "SegFace", "SAM 3", "BiSeNet", "CelebAMask", "EasyPortrait",
            "face labeling", "facial landmark", "FaRL",
        ],
        "github_topics": ["face-parsing", "face-segmentation", "facial-landmark"],
        "hf_tags": ["face-parsing", "image-segmentation"],
        "subreddits": ["MachineLearning", "computervision"],
        "x_accounts": ["_akhaliq"],
        "current_sota": ["SAM 3.1 (2026.03)", "SegFace (2024.12)"],
        "display_order": 3,
    },
    {
        "slug": "point_tracking",
        "name_ko": "포인트 트래킹",
        "name_en": "Point Tracking",
        "description": "임의 포인트 장기 추적. TAP/TAPIR/CoTracker 계열.",
        "icon": "🎯",
        "keywords": [
            "point tracking", "TAP", "TAPIR", "CoTracker", "Track-On",
            "TAPNext", "BootsTAPIR", "dense tracking", "any point tracking",
            "optical flow", "motion estimation",
        ],
        "github_topics": ["point-tracking", "optical-flow", "motion-estimation"],
        "hf_tags": ["point-tracking"],
        "subreddits": ["MachineLearning", "computervision"],
        "x_accounts": ["_akhaliq"],
        "current_sota": ["Track-On2 (CVPR 2026)", "CoTracker3 (2024)"],
        "display_order": 4,
    },
    {
        "slug": "head_swap",
        "name_ko": "헤드 스왑",
        "name_en": "Head Swap / Face Swap",
        "description": "비디오 내 얼굴/머리 교체. DFL 대체, 조명 매칭, 고해상도.",
        "icon": "🎭",
        "keywords": [
            "head swap", "face swap", "face reenactment", "deepfake",
            "Wan-Animate", "DirectSwap", "LivingSwap", "HeSer", "SimSwap",
            "face replacement", "identity preservation",
        ],
        "github_topics": ["face-swap", "deepfake", "face-reenactment"],
        "hf_tags": ["face-swap"],
        "subreddits": ["MachineLearning", "StableDiffusion", "DeepFakesSFW"],
        "x_accounts": ["_akhaliq"],
        "current_sota": ["Wan-Animate 14B (2025.09)", "DirectSwap (2025.12)"],
        "display_order": 5,
    },
    {
        "slug": "3dgs",
        "name_ko": "3D 가우시안 스플래팅",
        "name_en": "3D Gaussian Splatting",
        "description": "3DGS 기반 장면 복원 및 렌더링. Nerfstudio, AA-Splat 등.",
        "icon": "🎲",
        "keywords": [
            "gaussian splatting", "3DGS", "3D gaussian", "radiance field",
            "NeRF", "neural rendering", "Nerfstudio", "gsplat", "AA-Splat",
            "Mip-Splatting", "point-based rendering", "novel view synthesis",
        ],
        "github_topics": ["gaussian-splatting", "3dgs", "nerf", "neural-rendering"],
        "hf_tags": ["3d-gaussian-splatting", "nerf"],
        "subreddits": ["MachineLearning", "computervision", "GaussianSplatting"],
        "x_accounts": ["_akhaliq", "jonstephens85"],
        "current_sota": ["Nerfstudio Splatfacto", "AA-Splat (2026.03)"],
        "display_order": 6,
    },
    {
        "slug": "beauty",
        "name_ko": "뷰티 / 피부 보정",
        "name_en": "Beauty / Skin Retouching",
        "description": "피부 보정, 주름 제거, 뷰티 필터. 아시아 인종 특화.",
        "icon": "💄",
        "keywords": [
            "face retouching", "skin retouching", "beauty filter",
            "AuthFace", "MoFRR", "HonestFace", "BrushNet",
            "face restoration", "GFPGAN", "CodeFormer", "DiffBIR",
            "portrait enhancement",
        ],
        "github_topics": ["face-restoration", "beauty-filter", "portrait-enhancement"],
        "hf_tags": ["face-restoration", "image-restoration"],
        "subreddits": ["MachineLearning", "StableDiffusion"],
        "x_accounts": ["_akhaliq"],
        "current_sota": ["AuthFace (2024.10)", "MoFRR (2025.07)"],
        "display_order": 7,
    },
    {
        "slug": "korean_text_edit",
        "name_ko": "한글 텍스트 편집",
        "name_en": "Korean Text Editing",
        "description": "영상 내 한글 텍스트 검출/인식/편집/생성. 간판, 자막.",
        "icon": "📝",
        "keywords": [
            "scene text editing", "text removal", "STELLAR", "TextFlow",
            "AnyText", "korean OCR", "hangul", "scene text",
            "text inpainting", "font-agnostic text editing",
        ],
        "github_topics": ["scene-text", "text-editing", "ocr", "text-recognition"],
        "hf_tags": ["text-recognition", "ocr", "text-generation"],
        "subreddits": ["MachineLearning", "computervision"],
        "x_accounts": ["_akhaliq"],
        "current_sota": ["STELLAR (2025.11)", "TextFlow (2026.03)"],
        "display_order": 8,
    },
    {
        "slug": "ref_search",
        "name_ko": "Ref 영상 검색",
        "name_en": "Reference Video Search",
        "description": "시각적 유사성 기반 레퍼런스 검색. CLIP/Qwen 임베딩.",
        "icon": "🔍",
        "keywords": [
            "video retrieval", "image retrieval", "visual search",
            "CLIP", "SigLIP", "Qwen-VL", "DINOv3", "embedding retrieval",
            "content-based retrieval", "MMEB",
        ],
        "github_topics": ["image-retrieval", "visual-search", "clip", "video-retrieval"],
        "hf_tags": ["feature-extraction", "image-retrieval", "clip"],
        "subreddits": ["MachineLearning", "computervision"],
        "x_accounts": ["_akhaliq"],
        "current_sota": ["Qwen3-VL-Embedding-8B (2026.01)"],
        "display_order": 9,
    },
    {
        "slug": "qc_program",
        "name_ko": "QC 프로그램",
        "name_en": "Quality Control",
        "description": "영상 품질 자동 평가. 블랙 바, NaN, 코덱, 슬레이트 체크.",
        "icon": "✅",
        "keywords": [
            "video quality assessment", "artifact detection", "flicker detection",
            "IQA", "VQA", "DOVER", "MUSIQ", "no-reference quality",
            "DaVinci Resolve API", "FFmpeg", "MediaInfo", "VMAF",
        ],
        "github_topics": ["video-quality", "image-quality-assessment", "davinci-resolve"],
        "hf_tags": ["image-quality-assessment"],
        "subreddits": ["MachineLearning", "computervision", "vfx", "editors"],
        "x_accounts": [],
        "current_sota": ["DaVinci Resolve Python API", "DOVER (2023)"],
        "display_order": 10,
    },

    # ─── Phase 2.5+ 추가 — 영상/이미지 생성 + VFX 전반 generic 카테고리 ───
    # 원칙: 모델명 직접 박지 말 것. generic 키워드 + topic 위주 → LTX/Wan/Flux 등
    # 신규 모델이 자연스럽게 잡히도록.

    {
        "slug": "video_generation",
        "name_ko": "영상 생성",
        "name_en": "Video Generation",
        "description": "텍스트→영상 / 영상→영상 / LoRA 적용 영상 생성. AnimateDiff/SVD/LTX/Wan 등 신모델 자동 추적.",
        "icon": "🎬",
        "keywords": [
            "video generation", "text-to-video", "text to video", "t2v",
            "video diffusion", "video latent diffusion",
            "video lora", "video model", "video synthesis",
            "long video generation", "controllable video generation",
            "video foundation model", "open video model",
            "cs.CV",  # arxiv prefix — _collect_arxiv_categories 가 활용
        ],
        "github_topics": [
            "text-to-video", "video-generation", "video-diffusion",
            "video-synthesis", "video-lora",
        ],
        "hf_tags": ["text-to-video", "video-generation", "diffusion"],
        "subreddits": ["StableDiffusion", "MachineLearning", "AnimateDiff", "comfyui"],
        "x_accounts": ["_akhaliq", "multimodalart", "huggingface"],
        "current_sota": [],
        "display_order": 11,
    },

    {
        "slug": "image_generation",
        "name_ko": "이미지 생성",
        "name_en": "Image Generation",
        "description": "텍스트→이미지 / ControlNet / LoRA. Flux/SDXL/Cascade 등 generic 영역. VFX 의 컨셉/배경/캐릭터 컨셉아트 등.",
        "icon": "🖼️",
        "keywords": [
            "text-to-image", "text to image", "t2i",
            "image generation", "image diffusion", "image synthesis",
            "controlnet", "ip-adapter", "image lora", "stable diffusion lora",
            "image foundation model", "open image model",
            "cs.CV",
        ],
        "github_topics": [
            "text-to-image", "stable-diffusion", "diffusion-models",
            "controlnet", "lora", "comfyui",
        ],
        "hf_tags": ["text-to-image", "diffusion", "stable-diffusion-xl", "lora"],
        "subreddits": ["StableDiffusion", "MachineLearning", "comfyui"],
        "x_accounts": ["_akhaliq", "multimodalart"],
        "current_sota": [],
        "display_order": 12,
    },

    {
        "slug": "image_to_video",
        "name_ko": "이미지 → 영상",
        "name_en": "Image-to-Video",
        "description": "정지 이미지 + 모션 → 영상. 첫 프레임/마지막 프레임 제어, 카메라 움직임 등.",
        "icon": "▶️",
        "keywords": [
            "image-to-video", "image to video", "i2v",
            "first frame video", "video animation", "still to video",
            "video interpolation generation",
            "cs.CV",
        ],
        "github_topics": ["image-to-video", "i2v", "video-generation"],
        "hf_tags": ["image-to-video"],
        "subreddits": ["StableDiffusion", "MachineLearning", "AnimateDiff"],
        "x_accounts": ["_akhaliq", "multimodalart"],
        "current_sota": [],
        "display_order": 13,
    },

    {
        "slug": "motion_control",
        "name_ko": "모션 제어",
        "name_en": "Motion Control",
        "description": "카메라 무브 / 드래그 모션 / 모션 브러시 / 객체 궤적 제어. VFX 의 컨트롤 정밀도.",
        "icon": "🎮",
        "keywords": [
            "camera control", "camera motion", "controllable camera",
            "motion control", "motion brush", "drag-based motion",
            "trajectory control", "video motion editing",
            "cs.CV", "cs.GR",
        ],
        "github_topics": ["camera-control", "motion-control", "motion-editing"],
        "hf_tags": ["video-generation"],
        "subreddits": ["StableDiffusion", "MachineLearning", "AnimateDiff"],
        "x_accounts": ["_akhaliq"],
        "current_sota": [],
        "display_order": 14,
    },

    {
        "slug": "lighting_control",
        "name_ko": "조명 / 리라이팅",
        "name_en": "Relighting",
        "description": "이미지/영상 재조명. 그림자, 반사, HDR. 합성에서 매트 조명 매칭.",
        "icon": "💡",
        "keywords": [
            "relighting", "image relighting", "video relighting",
            "lighting estimation", "intrinsic decomposition",
            "shadow generation", "shadow removal", "HDR",
            "cs.CV", "cs.GR",
        ],
        "github_topics": ["relighting", "lighting", "shadow-removal", "intrinsic-image"],
        "hf_tags": ["image-to-image", "relighting"],
        "subreddits": ["MachineLearning", "computervision", "vfx"],
        "x_accounts": [],
        "current_sota": [],
        "display_order": 15,
    },

    {
        "slug": "upscaling",
        "name_ko": "업스케일 / 복원",
        "name_en": "Upscaling & Restoration",
        "description": "Super-resolution / 노이즈 제거 / 디블러. 영상·이미지 복원. VFX 후처리 마무리.",
        "icon": "🔬",
        "keywords": [
            "super resolution", "super-resolution", "image upscaling",
            "video upscaling", "video super resolution",
            "denoising", "deblurring", "image restoration", "video restoration",
            "real-world super resolution",
            "cs.CV",
        ],
        "github_topics": ["super-resolution", "image-restoration", "video-restoration", "denoising"],
        "hf_tags": ["image-to-image", "super-resolution"],
        "subreddits": ["MachineLearning", "computervision", "StableDiffusion"],
        "x_accounts": [],
        "current_sota": [],
        "display_order": 16,
    },

    {
        "slug": "depth_estimation",
        "name_ko": "깊이 추정",
        "name_en": "Depth Estimation",
        "description": "단안/스테레오 깊이. 3D 작업 · matte painting · relighting · compositing 의 기반.",
        "icon": "📏",
        "keywords": [
            "depth estimation", "monocular depth", "depth from video",
            "metric depth", "stereo depth",
            "video depth consistency",
            "cs.CV",
        ],
        "github_topics": ["depth-estimation", "monocular-depth"],
        "hf_tags": ["depth-estimation"],
        "subreddits": ["MachineLearning", "computervision"],
        "x_accounts": [],
        "current_sota": [],
        "display_order": 17,
    },

    {
        "slug": "lipsync",
        "name_ko": "립싱크 / 토킹헤드",
        "name_en": "Lip Sync & Talking Head",
        "description": "오디오 → 입모양 / 표정. 캐릭터 더빙, 가상 인물 영상.",
        "icon": "💬",
        "keywords": [
            "lip sync", "lipsync", "audio-driven", "talking head",
            "audio2face", "audio-to-video", "speech to face",
            "facial animation", "viseme",
            "cs.CV", "cs.SD",
        ],
        "github_topics": ["lip-sync", "talking-head", "audio-driven-animation"],
        "hf_tags": ["audio-to-video", "text-to-speech"],
        "subreddits": ["StableDiffusion", "MachineLearning"],
        "x_accounts": ["_akhaliq"],
        "current_sota": [],
        "display_order": 18,
    },

    {
        "slug": "lora_adapter",
        "name_ko": "LoRA / 어댑터",
        "name_en": "LoRA & Adapters",
        "description": "LoRA / IP-Adapter / ControlNet 등 가벼운 확장. 기존 베이스 모델 위 스타일/특정 인물/특정 효과 적용.",
        "icon": "🔗",
        "keywords": [
            "lora", "low rank adaptation", "peft",
            "ip-adapter", "ip adapter", "controlnet",
            "adapter", "style lora", "character lora",
            "diffusion adapter",
            "cs.CV", "cs.LG",
        ],
        "github_topics": ["lora", "peft", "ip-adapter", "controlnet"],
        "hf_tags": ["lora", "stable-diffusion-xl", "diffusion"],
        "subreddits": ["StableDiffusion", "comfyui", "MachineLearning"],
        "x_accounts": ["_akhaliq", "multimodalart"],
        "current_sota": [],
        "display_order": 19,
    },
]


async def seed_categories(update_existing: bool = False):
    """VFX 카테고리 시드. seed.py 의 seed_all() 에서 호출됨.

    update_existing=True 면 기존 카테고리의 keywords/topics/tags 도 merge.
    환경변수 `SEED_VFX_UPDATE=1` 로 활성화 가능.
    """
    import os
    if not update_existing:
        update_existing = os.getenv("SEED_VFX_UPDATE") == "1"

    async with SessionLocal() as db:
        added = 0
        updated = 0
        skipped = 0
        for cat_data in CATEGORIES:
            existing_q = await db.execute(select(Category).where(Category.slug == cat_data["slug"]))
            existing = existing_q.scalar_one_or_none()

            if existing is None:
                cat = Category(**cat_data)
                db.add(cat)
                added += 1
                print(f"[add]    {cat_data['slug']} - {cat_data['name_ko']}")
                continue

            if not update_existing:
                skipped += 1
                print(f"[skip]   {cat_data['slug']} already exists (SEED_VFX_UPDATE=1 로 갱신)")
                continue

            # update — list 필드는 merge (dedup), name/desc 는 새 값 덮어쓰기
            for k in ("name_ko", "name_en", "description", "icon", "display_order"):
                v = cat_data.get(k)
                if v is not None:
                    setattr(existing, k, v)
            for k in ("keywords", "github_topics", "hf_tags", "subreddits", "x_accounts", "current_sota"):
                new_list = list(cat_data.get(k) or [])
                if not new_list:
                    continue
                old_list = list(getattr(existing, k) or [])
                merged: list[str] = []
                seen: set[str] = set()
                for x in old_list + new_list:
                    if x and x not in seen:
                        seen.add(x)
                        merged.append(x)
                setattr(existing, k, merged)
            updated += 1
            print(f"[update] {cat_data['slug']} - keywords/topics merged")

        await db.commit()
        print(f"\n[OK] add={added}, update={updated}, skip={skipped} (총 {len(CATEGORIES)})")


# 호환: VFX 원본 명칭 (단독 실행 시)
seed = seed_categories


if __name__ == "__main__":
    asyncio.run(seed_categories())
