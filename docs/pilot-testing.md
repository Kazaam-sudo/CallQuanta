# Pilot testing workflow

## Who should test
Use 3 contact center managers or supervisors who already understand the campaigns and agent behaviors being measured.

## Suggested sample size
- 5–10 calls per manager
- At least 2 campaigns
- At least 2 operators/agents
- A mix of strong, average, and low-score calls

## What to check
1. Upload real calls and confirm metadata: agent, team, campaign, language, and direction.
2. Check transcript quality, including language detection and speaker separation.
3. Run QA analysis and review score, evidence, findings, and criteria.
4. Add a human review and compare AI score vs human score.
5. Submit manager feedback for transcript quality, QA logic, score agreement, scorecard fit, missed issues, false positives, and coaching usefulness.
6. Add coaching actions only when there is a specific behavior to improve.
7. Review Pilot Feedback metrics and export QA feedback.

## Feedback questions
- Is the transcript good enough for QA scoring?
- Does the AI evidence support the QA score?
- Did AI miss something important?
- Did AI flag something incorrectly?
- Is the scorecard appropriate for this call type?
- Would the review help a coach or supervisor give useful feedback?
- Was the UI clear enough for daily manager use?

## How to interpret results
- High transcript-problem volume means STT settings, language handling, or speaker separation should be tuned before wider rollout.
- High QA-logic issue volume means prompts, scorecard criteria, or evidence rules need adjustment.
- Large AI-human deltas show where calibration and scorecard definitions need work.
- Low coaching usefulness means the review may be accurate but not operationally helpful yet.

## Recommended pilot format
Run a structured pilot with 3 managers, 5–10 calls each, at least 2 campaigns, and at least 2 operators. Compare AI score vs human score, collect STT/QA/UI feedback, export the feedback file, then summarize the top fixes before production rollout.
