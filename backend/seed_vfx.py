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
]


async def seed_categories():
    """10 VFX 카테고리 시드. seed.py 의 seed_all() 에서 호출됨."""
    async with SessionLocal() as db:
        for cat_data in CATEGORIES:
            existing = await db.execute(select(Category).where(Category.slug == cat_data["slug"]))
            if existing.scalar_one_or_none():
                print(f"[skip] {cat_data['slug']} already exists")
                continue

            cat = Category(**cat_data)
            db.add(cat)
            print(f"[add]  {cat_data['slug']} - {cat_data['name_ko']}")

        await db.commit()
        print(f"\n[OK] Seeded {len(CATEGORIES)} VFX categories.")


# 호환: VFX 원본 명칭 (단독 실행 시)
seed = seed_categories


if __name__ == "__main__":
    asyncio.run(seed_categories())
