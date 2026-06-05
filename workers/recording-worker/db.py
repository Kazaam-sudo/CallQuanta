from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Call(Base):
    __tablename__ = "calls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(64), default="uploaded")
    last_error_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_processed_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stored_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ingestion_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ingestion_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)


class IngestionEvent(Base):
    __tablename__ = "ingestion_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    integration_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_provider: Mapped[str] = mapped_column(String(64))
    external_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    call_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
