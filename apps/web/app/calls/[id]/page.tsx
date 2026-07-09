"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DemoModeNotice, DemoQuota } from "../../../components/DemoModeNotice";
import { useI18n } from "../../../components/I18nProvider";
import { SttLanguageSelect } from "../../../components/SttLanguageSelect";
import { Badge, Button, Card, EmptyState, Field, HelpTooltip, PageHeader, SectionHeader, StatusBadge, Tabs } from "../../../components/ui";
import { normalizeSttLanguageCode, sttLanguageLabel } from "../../../lib/i18n";

type Call = {
  id: number;
  filename: string;
  status: string;
  stored_filename?: string | null;
  stored_path?: string | null;
  file_size_bytes?: number | null;
  content_type?: string | null;
  agent_name?: string | null;
  team?: string | null;
  campaign?: string | null;
  direction?: "inbound" | "outbound" | "unknown" | null;
  language?: string | null;
  created_at?: string | null;
  last_error_type?: string | null;
  last_error_message?: string | null;
  last_processed_at?: string | null;
  stt_provider_name?: string | null;
  stt_provider_type?: string | null;
  stt_model?: string | null;
  stt_language_used?: string | null;
  detected_language?: string | null;
  source?: string | null;
  source_provider?: string | null;
  external_call_id?: string | null;
  external_recording_url?: string | null;
  customer_phone?: string | null;
  agent_phone?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  ingestion_status?: string | null;
  ingestion_error?: string | null;
  imported_at?: string | null;
  audio_deleted?: boolean;
};

type TranscriptSegment = {
  id: number;
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
};

type QAFinding = { id?: number; severity: string; evidence: string };
type QACriterion = {
  id: string;
  title: string;
  score: number | string;
  max_points: number | string;
  comment: string;
  evidence: string;
  severity: string;
  human_score?: number | string | null;
  human_comment?: string | null;
  human_severity?: string | null;
  human_agrees?: boolean | null;
};
type CoachingAction = { id:number; title:string; description?:string|null; status:string; due_date?:string|null; agent_name?:string|null; created_by_email?:string|null };
type QAFeedback = { transcript_quality?: string | null; qa_analysis_quality?: string | null; score_agreement?: string | null; scorecard_fit?: string | null; ai_missed_something?: boolean; ai_missed_comment?: string | null; ai_false_positive?: boolean; ai_false_positive_comment?: string | null; useful_for_coaching?: boolean | null; coaching_usefulness_comment?: string | null; overall_feedback?: string | null; issue_tags?: string[]; ai_topic_correct?: string | null; manager_correct_topic?: string | null; topic_feedback_comment?: string | null; required_actions_correct?: string | null; missed_required_actions_feedback?: string | null; false_required_actions_feedback?: string | null; feedback_status?: string };
type QAReview = { transcript_validity?: { is_valid?: boolean; reason?: string; flags?: string[] } | null; qa_invalid_due_to_transcript?: boolean; error_message?: string | null; feedback?: QAFeedback | null; feedback_status?: string; assignment?: { id:number; assigned_to_email?: string | null; status:string } | null; id: number; created_at?: string; status?: string; score: number; summary: string; analysis_mode?: string; provider_name?: string; provider_preset?: string; model?: string; scorecard_name?: string; report_language?: string; legacy_review?: boolean; review_status?: string; human_total_score?: number | null; human_summary?: string | null; human_notes?: string | null; human_reviewer_email?: string | null; human_reviewed_at?: string | null; ai_human_score_delta?: number | null; calibration_flag?: boolean; calibration_notes?: string | null; criteria: QACriterion[]; findings: QAFinding[]; coaching_actions?: CoachingAction[] };
type AuthUser = { id:number; email:string; role:string };
type CallTopicInfo = { primary_topic_name?: string; confidence?: number; secondary_topics?: string[]; rationale?: string; evidence?: string[]; manually_overridden?: boolean; actions?: { id:number; action_text:string; status:string; evidence?:string[]; rationale?:string }[]; topic_compliance_score?: number | null };
type QAReviewCompact = { id:number; created_at?:string; status:string; score?:number; provider_name?:string; model?:string; scorecard_name?:string; report_language?:string; analysis_mode?:string; legacy_review?:boolean; review_status?:string; human_total_score?:number|null; calibration_flag?:boolean };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

const msToSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const callErrorLabel = (message: string | null | undefined, t: (key: string) => string) =>
  message === "demo_limit_reached" ? t("demo.limitReached") : message || "";

