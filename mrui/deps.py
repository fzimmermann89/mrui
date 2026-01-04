from functools import lru_cache

from huey import SqliteHuey

from mrui.queue import get_huey_client
from mrui.settings import Settings


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_huey() -> SqliteHuey:
    return get_huey_client()
