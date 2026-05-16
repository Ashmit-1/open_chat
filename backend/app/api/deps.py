from functools import lru_cache
from fastapi import Depends

from app.config import Settings, get_settings
from app.services.chat_service import ChatService
from app.services.validation_service import ValidationService


def get_chat_service() -> ChatService:
    return ChatService()


def get_validation_service() -> ValidationService:
    return ValidationService()