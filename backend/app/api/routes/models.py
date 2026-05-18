from fastapi import APIRouter, Depends

from app.schemas.model import ModelConfig
from app.schemas.common import ValidationResponse
from app.services.validation_service import ValidationService
from app.api.deps import get_validation_service

router = APIRouter()


@router.post("/validate")
async def validate_model(
    model_config: ModelConfig,
    service: ValidationService = Depends(get_validation_service),
) -> ValidationResponse:
    return await service.validate(model_config)