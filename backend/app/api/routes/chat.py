from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService
from app.core.context import RequestContext
from app.api.deps import get_chat_service

router = APIRouter()


@router.post("/stream")
async def chat_stream(
    request_data: ChatRequest,
    http_request: Request,
    service: ChatService = Depends(get_chat_service),
):
    ctx = RequestContext()

    return StreamingResponse(
        service.stream(request_data, http_request, ctx),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable Nginx buffering
        },
    )