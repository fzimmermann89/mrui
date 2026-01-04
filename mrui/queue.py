from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from huey import SqliteHuey

from mrui.settings import Settings


@lru_cache
def get_huey_client() -> SqliteHuey:
    settings = Settings()
    queue_db_path = Path(settings.queue_db_path)
    queue_db_path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteHuey(name=settings.queue_name, filename=str(queue_db_path))


huey = get_huey_client()
