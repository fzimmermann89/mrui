from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MRUI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    results_dir: str = "/tmp/mrui/results"
    inputs_dir: str = "/tmp/mrui/inputs"

    queue_name: str = "mrui"
    queue_db_path: str = "/tmp/mrui/queue/huey.db"
    job_ttl_seconds: int = 72 * 60 * 60
    job_timeout_seconds: int = 60 * 60
