from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Call(Base):
    __tablename__ = "calls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(64), default="uploaded")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    speaker: Mapped[str] = mapped_column(String(32))
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)


class QAReview(Base):
    __tablename__ = "qa_reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    score: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text)


class QAFinding(Base):
    __tablename__ = "qa_findings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    qa_review_id: Mapped[int] = mapped_column(ForeignKey("qa_reviews.id"))
    severity: Mapped[str] = mapped_column(String(32))
    evidence: Mapped[str] = mapped_column(Text)


class ProviderConfig(Base):
    __tablename__ = "provider_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(128))
    config: Mapped[dict] = mapped_column(JSON)
