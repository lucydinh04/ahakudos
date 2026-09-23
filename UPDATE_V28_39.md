# UPDATE V28.39 — Home state logic

- sentCount = 0: show First KUDOS 3-step guide; no congratulations card.
- sentCount > 0: show congratulations card in right rail and replace onboarding block with CỘNG ĐỒNG KUDOS.
- Community homepage block prioritizes Admin-approved public KUDOS.
- If no approved public KUDOS exist, it falls back to the current user's sent KUDOS that are still pending Admin approval.
- The small community callout remains only in the first-KUDOS state to avoid duplication after first send.