export default function CallDetailsPage({ params }: { params: { id: string } }) {
  const { t, sttLanguages } = useI18n();
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [review, setReview] = useState<QAReview | null>(null);
  const [topic, setTopic] = useState<CallTopicInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QAReviewCompact[]>([]);
  const [viewingReviewId, setViewingReviewId] = useState<number | null>(null);
  const [viewLoadingReviewId, setViewLoadingReviewId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [classifyingTopic, setClassifyingTopic] = useState(false);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataSaveSuccess, setMetadataSaveSuccess] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({ agent_name: "", team: "", campaign: "", direction: "unknown", language: "" });
  const [sttSettings, setSttSettings] = useState<{ mode: string; model: string; provider?: { name?: string; provider_type?: string; model?: string } | null } | null>(null);
  const [demoQuota, setDemoQuota] = useState<DemoQuota | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [humanForm, setHumanForm] = useState({ review_status: "approved", human_total_score: "", human_summary: "", human_notes: "", calibration_flag: false, calibration_notes: "" });
  const [criterionReviews, setCriterionReviews] = useState<Record<string, { human_score: string; human_comment: string; human_agrees: string; human_severity: string }>>({});
  const [coachingForm, setCoachingForm] = useState({ title: "", description: "", due_date: "" });
  const [feedbackForm, setFeedbackForm] = useState<QAFeedback>({ transcript_quality: "", qa_analysis_quality: "", score_agreement: "", scorecard_fit: "", useful_for_coaching: null, issue_tags: [] });
  const [assignUserId, setAssignUserId] = useState("");
  const [savingHumanReview, setSavingHumanReview] = useState(false);
  const [savingCoaching, setSavingCoaching] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [audioError, setAudioError] = useState(false);
  const transcriptInvalid = Boolean(review?.qa_invalid_due_to_transcript || call?.last_error_type === "invalid_transcript");
  const isPlaceholderQa = review?.analysis_mode === "placeholder";
  const transcriptFlags = review?.transcript_validity?.flags || [];
  const transcriptHasPlaceholder = transcriptFlags.some((flag) => flag.toLowerCase().includes("placeholder")) || segments.some((segment) => segment.text.toLowerCase().includes("placeholder"));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callResponse, transcriptResponse, qaResponse, historyResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/calls/${params.id}`),
        fetch(`${API_BASE_URL}/calls/${params.id}/transcript`),
        fetch(`${API_BASE_URL}/calls/${params.id}/qa`),
        fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews`),
      ]);
      if (!callResponse.ok) {
        setError("Call not found.");
        return;
      }
      const callData = await callResponse.json();
      setCall(callData);
      setMetadata({
        agent_name: callData.agent_name || "",
        team: callData.team || "",
        campaign: callData.campaign || "",
        direction: callData.direction || "unknown",
        language: callData.language || "",
      });
      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json();
        setSegments(transcriptData.segments || []);
      }
      if (qaResponse.ok) { const qaData = await qaResponse.json(); setReview(qaData.review || null); setViewingReviewId(qaData.review?.id ?? null); setTopic(qaData.topic || null); }
      if (historyResponse.ok) { const hist = await historyResponse.json(); setHistory(hist.reviews || []); }
      fetch(`${API_BASE_URL}/demo/status`).then((res) => res.ok ? res.json() : null).then((data) => { if (data) setDemoQuota(data); }).catch(() => {});
      fetch(`${API_BASE_URL}/settings/stt`).then((res) => res.ok ? res.json() : null).then((data) => { if (data) setSttSettings(data); }).catch(() => {});
      fetch(`${API_BASE_URL}/auth/me`).then((res) => res.ok ? res.json() : null).then((data) => { if (data?.user) setUser(data.user); }).catch(() => {});
    } catch {
      setError("Failed to load call.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!review) return;
    setHumanForm({
      review_status: review.review_status && review.review_status !== "ai_generated" ? review.review_status : "approved",
      human_total_score: review.human_total_score == null ? "" : String(review.human_total_score),
      human_summary: review.human_summary || "",
      human_notes: review.human_notes || "",
      calibration_flag: Boolean(review.calibration_flag),
      calibration_notes: review.calibration_notes || "",
    });
    const criteria: Record<string, { human_score: string; human_comment: string; human_agrees: string; human_severity: string }> = {};
    review.criteria?.forEach((criterion, index) => {
      criteria[String(criterion.id || index)] = {
        human_score: criterion.human_score == null ? "" : String(criterion.human_score),
        human_comment: criterion.human_comment || "",
        human_agrees: criterion.human_agrees == null ? "" : String(criterion.human_agrees),
        human_severity: criterion.human_severity || "",
      };
    });
    setCriterionReviews(criteria);
    setFeedbackForm(review.feedback || { transcript_quality: "", qa_analysis_quality: "", score_agreement: "", scorecard_fit: "", useful_for_coaching: null, issue_tags: [] });
  }, [review]);

  useEffect(() => {
    if (!["transcription_pending", "transcribing", "analysis_pending", "analyzing"].includes(call?.status || "")) return;
    const interval = setInterval(() => {
      load();
    }, 2000);
    return () => clearInterval(interval);
  }, [call?.status, load]);

  const transcribe = async () => {
    if (!call || transcribing) return;
    try {
      setError(null);
      setTranscribing(true);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/transcribe`, { method: "POST" });
      if (!response.ok) {
        let detail = "Failed to enqueue transcription.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) detail = data.detail;
        } catch {}
        setError(`Transcribe request failed: ${detail}`);
        return;
      }
      await load();
    } catch {
      setError("Transcribe request failed: Network error.");
    } finally {
      setTranscribing(false);
    }
  };

  const classifyTopic = async () => {
    if (!call || classifyingTopic) return;
    try {
      setError(null);
      setClassifyingTopic(true);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/classify-topic`, { method: "POST" });
      if (!response.ok) {
        let detail = "Failed to classify topic.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) detail = data.detail;
        } catch {}
        setError(`Topic classification failed: ${detail}`);
        return;
      }
      const data = await response.json();
      setTopic(data.topic || null);
      await load();
    } catch {
      setError("Topic classification failed: Network error.");
    } finally {
      setClassifyingTopic(false);
    }
  };

  const analyze = async () => {
    if (!call || analyzing || segments.length === 0 || call.status === "analysis_pending") return;
    try {
      setError(null);
      setAnalyzing(true);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/analyze`, { method: "POST" });
      if (!response.ok) {
        let detail = "Failed to enqueue analysis.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) detail = data.detail;
        } catch {}
        if (detail === "demo_limit_reached") detail = t("demo.limitReached");
        setError(`Analyze request failed: ${detail}`);
        return;
      }
      await load();
    } catch {
      setError("Analyze request failed: Network error.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveMetadata = async () => {
    if (!call || metadataSaving) return;
    try {
      setMetadataSaving(true);
      setMetadataSaveSuccess(false);
      setMetadataMessage(null);
      setMetadataError(null);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      if (!response.ok) {
        let detail = "Unknown error";
        const raw = await response.text().catch(() => "");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.detail === "string" && parsed.detail) detail = parsed.detail;
            else if (parsed?.detail != null) detail = JSON.stringify(parsed.detail);
            else detail = raw;
          } catch {
            detail = raw;
          }
        }
        throw new Error(`Failed to save metadata: ${detail}`);
      }
      const updated = await response.json();
      setCall(updated);
      setMetadata({
        agent_name: updated.agent_name || "",
        team: updated.team || "",
        campaign: updated.campaign || "",
        direction: updated.direction || "unknown",
        language: updated.language || "",
      });
      setMetadataSaveSuccess(true);
      setMetadataMessage("Metadata saved.");
      setTimeout(() => {
        setMetadataSaveSuccess(false);
        setMetadataMessage(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save metadata: Unknown error";
      setMetadataError(message);
      setMetadataSaveSuccess(false);
    } finally {
      setMetadataSaving(false);
    }
  };

  const canHumanReview = user ? ["admin", "manager", "supervisor"].includes(user.role) : false;
  const reviewStatusLabel = (status?: string) => (status || "ai_generated").replaceAll("_", " ");

  const saveHumanReview = async () => {
    if (!review || savingHumanReview) return;
    setSavingHumanReview(true);
    setError(null);
    try {
      const criteria = review.criteria?.map((criterion, index) => {
        const key = String(criterion.id || index);
        const item = criterionReviews[key] || { human_score: "", human_comment: "", human_agrees: "", human_severity: "" };
        return {
          criterion_id: criterion.id,
          criterion_index: index,
          human_score: item.human_score === "" ? null : Number(item.human_score),
          human_comment: item.human_comment,
          human_agrees: item.human_agrees === "" ? null : item.human_agrees === "true",
          human_severity: item.human_severity,
        };
      });
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}/human-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...humanForm,
          human_total_score: humanForm.human_total_score === "" ? null : Number(humanForm.human_total_score),
          criteria,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setReview(data.review);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save human review.");
    } finally {
      setSavingHumanReview(false);
    }
  };

  const addCoachingAction = async () => {
    if (!review || !coachingForm.title.trim()) return;
    setSavingCoaching(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}/coaching-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: coachingForm.title, description: coachingForm.description, due_date: coachingForm.due_date ? new Date(coachingForm.due_date).toISOString() : null }),
      });
      if (!response.ok) throw new Error(await response.text());
      setCoachingForm({ title: "", description: "", due_date: "" });
      const latest = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}`).then((res) => res.json());
      setReview(latest.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add coaching action.");
    } finally {
      setSavingCoaching(false);
    }
  };

  const saveFeedback = async (patch?: QAFeedback) => {
    if (!review) return;
    const body = { ...feedbackForm, ...(patch || {}) };
    const response = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}/feedback`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.ok) { const data = await response.json(); setFeedbackForm(data.feedback); setReview({ ...review, feedback: data.feedback, feedback_status: data.feedback?.feedback_status }); }
  };

  const assignReview = async () => {
    if (!review || !assignUserId.trim()) return;
    const response = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigned_to_user_id: Number(assignUserId) }) });
    if (response.ok) { const data = await response.json(); setReview({ ...review, assignment: data.assignment }); setAssignUserId(""); }
  };

  const updateCoachingStatus = async (actionId: number, status: string) => {
    if (!review) return;
    const response = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}/coaching-actions/${actionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) {
      const latest = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${review.id}`).then((res) => res.json());
      setReview(latest.review);
    }
  };

  const pendingState = useMemo(() => call?.status === "transcription_pending" || call?.status === "transcribing" || transcribing, [call?.status, transcribing]);
  const analysisPendingState = useMemo(() => call?.status === "analysis_pending" || call?.status === "analyzing" || analyzing, [call?.status, analyzing]);
  const canAnalyzeAgain = call?.status === "analyzed" || call?.status === "analysis_failed";
  const latestReviewId = history[0]?.id ?? review?.id ?? null;
  const viewingLatest = viewingReviewId != null && latestReviewId != null && viewingReviewId === latestReviewId;

  const providerMeta = useMemo(() => {
    const metaEvidence = review?.findings?.find((finding) => finding.evidence.startsWith("Analysis mode:"))?.evidence || "";
    const chunks = metaEvidence.split(";").map((x) => x.trim());
    const out: Record<string, string> = {};
    for (const chunk of chunks) {
      const [k, ...v] = chunk.split(":");
      if (!k || v.length === 0) continue;
      out[k.toLowerCase()] = v.join(":").trim();
    }
    return out;
  }, [review]);


  const viewReview = async (reviewId: number) => {
    if (viewingReviewId === reviewId) {
      setError("Selected review is already being viewed.");
      return;
    }
    try {
      setError(null);
      setViewLoadingReviewId(reviewId);
      const res = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${reviewId}`);
      if (!res.ok) {
        let detail = `Failed to load review #${reviewId}.`;
        try {
          const raw = await res.text();
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.detail) detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
            } catch {
              detail = raw;
            }
          }
        } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      setReview(data.review || null);
      setViewingReviewId(reviewId);
      document.getElementById("qa-review-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load selected review.");
    } finally {
      setViewLoadingReviewId(null);
    }
  };

  const exportUrl = (kind: "history"|"single", format: "xlsx"|"csv") => kind === "history"
    ? `${API_BASE_URL}/calls/${params.id}/qa/reviews/export?format=${format}`
    : `${API_BASE_URL}/calls/${params.id}/qa/reviews/${viewingReviewId}/export?format=${format}`;

  const latestFailureHint = useMemo(() => {
    const warning = review?.findings?.find((f) => f.severity === "warning" && f.evidence.toLowerCase().includes("parse error"));
    return warning?.evidence;
  }, [review]);

  const recoveredReview = useMemo(
    () =>
      review?.findings?.some((finding) =>
        finding.evidence.toLowerCase().includes("partially recovered from an imperfect llm response"),
      ) ?? false,
    [review],
  );

  const tabs = [
    { id: "overview", label: t("call.tab.overview") },
    { id: "transcript", label: t("call.tab.transcript"), help: t("help.sttProvider") },
    { id: "topic", label: t("call.tab.topic") },
    { id: "qa", label: t("call.tab.qa"), help: t("help.aiReview") },
    { id: "human", label: t("call.tab.human"), help: t("help.humanReview") },
    { id: "feedback", label: t("call.tab.feedback") },
    { id: "coaching", label: t("call.tab.coaching"), help: t("help.coachingActions") },
    { id: "history", label: t("call.tab.history") },
  ];

  const metaValue = (value?: string | number | null) => value == null || value === "" ? "-" : value;
  const statusLabel = (status?: string | null) => t(`status.${status || "unknown"}`);
  const actionStatusLabel = (status?: string | null) => t(`topic.action.${status || "unclear"}`);
  const formatFileSize = (bytes?: number | null) => {
    if (bytes == null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
  const reviewMeta = (value?: string | null, key?: string) => review?.legacy_review ? (value || (key && providerMeta[key]) ? t("call.recoveredMetadata") : t("call.notCaptured")) : (value || t("call.notCaptured"));
  const hasAudio = Boolean(call?.stored_path && !call?.audio_deleted);
  const audioUrl = `${API_BASE_URL}/calls/${params.id}/audio`;
  const transcriptState = !segments.length ? t("call.status.notReady") : transcriptInvalid ? t("call.status.invalid") : t("call.status.valid");
  const qaState = transcriptInvalid ? t("call.status.blocked") : review ? t("call.status.ready") : t("call.status.notReady");
  const topicState = topic ? t("call.status.ready") : t("call.status.notReady");
  const transcriptStatusTone = transcriptInvalid ? "message-warning" : segments.length ? "message-success" : "";
  const mainRisk = transcriptInvalid
    ? t("call.mainRisk.invalidTranscript")
    : call?.last_error_message
      ? t("call.mainRisk.error")
      : topic?.actions?.some((action) => action.status === "missed")
        ? t("call.mainRisk.missedAction")
        : review && review.score < 70
          ? t("call.mainRisk.lowScore")
          : review
            ? t("call.mainRisk.ready")
            : t("call.mainRisk.needsAnalysis");
  const qaBusinessStatus = transcriptInvalid
    ? t("call.qaStatus.invalidTranscript")
    : call?.status === "analysis_pending" || call?.status === "analyzing"
      ? t("call.qaStatus.pending")
      : call?.status === "analysis_failed"
        ? t("call.qaStatus.failed")
        : review
          ? t("call.qaStatus.ready")
          : t("call.qaStatus.notStarted");
  const statusBusinessHelp = call?.status === "analyzed"
    ? t("call.statusHelp.analyzed")
    : call?.status === "analysis_blocked_invalid_transcript"
      ? t("call.statusHelp.invalidTranscript")
      : call?.status === "analysis_pending" || call?.status === "analyzing"
        ? t("call.statusHelp.pending")
        : call?.status === "analysis_failed"
          ? t("call.statusHelp.failed")
          : t("call.statusHelp.default");
  const topicActions = topic?.actions || [];
  const missedTopicActions = topicActions.filter((action) => action.status === "missed");
  const completedTopicActions = topicActions.filter((action) => action.status === "completed");
  const nextAction = !segments.length
    ? { label: t("call.transcribe"), run: transcribe, disabled: !call || transcribing }
    : transcriptInvalid
      ? { label: t("pilot.retranscribe"), run: transcribe, disabled: !call || transcribing }
      : !review
        ? { label: t("call.analyze"), run: analyze, disabled: !call || analyzing || Boolean(demoQuota?.enabled && demoQuota.exceeded) }
        : { label: t("call.openQa"), run: () => setActiveTab("qa"), disabled: false };

  return (
    <div className="grid page-stack">
      <p style={{ margin: 0 }}><Link href="/calls">← {t("call.backToCalls")}</Link></p>

      <PageHeader
        title={<span className="call-summary-row"><span>{t("dashboard.table.call")} #{call?.id ?? params.id}</span>{call?.status ? <StatusBadge status={call.status} label={statusLabel(call.status)} /> : null}</span>}
        description={call?.filename || t("call.detailsDescription")}
        actions={<>
          <Button variant="secondary" onClick={load}>{t("call.refresh")}</Button>
          <Button onClick={transcribe} disabled={!call || loading || transcribing}>{transcribing ? t("call.transcribing") : t("call.transcribe")}</Button>
          <Button onClick={analyze} disabled={!call || loading || analyzing || segments.length === 0 || call.status === "analysis_pending" || Boolean(demoQuota?.enabled && demoQuota.exceeded)}>{analysisPendingState ? t("call.analyzing") : canAnalyzeAgain ? t("call.analyzeAgain") : t("call.analyze")}</Button>
        </>}
      />
      <DemoModeNotice quota={demoQuota} compact />
      {demoQuota?.enabled && demoQuota.exceeded ? <p className="message message-warning">{t("demo.limitReached")}</p> : null}

      <Card>
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {pendingState && <p className="message">{t("call.transcriptionProgress")}</p>}
        {analysisPendingState && <p className="message">{t("call.analysisProgress")}</p>}
        {call?.last_error_message && <p className="message message-error"><strong>{t("calls.lastError")}:</strong> {callErrorLabel(call.last_error_message, t)}{latestFailureHint ? ` ${t("call.latestHint")}: ${latestFailureHint}` : ""}</p>}
        {call?.ingestion_error && <p className="message message-error"><strong>{t("telephony.ingestionStatus")}:</strong> {call.ingestion_error}</p>}
        {error && <p className="message message-error">{error}</p>}
        {loading && <p>{t("call.loading")}</p>}
      </Card>

      {activeTab === "overview" && <div className="tab-panel">
        <Card>
          <SectionHeader title={t("call.demoSummary")} description={t("call.demoSummaryHelp")} actions={<Button onClick={nextAction.run} disabled={nextAction.disabled}>{nextAction.label}</Button>} />
          <div className="demo-summary-grid">
            <div className="demo-summary-card"><small>{t("call.result")}</small><strong>{statusLabel(call?.status)}</strong><span className="technical-detail">{statusBusinessHelp}</span></div>
            <div className="demo-summary-card"><small>{t("call.qaResult")}</small><strong>{review?.score != null && !transcriptInvalid ? `${review.score}` : qaBusinessStatus}</strong><span className="technical-detail">{qaBusinessStatus}</span></div>
            <div className="demo-summary-card"><small>{t("topic.primary")}</small><strong>{topic?.primary_topic_name || topicState}</strong><span className="technical-detail">{topic ? t("call.topicValueHelp") : t("topic.emptyDescription")}</span></div>
            <div className="demo-summary-card"><small>{t("call.mainRiskAction")}</small><strong>{mainRisk}</strong><span className="technical-detail">{transcriptInvalid ? t("call.analysisBlockedBusinessHelp") : t("call.mainRiskActionHelp")}</span></div>
          </div>
        </Card>
        <Card>
          <SectionHeader title={t("call.whatToCheckFirst")} description={t("call.whatToCheckFirstHelp")} />
          <ol className="guide-list">
            <li><span className="guide-step">1</span><div><strong>{t("call.checkScore")}</strong><small>{t("call.checkScoreHelp")}</small></div></li>
            <li><span className="guide-step">2</span><div><strong>{t("call.checkWhy")}</strong><small>{t("call.checkWhyHelp")}</small></div></li>
            <li><span className="guide-step">3</span><div><strong>{t("call.checkTopicActions")}</strong><small>{t("call.checkTopicActionsHelp")}</small></div></li>
            <li><span className="guide-step">4</span><div><strong>{t("call.checkEvidence")}</strong><small>{t("call.checkEvidenceHelp")}</small></div></li>
            <li><span className="guide-step">5</span><div><strong>{t("call.checkFeedback")}</strong><small>{t("call.checkFeedbackHelp")}</small></div></li>
          </ol>
        </Card>
        <Card>
          <SectionHeader title={t("call.whatHappened")} description={t("call.whatHappenedHelp")} />
          {review?.summary ? <p>{review.summary}</p> : <EmptyState title={t("call.noSummaryYet")} description={segments.length ? t("call.noQaReviewHelp") : t("call.noTranscriptHelp")} />}
          <div className="meta-grid" style={{ marginTop: 12 }}>
            <div className="meta-item"><small>{t("call.agentName")}</small>{metaValue(call?.agent_name)}</div>
            <div className="meta-item"><small>{t("call.team")}</small>{metaValue(call?.team)}</div>
            <div className="meta-item"><small>{t("call.duration")}</small>{call?.duration_seconds != null ? `${call.duration_seconds}s` : "-"}</div>
            <div className="meta-item"><small>{t("call.status.audio")}</small>{hasAudio ? t("call.status.available") : t("call.status.missing")}</div>
          </div>
        </Card>
        <Card id="qa-review-section">
          <SectionHeader title={t("call.aiQaResult")} description={t("call.aiQaBusinessHelp")} help={t("help.aiReview")} actions={<Button variant="secondary" onClick={() => setActiveTab("qa")}>{t("call.openQa")}</Button>} />
          {transcriptInvalid ? <div className="message message-warning"><strong>{t("call.invalidTranscriptBusinessTitle")}</strong><br />{t("call.analysisBlockedBusinessHelp")}<br /><span className="technical-detail">{t("call.technicalDetail")}: {review?.transcript_validity?.reason || call?.last_error_message || call?.last_error_type || "analysis_blocked_invalid_transcript"}</span></div> : null}
          {!review ? <EmptyState title={t("call.noQaReview")} description={segments.length ? t("call.noQaReviewHelp") : t("call.noTranscriptHelp")} /> : !transcriptInvalid ? <div className="grid">
            <div className="review-hero">
              <div className="review-score"><small>{t("qa.aiScore")}</small><strong>{review.score}</strong><StatusBadge status={review.status} label={statusLabel(review.status)} /></div>
              <div>
                {isPlaceholderQa ? <p className="message message-warning"><Badge tone="warning">{t("pilot.placeholderDemo")}</Badge> {t("pilot.placeholderQaWarning")}</p> : null}
                <p><strong>{t("call.summary")}:</strong> {review.summary}</p>
              </div>
            </div>
            {review.findings.length === 0 ? <EmptyState title={t("call.noFindings")} description={t("call.noFindingsHelp")} /> : <div className="grid" style={{ gap: 8 }}>{review.findings.slice(0, 3).map((finding, i) => <article key={finding.id || i} className="segment"><Badge tone={finding.severity === "critical" ? "danger" : finding.severity === "warning" ? "warning" : "info"}>{finding.severity}</Badge><p>{finding.evidence}</p></article>)}</div>}
          </div> : null}
        </Card>
        <Card>
          <SectionHeader title={t("call.topicAndActions")} description={t("call.topicBusinessHelp")} actions={<Button variant="secondary" onClick={() => setActiveTab("topic")}>{t("call.tab.topic")}</Button>} />
          {!topic ? <EmptyState title={t("topic.emptyTitle")} description={segments.length ? t("topic.emptyDescription") : t("call.noTranscriptHelp")} /> : <div className="grid">
            <div className="meta-grid">
              <div className="meta-item"><small>{t("topic.primary")}</small>{topic.primary_topic_name || "-"}</div>
              <div className="meta-item"><small>{t("topic.confidence")}</small>{topic.confidence != null ? `${Math.round(topic.confidence * 100)}%` : "-"}</div>
              <div className="meta-item"><small>{t("topic.compliance")}</small>{topic.topic_compliance_score != null ? `${topic.topic_compliance_score}%` : "-"}</div>
              <div className="meta-item"><small>{t("topic.requiredActions")}</small>{completedTopicActions.length}/{topicActions.length || 0} {t("call.completedShort")}</div>
            </div>
            {missedTopicActions.length ? <p className="message message-warning">{t("call.missedActionsHelp")}</p> : null}
            {topicActions.length === 0 ? <EmptyState title={t("topic.noRequiredActions")} description={t("call.requiredActionsBusinessHelp")} /> : <div className="grid" style={{ gap: 8 }}>{topicActions.slice(0, 4).map((action) => <article key={action.id} className="segment"><Badge tone={action.status === "completed" ? "success" : action.status === "missed" ? "danger" : "warning"}>{actionStatusLabel(action.status)}</Badge><p>{action.action_text}</p>{action.rationale ? <small>{action.rationale}</small> : null}</article>)}</div>}
          </div>}
        </Card>
        <Card>
          <SectionHeader title={t("call.transcriptEvidence")} description={t("call.transcriptBusinessHelp")} actions={<Button variant="secondary" onClick={() => setActiveTab("transcript")}>{t("call.tab.transcript")}</Button>} />
          <div className={`message ${transcriptStatusTone}`}>
            <strong>{t("call.transcriptValidity")}:</strong> {transcriptState}<br />
            {transcriptInvalid ? t("call.invalidTranscriptDataQualityHelp") : segments.length ? t("call.validTranscriptHelp") : t("call.noTranscriptHelp")}
            {review?.transcript_validity?.reason ? <><br /><span className="technical-detail">{t("call.technicalDetail")}: {review.transcript_validity.reason}</span></> : null}
          </div>
          {segments.length === 0 ? <EmptyState title={t("call.noTranscript")} description={t("call.noTranscriptHelp")} /> : <div className="grid evidence-preview">{segments.slice(0, 5).map((segment) => <article key={segment.id} className="segment"><small>{msToSeconds(segment.start_ms)} - {msToSeconds(segment.end_ms)} · {segment.speaker}</small><p>{segment.text}</p></article>)}</div>}
        </Card>
        <Card>
          <SectionHeader title={t("call.managerFeedback")} description={t("call.managerFeedbackBusinessHelp")} actions={<Button variant="secondary" onClick={() => setActiveTab("feedback")}>{t("pilot.reviewFeedback")}</Button>} />
          {!review ? <EmptyState title={t("call.noQaReview")} description={t("call.feedbackNeedsQaHelp")} /> : <div className="meta-grid">
            <div className="meta-item"><small>{t("pilot.transcriptQuality")}</small>{feedbackForm.transcript_quality || t("pilot.notEvaluated")}</div>
            <div className="meta-item"><small>{t("pilot.qaAnalysisQuality")}</small>{feedbackForm.qa_analysis_quality || t("pilot.notEvaluated")}</div>
            <div className="meta-item"><small>{t("pilot.scoreAgreement")}</small>{feedbackForm.score_agreement || t("pilot.notEvaluated")}</div>
            <div className="meta-item"><small>{t("pilot.requiredActionsCorrect")}</small>{feedbackForm.required_actions_correct || t("pilot.notEvaluated")}</div>
          </div>}
        </Card>
        <Card>
          <SectionHeader title={t("call.recording")} description={t("call.recordingHelp")} />
          {!call ? <p>{t("call.loading")}</p> : !hasAudio ? (
            <EmptyState title={t("call.audioNotFound")} description={t("call.noAudioAvailableBusinessHelp")} />
          ) : (
            <div className="grid" style={{ gap: 12 }}>
              <audio controls preload="metadata" src={audioUrl} onCanPlay={() => setAudioError(false)} onError={() => setAudioError(true)} style={{ width: "100%" }}>
                {t("call.browserCannotPlay")}
              </audio>
              {audioError && <p className="message message-warning">{t("call.browserCannotPlay")}</p>}
              <div className="meta-grid">
                <div className="meta-item"><small>{t("calls.filename")}</small>{call.filename}</div>
                <div className="meta-item"><small>{t("call.contentType")}</small>{metaValue(call.content_type)}</div>
                <div className="meta-item"><small>{t("calls.fileSize")}</small>{formatFileSize(call.file_size_bytes)}</div>
                <div className="meta-item"><small>{t("telephony.sourceProvider")}</small>{call.source_provider || call.source || t("call.uploadedSource")}</div>
              </div>
              <div><a className="button button-secondary" href={`${audioUrl}?download=1`}>{t("call.downloadAudio")}</a></div>
            </div>
          )}
        </Card>
        <Card>
          <SectionHeader title={t("call.overview")} description={t("call.overviewHelp")} />
          {call ? <div className="meta-grid">
            <div className="meta-item"><small>{t("calls.filename")}</small>{call.filename}</div>
            <div className="meta-item"><small>{t("calls.created")}</small>{call.created_at ? new Date(call.created_at).toLocaleString() : "-"}</div>
            <div className="meta-item"><small>{t("calls.fileSize")}</small>{call.file_size_bytes != null ? `${call.file_size_bytes.toLocaleString()} bytes` : "-"}</div>
            <div className="meta-item"><small>{t("call.contentType")}</small>{metaValue(call.content_type)}</div>
            <div className="meta-item"><small>{t("calls.lastProcessed")}</small>{call.last_processed_at ? new Date(call.last_processed_at).toLocaleString() : "-"}</div>
            <div className="meta-item"><small>{t("telephony.sourceProvider")}</small>{call.source_provider || call.source || "-"}</div>
            <div className="meta-item"><small>{t("telephony.externalCallId")}</small>{metaValue(call.external_call_id)}</div>
            <div className="meta-item"><small>{t("telephony.ingestionStatus")} <HelpTooltip text={t("help.ingestionEvents")} /></small>{call.ingestion_status ? t(`status.${call.ingestion_status}`) : "-"}</div>
            <div className="meta-item"><small>{t("call.imported")}</small>{call.imported_at ? new Date(call.imported_at).toLocaleString() : "-"}</div>
            <div className="meta-item"><small>{t("call.customerPhone")}</small>{metaValue(call.customer_phone)}</div>
            <div className="meta-item"><small>{t("call.agentPhone")}</small>{metaValue(call.agent_phone)}</div>
            <div className="meta-item"><small>{t("call.duration")}</small>{call.duration_seconds != null ? `${call.duration_seconds}s` : "-"}</div>
          </div> : <EmptyState title={t("call.loading")} />}
        </Card>
        <Card>
          <SectionHeader title={t("call.metadata")} description={t("call.metadataHelp")} />
          <div className="grid-2">
            <Field label={t("call.agentName")}><input value={metadata.agent_name} onChange={(e) => setMetadata((m) => ({ ...m, agent_name: e.target.value }))} /></Field>
            <Field label={t("call.team")}><input value={metadata.team} onChange={(e) => setMetadata((m) => ({ ...m, team: e.target.value }))} /></Field>
            <Field label={t("call.campaign")}><input value={metadata.campaign} onChange={(e) => setMetadata((m) => ({ ...m, campaign: e.target.value }))} /></Field>
            <Field label={t("call.direction")}><select value={metadata.direction} onChange={(e) => setMetadata((m) => ({ ...m, direction: e.target.value }))}><option value="unknown">{t("call.directionUnknown")}</option><option value="inbound">{t("call.directionInbound")}</option><option value="outbound">{t("call.directionOutbound")}</option></select></Field>
            <Field label={t("call.audioLanguage")} help={t("help.audioLanguage")}><SttLanguageSelect value={metadata.language} languages={sttLanguages} t={t} onChange={(value) => setMetadata((m) => ({ ...m, language: value }))} /></Field>
          </div>
          <div className="actions" style={{ marginTop: 14 }}><Button onClick={saveMetadata} disabled={metadataSaving}>{metadataSaving ? t("call.saving") : metadataSaveSuccess ? t("call.metadataSaved") : t("call.saveMetadata")}</Button></div>
          {metadataMessage && <p className="message message-success">{metadataMessage}</p>}
          {metadataError && <p className="message message-error">{metadataError}</p>}
        </Card>
      </div>}

      {activeTab === "transcript" && <Card>
        <SectionHeader title={t("call.transcriptSegments")} description={t("call.transcriptBusinessHelp")} />
        <p className="message">{t("call.transcriptAudioHint")} {t("call.transcriptValidationBusinessHelp")}</p>
        <div className={`message ${transcriptInvalid || transcriptHasPlaceholder ? "message-warning" : "message-success"}`}>
          <strong>{t("call.transcriptValidity")}:</strong> {transcriptState}
          {review?.transcript_validity?.reason ? <><br />{review.transcript_validity.reason}</> : null}
          {transcriptFlags.length ? <><br />{t("call.transcriptFlags")}: {transcriptFlags.join(", ")}</> : null}
          {transcriptHasPlaceholder ? <><br />{t("call.placeholderTranscriptWarning")}</> : null}
        </div>
        {call && <div className="meta-grid" style={{ marginBottom: 14 }}>
          <div className="meta-item"><small>{t("call.audioLanguage")} <HelpTooltip text={t("help.audioLanguage")} /></small>{sttLanguageLabel(call.language, sttLanguages, t)}</div>
          <div className="meta-item"><small>{t("call.sttLanguageUsed")}</small>{call.stt_language_used || normalizeSttLanguageCode(call.language) || "auto"}</div>
          <div className="meta-item"><small>{t("settings.sttProvider")} <HelpTooltip text={t("help.sttProvider")} /></small>{call.stt_provider_name || sttSettings?.provider?.name || sttSettings?.mode || "-"}</div>
          <div className="meta-item"><small>{t("settings.currentSttModel")}</small>{call.stt_model || sttSettings?.model || "-"}</div>
          <div className="meta-item"><small>{t("call.detectedLanguage")}</small>{call.detected_language || "-"}</div>
        </div>}
        {normalizeSttLanguageCode(call?.language) === "uz" && (call?.stt_provider_type || sttSettings?.provider?.provider_type || sttSettings?.mode) === "faster_whisper_local" && (call?.stt_model || sttSettings?.model || "").toLowerCase() === "tiny" && <p className="message message-warning">{t("settings.uzbekTinyWarning")}</p>}
        {segments.length === 0 ? <EmptyState title={t("call.noTranscript")} description={t("call.noTranscriptHelp")} /> : <div className="grid">{segments.map((segment) => <article key={segment.id} className="segment"><small>{msToSeconds(segment.start_ms)} - {msToSeconds(segment.end_ms)} • {segment.speaker}</small><p>{segment.text}</p></article>)}</div>}
      </Card>}

      {activeTab === "topic" && <Card>
        <SectionHeader
          title={t("topic.title")}
          description={t("call.topicBusinessHelp")}
          actions={<Button onClick={classifyTopic} disabled={!call || classifyingTopic || segments.length === 0}>{classifyingTopic ? t("topic.classifying") : t("topic.classify")}</Button>}
        />
        {!topic ? <div className="grid" style={{ gap: 12 }}><EmptyState title={t("topic.emptyTitle")} description={t("topic.emptyDescription")} /><div className="actions"><Button onClick={classifyTopic} disabled={!call || classifyingTopic || segments.length === 0}>{classifyingTopic ? t("topic.classifying") : t("topic.classify")}</Button></div></div> : <div className="grid">
          <div className="meta-grid">
            <div className="meta-item"><small>{t("topic.primary")}</small>{topic.primary_topic_name || "-"}</div>
            <div className="meta-item"><small>{t("topic.confidence")}</small>{topic.confidence != null ? `${Math.round(topic.confidence * 100)}%` : "-"}</div>
            <div className="meta-item"><small>{t("topic.secondary")}</small>{(topic.secondary_topics || []).join(", ") || "-"}</div>
            <div className="meta-item"><small>{t("topic.manualOverride")}</small>{topic.manually_overridden ? t("common.yes") : t("common.no")}</div>
          </div>
          {topic.rationale ? <p className="message"><strong>{t("topic.rationale")}:</strong> {topic.rationale}</p> : null}
          {(topic.evidence || []).length ? <div><strong>{t("topic.evidence")}:</strong><ul>{(topic.evidence || []).map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
          <SectionHeader title={t("topic.requiredActions")} description={topic.topic_compliance_score != null ? `${t("topic.compliance")}: ${topic.topic_compliance_score}%` : undefined} />
          {(topic.actions || []).length === 0 ? <EmptyState title={t("topic.noRequiredActions")} /> : <div className="grid" style={{ gap: 8 }}>{(topic.actions || []).map((action) => <article key={action.id} className="segment"><Badge tone={action.status === "completed" ? "success" : action.status === "missed" ? "danger" : "warning"}>{actionStatusLabel(action.status)}</Badge><p>{action.action_text}</p>{action.rationale ? <small>{action.rationale}</small> : null}</article>)}</div>}
        </div>}
      </Card>}

      {activeTab === "qa" && <>
        <Card id="qa-review-section">
        <SectionHeader title={t("call.qaReview")} description={t("call.aiQaBusinessHelp")} help={t("help.aiReview")} />
        {!review ? <EmptyState title={t("call.noQaReview")} description={t("call.noQaReviewHelp")} /> : <div className="grid">
          {transcriptInvalid ? <div className="message message-warning"><strong>{t("call.invalidTranscriptBusinessTitle")}</strong><br />{t("call.analysisBlockedBusinessHelp")}<br /><span className="technical-detail">{t("call.technicalDetail")}: {review.transcript_validity?.reason || call?.last_error_message || "analysis_blocked_invalid_transcript"}</span><div className="actions" style={{ marginTop: 8 }}><Button variant="secondary" onClick={transcribe}>{t("pilot.retranscribe")}</Button></div></div> : null}
          {isPlaceholderQa ? <div className="message message-warning"><Badge tone="warning">{t("pilot.placeholderDemo")}</Badge> {t("pilot.placeholderQaWarning")}</div> : null}
          {!transcriptInvalid ? <div className="review-hero">
            <div className="review-score"><small>{t("qa.aiScore")}</small><strong>{review.score}</strong><StatusBadge status={review.status} label={statusLabel(review.status)} /> {isPlaceholderQa ? <Badge tone="warning">{t("pilot.placeholderDemo")}</Badge> : null}</div>
            <div>
              <p className="message" style={{ marginTop: 0 }}><strong>{viewingLatest ? t("call.viewingLatest") : t("call.viewingPrevious")} #{review.id}</strong> · {new Date(review.created_at || "").toLocaleString()}{review.legacy_review ? ` · ${t("call.legacyReview")}` : ""}</p>
              {recoveredReview && <p className="message message-warning">{t("call.recoveredReviewWarning")}</p>}
              <p><strong>{t("call.summary")}:</strong> {review.summary}</p>
            </div>
          </div> : null}
          <div className="meta-grid">
            <div className="meta-item"><small>{t("call.analysisMode")}</small>{reviewMeta(review.analysis_mode, "analysis mode")}</div>
            <div className="meta-item"><small>{t("call.provider")}</small>{reviewMeta(review.provider_name, "provider")}</div>
            <div className="meta-item"><small>{t("call.model")}</small>{reviewMeta(review.model, "model")}</div>
            <div className="meta-item"><small>{t("call.scorecard")} <HelpTooltip text={t("help.scorecard")} /></small>{reviewMeta(review.scorecard_name, "scorecard")}</div>
            <div className="meta-item"><small>{t("call.reportLanguage")} <HelpTooltip text={t("help.reportLanguage")} /></small>{reviewMeta(review.report_language, "report language")}</div>
          </div>
          <div>
            <SectionHeader title={t("call.findings")} />
            {review.findings.length === 0 ? <EmptyState title={t("call.noFindings")} /> : <div className="grid" style={{ gap: 8 }}>{review.findings.map((finding, i) => <article key={finding.id || i} className="segment"><Badge tone={finding.severity === "critical" ? "danger" : finding.severity === "warning" ? "warning" : "info"}>{finding.severity}</Badge><p>{finding.evidence}</p></article>)}</div>}
          </div>
          <details>
            <summary><strong>{t("call.criteriaBreakdown")}</strong></summary>
            <div className="criteria-grid" style={{ marginTop: 12 }}>{review.criteria?.map((criterion, index) => <article key={criterion.id || index} className="segment">
              <div className="task-header"><strong>{criterion.title}</strong><span><Badge tone={criterion.severity === "critical" ? "danger" : criterion.severity === "warning" ? "warning" : "default"}>{criterion.severity || t("call.normal")}</Badge> <Badge>{criterion.score}/{criterion.max_points}</Badge></span></div>
              <details style={{ marginTop: 8 }}><summary>{t("call.evidenceAndComment")}</summary><p><strong>{t("call.comment")}:</strong> {criterion.comment || "-"}</p><p><strong>{t("call.evidence")}:</strong> {criterion.evidence || "-"}</p></details>
              {(criterion.human_score != null || criterion.human_comment || criterion.human_agrees != null) && <p className="message"><strong>{t("qa.humanReview")}:</strong> {criterion.human_agrees === true ? t("qa.agrees") : criterion.human_agrees === false ? t("qa.disagrees") : ""} {criterion.human_score != null ? ` · ${t("qa.humanScore")}: ${criterion.human_score}` : ""} {criterion.human_comment ? ` · ${criterion.human_comment}` : ""}</p>}
              {canHumanReview ? <details style={{ marginTop: 8 }}><summary>{t("qa.reviewCriterion")}</summary><div className="grid" style={{ gap: 8, marginTop: 8 }}><Field label={t("qa.agreement")}><select value={criterionReviews[String(criterion.id || index)]?.human_agrees || ""} onChange={(e) => setCriterionReviews((items) => ({ ...items, [String(criterion.id || index)]: { ...(items[String(criterion.id || index)] || { human_score: "", human_comment: "", human_agrees: "", human_severity: "" }), human_agrees: e.target.value } }))}><option value="">-</option><option value="true">{t("qa.agrees")}</option><option value="false">{t("qa.disagrees")}</option></select></Field><Field label={t("qa.humanScore")}><input type="number" step="0.01" value={criterionReviews[String(criterion.id || index)]?.human_score || ""} onChange={(e) => setCriterionReviews((items) => ({ ...items, [String(criterion.id || index)]: { ...(items[String(criterion.id || index)] || { human_score: "", human_comment: "", human_agrees: "", human_severity: "" }), human_score: e.target.value } }))} /></Field><Field label={t("qa.humanComment")}><textarea value={criterionReviews[String(criterion.id || index)]?.human_comment || ""} onChange={(e) => setCriterionReviews((items) => ({ ...items, [String(criterion.id || index)]: { ...(items[String(criterion.id || index)] || { human_score: "", human_comment: "", human_agrees: "", human_severity: "" }), human_comment: e.target.value } }))} /></Field></div></details> : null}
            </article>)}</div>
          </details>
        </div>}
      </Card>
      </>}

      {activeTab === "human" && <Card>
        <SectionHeader title={t("qa.humanReview")} description={t("call.humanHelp")} help={t("help.humanReview")} />
        {!review ? <EmptyState title={t("call.noQaReview")} /> : <div className="grid">
          {transcriptInvalid ? <div className="message message-warning"><strong>{t("call.invalidTranscriptBusinessTitle")}</strong><br />{t("call.analysisBlockedBusinessHelp")}<br />{review.transcript_validity?.reason || call?.last_error_message || ""}<div className="actions" style={{ marginTop: 8 }}><Button variant="secondary" onClick={transcribe}>{t("pilot.retranscribe")}</Button><Button variant="secondary" onClick={analyze} disabled={!segments.length}>{t("pilot.analyzeAfterTranscription")}</Button></div></div> : null}
          {isPlaceholderQa ? <div className="message message-warning"><Badge tone="warning">{t("pilot.placeholderDemo")}</Badge> {t("pilot.placeholderQaWarning")}</div> : null}
          <div className="meta-grid">
            <div className="meta-item"><small>{t("qa.reviewStatus")} <HelpTooltip text={t("help.reviewStatus")} /></small><StatusBadge status={review.review_status || "ai_generated"} label={statusLabel(review.review_status || "ai_generated")} /></div>
            <div className="meta-item"><small>{t("qa.aiScore")}</small>{review.score ?? "-"}</div>
            <div className="meta-item"><small>{t("qa.humanScore")}</small>{review.human_total_score ?? "-"}</div>
            <div className="meta-item"><small>{t("qa.aiHumanDelta")} <HelpTooltip text={t("help.aiHumanDelta")} /></small>{review.ai_human_score_delta ?? "-"}</div>
            <div className="meta-item"><small>{t("qa.humanReviewer")}</small>{review.human_reviewer_email || "-"}</div>
            <div className="meta-item"><small>{t("qa.calibrationSample")} <HelpTooltip text={t("help.calibrationCall")} /></small>{review.calibration_flag ? t("common.yes") : t("common.no")}</div>
          </div>
          {canHumanReview ? <div className="grid">
            <div className="grid-2"><Field label={t("qa.reviewStatus")} help={t("help.reviewStatus")}><select value={humanForm.review_status} onChange={(e) => setHumanForm((f) => ({ ...f, review_status: e.target.value }))}><option value="approved">{t("qa.approved")}</option><option value="disputed">{t("qa.disputed")}</option><option value="needs_rework">{t("qa.needsRework")}</option></select></Field><Field label={t("qa.humanScore")}><input type="number" step="0.01" value={humanForm.human_total_score} onChange={(e) => setHumanForm((f) => ({ ...f, human_total_score: e.target.value }))} /></Field></div>
            <Field label={t("qa.managerComment")}><textarea value={humanForm.human_summary} onChange={(e) => setHumanForm((f) => ({ ...f, human_summary: e.target.value }))} /></Field>
            <Field label={t("qa.coachingNotes")}><textarea value={humanForm.human_notes} onChange={(e) => setHumanForm((f) => ({ ...f, human_notes: e.target.value }))} /></Field>
            <label><input type="checkbox" style={{ width: "auto", marginRight: 8 }} checked={humanForm.calibration_flag} onChange={(e) => setHumanForm((f) => ({ ...f, calibration_flag: e.target.checked }))} />{t("qa.calibrationSample")} <HelpTooltip text={t("help.calibrationCall")} /></label>
            {humanForm.calibration_flag ? <Field label={t("qa.calibrationNotes")}><textarea value={humanForm.calibration_notes} onChange={(e) => setHumanForm((f) => ({ ...f, calibration_notes: e.target.value }))} /></Field> : null}
            <div><Button onClick={saveHumanReview} disabled={savingHumanReview}>{savingHumanReview ? t("call.saving") : t("qa.saveHumanReview")}</Button></div>
          </div> : <p className="message">{t("qa.viewOnlyHumanReview")}</p>}
        </div>}
      </Card>}


      {activeTab === "feedback" && <Card>
        <SectionHeader title={t("pilot.reviewFeedback")} description={t("call.managerFeedbackBusinessHelp")} />
        {!review ? <EmptyState title={t("call.noQaReview")} /> : <div className="grid">
          <p className="message message-warning">{t("pilot.feedbackSafetyHelp")}</p>
          <div className="actions"><Button variant="secondary" onClick={() => saveFeedback({ transcript_quality: "good" })}>{t("pilot.transcriptOk")}</Button><Button variant="secondary" onClick={() => saveFeedback({ transcript_quality: "poor", issue_tags: Array.from(new Set([...(feedbackForm.issue_tags || []), "stt_quality"])) })}>{t("pilot.transcriptProblem")}</Button><Button variant="secondary" onClick={() => saveFeedback({ qa_analysis_quality: "good" })}>{t("pilot.qaOk")}</Button><Button variant="secondary" onClick={() => saveFeedback({ qa_analysis_quality: "poor", issue_tags: Array.from(new Set([...(feedbackForm.issue_tags || []), "qa_logic"])) })}>{t("pilot.qaProblem")}</Button><Button variant="secondary" onClick={() => saveFeedback({ score_agreement: "agree" })}>{t("pilot.scoreOk")}</Button><Button variant="secondary" onClick={() => saveFeedback({ score_agreement: "disagree" })}>{t("pilot.scoreProblem")}</Button><Button variant="secondary" onClick={() => saveFeedback({ useful_for_coaching: true })}>{t("pilot.usefulForCoaching")}</Button><Button variant="secondary" onClick={() => saveFeedback({ useful_for_coaching: false })}>{t("pilot.notUseful")}</Button></div>
          <div className="grid-2">
            <Field label={t("pilot.transcriptQuality")} help={t("pilot.transcriptQualityHelp")}><select value={feedbackForm.transcript_quality || ""} onChange={(e) => setFeedbackForm((f) => ({...f, transcript_quality:e.target.value}))}><option value="">-</option><option value="excellent">{t("pilot.excellent")}</option><option value="good">{t("pilot.good")}</option><option value="average">{t("pilot.average")}</option><option value="poor">{t("pilot.poor")}</option><option value="not_evaluated">{t("pilot.notEvaluated")}</option></select></Field>
            <Field label={t("pilot.qaAnalysisQuality")} help={t("pilot.qaAnalysisQualityHelp")}><select value={feedbackForm.qa_analysis_quality || ""} onChange={(e) => setFeedbackForm((f) => ({...f, qa_analysis_quality:e.target.value}))}><option value="">-</option><option value="good">{t("pilot.good")}</option><option value="average">{t("pilot.average")}</option><option value="poor">{t("pilot.poor")}</option><option value="skip_bad_transcript">{t("pilot.skipBadTranscript")}</option></select></Field>
            <Field label={t("pilot.scoreAgreement")} help={t("pilot.scoreAgreementHelp")}><select value={feedbackForm.score_agreement || ""} onChange={(e) => setFeedbackForm((f) => ({...f, score_agreement:e.target.value}))}><option value="">-</option><option value="agree">{t("pilot.agree")}</option><option value="partially_agree">{t("pilot.partiallyAgree")}</option><option value="disagree">{t("pilot.disagree")}</option><option value="skip_bad_transcript">{t("pilot.qaNotEvaluatedBadTranscript")}</option></select></Field>
            <Field label={t("pilot.scorecardFit")} help={t("pilot.scorecardFitHelp")}><select value={feedbackForm.scorecard_fit || ""} onChange={(e) => setFeedbackForm((f) => ({...f, scorecard_fit:e.target.value}))}><option value="">-</option><option value="fits">{t("pilot.fits")}</option><option value="partially_fits">{t("pilot.partiallyFits")}</option><option value="does_not_fit">{t("pilot.doesNotFit")}</option><option value="unclear">{t("pilot.unclear")}</option></select></Field>
            <Field label={t("pilot.aiTopicCorrect")}><select value={feedbackForm.ai_topic_correct || ""} onChange={(e) => setFeedbackForm((f) => ({...f, ai_topic_correct:e.target.value}))}><option value="">-</option><option value="yes">{t("common.yes")}</option><option value="no">{t("common.no")}</option><option value="partially">{t("pilot.partiallyAgree")}</option><option value="not_evaluated">{t("pilot.notEvaluated")}</option></select></Field>
            <Field label={t("pilot.requiredActionsCorrect")}><select value={feedbackForm.required_actions_correct || ""} onChange={(e) => setFeedbackForm((f) => ({...f, required_actions_correct:e.target.value}))}><option value="">-</option><option value="yes">{t("common.yes")}</option><option value="no">{t("common.no")}</option><option value="partially">{t("pilot.partiallyAgree")}</option><option value="not_evaluated">{t("pilot.notEvaluated")}</option></select></Field>
          </div>
          <Field label={t("pilot.managerCorrectTopic")}><input value={feedbackForm.manager_correct_topic || ""} onChange={(e) => setFeedbackForm((f) => ({...f, manager_correct_topic:e.target.value}))} /></Field>
          <Field label={t("pilot.topicComment")}><textarea value={feedbackForm.topic_feedback_comment || ""} onChange={(e) => setFeedbackForm((f) => ({...f, topic_feedback_comment:e.target.value}))} /></Field>
          <label><input type="checkbox" style={{width:"auto", marginRight:8}} checked={Boolean(feedbackForm.ai_missed_something)} onChange={(e) => setFeedbackForm((f) => ({...f, ai_missed_something:e.target.checked}))} />{t("pilot.aiMissedSomething")}</label><Field label={t("pilot.missedComment")}><textarea value={feedbackForm.ai_missed_comment || ""} onChange={(e) => setFeedbackForm((f) => ({...f, ai_missed_comment:e.target.value}))} /></Field>
          <label><input type="checkbox" style={{width:"auto", marginRight:8}} checked={Boolean(feedbackForm.ai_false_positive)} onChange={(e) => setFeedbackForm((f) => ({...f, ai_false_positive:e.target.checked}))} />{t("pilot.aiFoundExtra")}</label><Field label={t("pilot.falsePositiveComment")}><textarea value={feedbackForm.ai_false_positive_comment || ""} onChange={(e) => setFeedbackForm((f) => ({...f, ai_false_positive_comment:e.target.value}))} /></Field>
          <Field label={t("pilot.missedRequiredActions")}><textarea value={feedbackForm.missed_required_actions_feedback || ""} onChange={(e) => setFeedbackForm((f) => ({...f, missed_required_actions_feedback:e.target.value}))} /></Field>
          <Field label={t("pilot.falseRequiredActions")}><textarea value={feedbackForm.false_required_actions_feedback || ""} onChange={(e) => setFeedbackForm((f) => ({...f, false_required_actions_feedback:e.target.value}))} /></Field>
          <Field label={t("pilot.issueTags")}><input value={(feedbackForm.issue_tags || []).join(",")} onChange={(e) => setFeedbackForm((f) => ({...f, issue_tags:e.target.value.split(",").map((x) => x.trim()).filter(Boolean)}))} /></Field>
          <Field label={t("pilot.overallFeedback")}><textarea value={feedbackForm.overall_feedback || ""} onChange={(e) => setFeedbackForm((f) => ({...f, overall_feedback:e.target.value}))} /></Field>
          <div className="actions"><Button onClick={() => saveFeedback()}>{t("pilot.saveFeedback")}</Button>{canHumanReview ? <><input placeholder={t("pilot.assignUserPlaceholder")} value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} /><Button variant="secondary" onClick={assignReview}>{t("assignReview")}</Button></> : null}</div>
          {review.assignment ? <p className="message">{t("pilot.assignedTo")} {review.assignment.assigned_to_email || review.assignment.id} ({review.assignment.status})</p> : null}
        </div>}
      </Card>}

      {activeTab === "coaching" && <Card>
        <SectionHeader title={t("qa.coachingActions")} description={t("call.coachingHelp")} help={t("help.coachingActions")} />
        {!review ? <EmptyState title={t("call.noQaReview")} /> : <div className="grid">
          {(review.coaching_actions || []).length === 0 ? <EmptyState title={t("qa.noCoachingActions")} description={t("qa.noCoachingActionsHelp")} /> : <div className="grid">{(review.coaching_actions || []).map((action) => <article key={action.id} className="segment task-card"><div className="task-header"><strong>{action.title}</strong><StatusBadge status={action.status} label={statusLabel(action.status)} /></div><small>{t("qa.dueDate")}: {action.due_date ? new Date(action.due_date).toLocaleDateString() : "-"} · {t("call.createdBy")}: {action.created_by_email || action.agent_name || "-"}</small>{action.description ? <p>{action.description}</p> : null}<div className="actions"><Button variant="secondary" className="button-small" onClick={() => updateCoachingStatus(action.id, "done")}>{t("qa.markDone")}</Button><Button variant="secondary" className="button-small" onClick={() => updateCoachingStatus(action.id, "dismissed")}>{t("qa.dismiss")}</Button><Button variant="secondary" className="button-small" onClick={() => updateCoachingStatus(action.id, "open")}>{t("qa.reopen")}</Button></div></article>)}</div>}
          {canHumanReview ? <div className="segment"><SectionHeader title={t("qa.addAction")} /><div className="grid"><Field label={t("qa.actionTitle")}><input value={coachingForm.title} onChange={(e) => setCoachingForm((f) => ({ ...f, title: e.target.value }))} /></Field><Field label={t("qa.description")}><textarea value={coachingForm.description} onChange={(e) => setCoachingForm((f) => ({ ...f, description: e.target.value }))} /></Field><Field label={t("qa.dueDate")}><input type="date" value={coachingForm.due_date} onChange={(e) => setCoachingForm((f) => ({ ...f, due_date: e.target.value }))} /></Field><div><Button onClick={addCoachingAction} disabled={savingCoaching || !coachingForm.title.trim()}>{savingCoaching ? t("call.saving") : t("qa.addAction")}</Button></div></div></div> : null}
        </div>}
      </Card>}

      {activeTab === "history" && <Card>
        <SectionHeader title={t("call.analysisHistory")} description={t("call.historyHelp")} actions={<><a className={`button button-secondary${history.length === 0 ? " disabled" : ""}`} aria-disabled={history.length === 0} href={history.length === 0 ? undefined : exportUrl("history","xlsx")}>{t("call.exportHistoryXlsx")}</a><a className={`button button-secondary${history.length === 0 ? " disabled" : ""}`} aria-disabled={history.length === 0} href={history.length === 0 ? undefined : exportUrl("history","csv")}>{t("call.exportHistoryCsv")}</a>{viewingReviewId && <><a className="button button-secondary" href={exportUrl("single","xlsx")}>{t("call.exportReviewXlsx")}</a><a className="button button-secondary" href={exportUrl("single","csv")}>{t("call.exportReviewCsv")}</a></>}</>} />
        {viewingReviewId && <small>{t("call.selectedReviewExport")} #{viewingReviewId}.</small>}
        {history.length === 0 ? <EmptyState title={t("call.noReviewsToExport")} /> : <div className="grid" style={{ gap: 8, marginTop: 12 }}>{history.map((item, idx) => { const isLatest = idx === 0; const isSelected = viewingReviewId === item.id; return <article key={item.id} className="segment" style={isSelected ? { borderColor: "#2563eb", boxShadow: "0 0 0 1px #2563eb" } : isLatest ? { borderColor: "#16a34a", boxShadow: "0 0 0 1px #16a34a" } : undefined}><div style={{display:"flex",justifyContent:"space-between", gap: 12, flexWrap: "wrap"}}><div><strong>{new Date(item.created_at || "").toLocaleString()}</strong> · {item.status} · {t("call.score")} {item.score ?? "-"}<div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>{isLatest ? <Badge>{t("call.latest")}</Badge> : null}{isSelected ? <Badge>{t("call.selected")}</Badge> : null}{item.legacy_review ? <Badge tone="warning">{t("call.legacy")}</Badge> : null}</div></div><Button variant="secondary" disabled={viewLoadingReviewId === item.id || isSelected} onClick={() => viewReview(item.id)}>{viewLoadingReviewId === item.id ? t("call.loading") : isSelected ? (isLatest ? t("call.viewingLatestShort") : t("call.viewingPreviousShort")) : (isLatest ? t("call.viewLatest") : t("call.viewPrevious"))}</Button></div></article>; })}</div>}
      </Card>}
    </div>
  );}
