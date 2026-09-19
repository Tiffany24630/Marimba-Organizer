from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "sqlite:///./marimba.db"
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()