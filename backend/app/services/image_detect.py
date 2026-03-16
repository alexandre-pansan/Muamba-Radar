from __future__ import annotations

from datetime import UTC, datetime

from app.schemas import DetectImageResponseModel, ImageCandidateModel


def detect_product_from_image(filename: str, content_type: str) -> DetectImageResponseModel:
    # Placeholder until OCR/vision integration is implemented.
    candidates = [
        ImageCandidateModel(text="iphone 15 128gb", confidence=0.72),
        ImageCandidateModel(text="iphone 15", confidence=0.64),
        ImageCandidateModel(text="apple smartphone", confidence=0.51),
    ]

    return DetectImageResponseModel(
        filename=filename,
        content_type=content_type,
        detected_candidates=candidates,
        top_query=candidates[0].text,
        generated_at=datetime.now(UTC),
    )
