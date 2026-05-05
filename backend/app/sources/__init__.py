from app.sources.arxiv_src import fetch_arxiv
from app.sources.github_src import fetch_github
from app.sources.huggingface_src import fetch_huggingface
from app.sources.reddit_src import fetch_reddit
from app.sources.x_fxtwitter import fetch_x

__all__ = ["fetch_arxiv", "fetch_github", "fetch_huggingface", "fetch_reddit", "fetch_x"]

SOURCE_FETCHERS = {
    "arxiv": fetch_arxiv,
    "github": fetch_github,
    "huggingface": fetch_huggingface,
    "reddit": fetch_reddit,
    "x": fetch_x,
}
