"""Category Pydantic schemas."""
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


# 검색 힌트 리스트(keywords/topics/...) 정규화: 항목별 trim + 빈/공백-only 제거 + dedupe(순서유지).
# #23: 공백-only("  ")가 DB/시드/API 로 흘러들어 crawler 쿼리(`topic:   ...`)를 깨뜨리던 것을 진입점에서 차단.
_STR_LIST_FIELDS = ("keywords", "github_topics", "hf_tags", "subreddits", "x_accounts", "current_sota")


def _clean_str_list(v: list | None) -> list | None:
    if v is None:
        return None
    seen: set[str] = set()
    out: list[str] = []
    for item in v:
        if not isinstance(item, str):
            continue
        s = item.strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


class CategoryBase(BaseModel):
    slug: str
    name_ko: str
    name_en: str
    description: str | None = None
    icon: str | None = None
    keywords: list[str] = []
    github_topics: list[str] = []
    hf_tags: list[str] = []
    subreddits: list[str] = []
    x_accounts: list[str] = []
    current_sota: list[str] = []
    display_order: int = 0

    @field_validator(*_STR_LIST_FIELDS)
    @classmethod
    def _normalize_str_lists(cls, v):
        return _clean_str_list(v)


class CategoryCreate(CategoryBase):
    pass


# null 로 비울 수 있는 필드는 description/icon 뿐 (DB nullable).
# 그 외(name_ko/name_en=non-null 컬럼, 배열들, display_order)에 명시적 null 이 오면
# 422 로 거절 — DB IntegrityError/500(#22-1) + 조용한 데이터 손상(배열→null, 순서→null) 방지.
_NULLABLE_UPDATE_FIELDS = {"description", "icon"}


class CategoryUpdate(BaseModel):
    """부분 업데이트 — 보낸 필드만 갱신 (slug 는 변경 불가).

    name_ko/name_en 등 non-null 컬럼에 명시적 `null` 을 보내면 422 (#22-1).
    값을 비우려면: description/icon 은 null 허용, 배열은 [] 를 보낼 것.
    """
    name_ko: str | None = None
    name_en: str | None = None
    description: str | None = None
    icon: str | None = None
    keywords: list[str] | None = None
    github_topics: list[str] | None = None
    hf_tags: list[str] | None = None
    subreddits: list[str] | None = None
    x_accounts: list[str] | None = None
    current_sota: list[str] | None = None
    display_order: int | None = None

    @field_validator(*_STR_LIST_FIELDS)
    @classmethod
    def _normalize_str_lists(cls, v):
        return _clean_str_list(v)

    @model_validator(mode="after")
    def _reject_null_on_non_nullable(self) -> "CategoryUpdate":
        # 명시적으로 보낸 필드(model_fields_set) 중 nullable 이 아닌데 None 인 것 → 거절.
        bad = sorted(
            f for f in self.model_fields_set
            if f not in _NULLABLE_UPDATE_FIELDS and getattr(self, f, None) is None
        )
        if bad:
            raise ValueError(
                "다음 필드는 null 로 비울 수 없습니다 "
                f"(값을 지정하거나 필드를 생략; 배열은 [] 사용): {', '.join(bad)}"
            )
        return self


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_count: int = 0
    new_this_week: int = 0
