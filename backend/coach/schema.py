"""Strict response schema for the Photo Coach (shared by every provider)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Severity = Literal["low", "medium", "high"]


class Issue(BaseModel):
    id: str
    title: str
    severity: Severity
    explanation: str = Field(description="Beginner-friendly explanation of the issue")


class TechnicalNotes(BaseModel):
    exposure: str
    white_balance: str
    noise: str
    sharpness: str


class SuggestedFixes(BaseModel):
    in_camera: list[str] = Field(default_factory=list, description="Fixes to apply next time while shooting")
    in_post: list[str] = Field(default_factory=list, description="Fixes possible in post-processing")


class RecommendedSettings(BaseModel):
    iso: Optional[str] = None
    shutter_speed: Optional[str] = None
    aperture: Optional[str] = None
    white_balance: Optional[str] = None
    exposure_comp: Optional[float] = None
    reasoning: str


class PracticeExercise(BaseModel):
    title: str
    goal: str
    how: str


class AnalysisResult(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    summary: str
    issues: list[Issue] = Field(default_factory=list)
    technical_notes: TechnicalNotes
    composition_notes: list[str] = Field(default_factory=list)
    suggested_fixes: SuggestedFixes
    recommended_settings: RecommendedSettings
    practice_exercises: list[PracticeExercise] = Field(min_length=3, max_length=3)


class CoachResponse(BaseModel):
    provider: str
    engine: str = "mock"
    cached: bool = False
    analysis: AnalysisResult
    chat_response: str
    notice: Optional[str] = None
