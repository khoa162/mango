/**
 * Policy Benefits Calculator
 *
 * Adjudicates medical expenses against a policy definition.
 * Expenses are always processed in chronological order so earlier
 * claims consume limits that affect later ones.
 *
 * Decision pipeline (per expense):
 *  1. Unknown benefit type          → DENIED
 *  2. Waiting period not satisfied  → DENIED
 *  3. Exclusion matched             → DENIED
 *  4. Max visits exhausted          → DENIED
 *  5. Annual / benefit limit = 0    → DENIED
 *  6. Cap by per-visit limit
 *  7. Cap by remaining annual + benefit sub-limits  (eligible amount)
 *  8. Apply remaining annual deductible
 *  9. Apply copay (percentage or fixed)
 * 10. Emit COVERED / PARTIALLY_COVERED with human-readable reason
 */

"use strict";

const DECISIONS = {
  COVERED: "COVERED",
  PARTIALLY_COVERED: "PARTIALLY_COVERED",
  DENIED: "DENIED",
};

/**
 * @param {string} dateStr YYYY-MM-DD
 * @returns {Date}
 */
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Inclusive day difference: expenseDate - effectiveDate in whole days.
 * @param {string} effectiveDate
 * @param {string} expenseDate
 * @returns {number}
 */
function daysBetween(effectiveDate, expenseDate) {
  const ms =
    parseDate(expenseDate).getTime() - parseDate(effectiveDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * @param {object} benefit
 * @param {object} expense
 * @returns {string|null} matched exclusion text, or null
 */
function findExclusion(benefit, expense) {
  const exclusions = benefit.exclusions || [];
  const haystack = `${expense.diagnosis || ""} ${expense.sub_benefit || ""}`.toLowerCase();
  for (const exclusion of exclusions) {
    if (haystack.includes(String(exclusion).toLowerCase())) {
      return exclusion;
    }
  }
  return null;
}

/**
 * @param {{type: string, value: number}} copay
 * @param {number} amountAfterDeductible
 * @returns {number}
 */
function computeCopay(copay, amountAfterDeductible) {
  if (!copay || amountAfterDeductible <= 0) return 0;
  if (copay.type === "percentage") {
    return roundMoney((amountAfterDeductible * copay.value) / 100);
  }
  if (copay.type === "fixed") {
    return roundMoney(Math.min(copay.value, amountAfterDeductible));
  }
  throw new Error(`Unsupported copay type: ${copay.type}`);
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function cloneState(policy) {
  const benefitState = {};
  for (const [type, benefit] of Object.entries(policy.benefits || {})) {
    benefitState[type] = {
      remaining_sub_limit: benefit.annual_sub_limit,
      remaining_visits: benefit.max_visits,
      used: 0,
      visits_used: 0,
    };
  }
  return {
    remaining_annual_limit: policy.annual_limit,
    remaining_deductible: (policy.deductible && policy.deductible.annual) || 0,
    benefits: benefitState,
  };
}

/**
 * Build a denied result without mutating limits (except visit count if needed).
 */
function deniedResult(expense, reason, state, benefitType) {
  const benefitRemaining = benefitType && state.benefits[benefitType]
    ? state.benefits[benefitType]
    : null;

  return {
    expense_id: expense.expense_id,
    submitted_amount: expense.amount,
    covered_amount: 0,
    copay_amount: 0,
    member_pays: expense.amount,
    decision: DECISIONS.DENIED,
    reason,
    remaining_annual_limit: state.remaining_annual_limit,
    remaining_visit_limit: benefitRemaining
      ? benefitRemaining.remaining_visits
      : null,
    remaining_benefit_limit: benefitRemaining
      ? benefitRemaining.remaining_sub_limit
      : null,
  };
}

/**
 * Adjudicate a single expense against current mutable state.
 * @param {object} policy
 * @param {object} expense
 * @param {object} state
 * @returns {object} result
 */
function adjudicateExpense(policy, expense, state) {
  const benefitType = expense.benefit_type;
  const benefit = policy.benefits[benefitType];

  if (!benefit) {
    return deniedResult(
      expense,
      `Denied: unknown benefit type "${benefitType}".`,
      state,
      null
    );
  }

  const elapsedDays = daysBetween(policy.effective_date, expense.date);
  if (elapsedDays < benefit.waiting_period_days) {
    return deniedResult(
      expense,
      `Denied: waiting period of ${benefit.waiting_period_days} days for ${benefitType} not satisfied. ` +
        `Policy effective ${policy.effective_date}; expense date ${expense.date} ` +
        `(${elapsedDays} day${elapsedDays === 1 ? "" : "s"} elapsed).`,
      state,
      benefitType
    );
  }

  const matchedExclusion = findExclusion(benefit, expense);
  if (matchedExclusion) {
    return deniedResult(
      expense,
      `Denied: exclusion matched — "${matchedExclusion}" is not covered under ${benefitType}.`,
      state,
      benefitType
    );
  }

  const bState = state.benefits[benefitType];

  if (bState.remaining_visits <= 0) {
    return deniedResult(
      expense,
      `Denied: maximum visits (${benefit.max_visits}) for ${benefitType} have been exhausted.`,
      state,
      benefitType
    );
  }

  if (state.remaining_annual_limit <= 0) {
    return deniedResult(
      expense,
      `Denied: annual policy limit of ${policy.annual_limit} ${policy.currency} has been exhausted.`,
      state,
      benefitType
    );
  }

  if (bState.remaining_sub_limit <= 0) {
    return deniedResult(
      expense,
      `Denied: annual sub-limit of ${benefit.annual_sub_limit} ${policy.currency} for ${benefitType} has been exhausted.`,
      state,
      benefitType
    );
  }

  // --- Amount determination ---
  const submitted = expense.amount;
  const perVisitCap = Math.min(submitted, benefit.per_visit_limit);
  const eligible = roundMoney(
    Math.min(
      perVisitCap,
      state.remaining_annual_limit,
      bState.remaining_sub_limit
    )
  );

  const reasons = [];

  if (perVisitCap < submitted) {
    reasons.push(
      `Per-visit limit of ${benefit.per_visit_limit} ${policy.currency} applied ` +
        `(submitted ${submitted} ${policy.currency}).`
    );
  }

  if (
    eligible < perVisitCap &&
    eligible === state.remaining_annual_limit &&
    state.remaining_annual_limit <= bState.remaining_sub_limit
  ) {
    reasons.push(
      `Reduced to remaining annual limit of ${eligible} ${policy.currency}.`
    );
  } else if (eligible < perVisitCap) {
    reasons.push(
      `Reduced to remaining ${benefitType} sub-limit of ${eligible} ${policy.currency}.`
    );
  }

  // Deductible
  let deductibleApplied = 0;
  let afterDeductible = eligible;
  if (state.remaining_deductible > 0 && eligible > 0) {
    deductibleApplied = roundMoney(
      Math.min(state.remaining_deductible, eligible)
    );
    afterDeductible = roundMoney(eligible - deductibleApplied);
    state.remaining_deductible = roundMoney(
      state.remaining_deductible - deductibleApplied
    );
    reasons.push(
      `Annual deductible applied: ${deductibleApplied} ${policy.currency}.`
    );
  }

  // Copay
  const copayAmount = computeCopay(benefit.copay, afterDeductible);
  const coveredAmount = roundMoney(afterDeductible - copayAmount);

  if (copayAmount > 0) {
    if (benefit.copay.type === "percentage") {
      reasons.push(
        `${benefit.copay.value}% copay applied: ${copayAmount} ${policy.currency}.`
      );
    } else {
      reasons.push(
        `Fixed copay of ${benefit.copay.value} ${policy.currency} applied: ${copayAmount} ${policy.currency}.`
      );
    }
  } else {
    reasons.push("No copay applied.");
  }

  // Consume limits by the eligible (allowed) amount — copay is the member's
  // share of that eligible amount, so the full eligible figure counts against
  // annual / sub-limits. This matches common "benefit maximum" behavior and
  // makes limit-exhaustion deterministic for later claims.
  state.remaining_annual_limit = roundMoney(
    state.remaining_annual_limit - eligible
  );
  bState.remaining_sub_limit = roundMoney(
    bState.remaining_sub_limit - eligible
  );
  bState.used = roundMoney(bState.used + eligible);
  bState.visits_used += 1;
  bState.remaining_visits -= 1;

  const memberPays = roundMoney(submitted - coveredAmount);
  let decision;
  if (coveredAmount <= 0) {
    decision = DECISIONS.DENIED;
    reasons.unshift(
      `Denied: after deductible/limits nothing remained for the insurer to pay.`
    );
  } else if (coveredAmount < submitted) {
    decision = DECISIONS.PARTIALLY_COVERED;
  } else {
    decision = DECISIONS.COVERED;
  }

  reasons.push(
    `Covered: ${coveredAmount} ${policy.currency}. Member pays: ${memberPays} ${policy.currency}.`
  );

  return {
    expense_id: expense.expense_id,
    submitted_amount: submitted,
    covered_amount: coveredAmount,
    copay_amount: copayAmount,
    member_pays: memberPays,
    decision,
    reason: reasons.join(" "),
    remaining_annual_limit: state.remaining_annual_limit,
    remaining_visit_limit: bState.remaining_visits,
    remaining_benefit_limit: bState.remaining_sub_limit,
  };
}

/**
 * Calculate coverage for a list of medical expenses against a policy.
 *
 * @param {object} policy Policy definition JSON
 * @param {object[]} expenses List of expense objects
 * @returns {{ results: object[], summary: object }}
 */
function calculateBenefits(policy, expenses) {
  if (!policy || typeof policy !== "object") {
    throw new Error("policy must be a non-null object");
  }
  if (!Array.isArray(expenses)) {
    throw new Error("expenses must be an array");
  }

  const state = cloneState(policy);

  const sorted = expenses
    .map((e, index) => ({ e, index }))
    .sort((a, b) => {
      const byDate =
        parseDate(a.e.date).getTime() - parseDate(b.e.date).getTime();
      return byDate !== 0 ? byDate : a.index - b.index;
    })
    .map(({ e }) => e);

  const results = sorted.map((expense) =>
    adjudicateExpense(policy, expense, state)
  );

  const summary = {
    currency: policy.currency,
    remaining_annual_limit: state.remaining_annual_limit,
    remaining_deductible: state.remaining_deductible,
    total_submitted: roundMoney(
      results.reduce((s, r) => s + r.submitted_amount, 0)
    ),
    total_covered: roundMoney(
      results.reduce((s, r) => s + r.covered_amount, 0)
    ),
    total_member_pays: roundMoney(
      results.reduce((s, r) => s + r.member_pays, 0)
    ),
    decisions: {
      COVERED: results.filter((r) => r.decision === DECISIONS.COVERED).length,
      PARTIALLY_COVERED: results.filter(
        (r) => r.decision === DECISIONS.PARTIALLY_COVERED
      ).length,
      DENIED: results.filter((r) => r.decision === DECISIONS.DENIED).length,
    },
    remaining_by_benefit: {},
  };

  for (const [type, bState] of Object.entries(state.benefits)) {
    summary.remaining_by_benefit[type] = {
      remaining_sub_limit: bState.remaining_sub_limit,
      remaining_visits: bState.remaining_visits,
      amount_used: bState.used,
      visits_used: bState.visits_used,
    };
  }

  return { results, summary };
}

module.exports = {
  calculateBenefits,
  DECISIONS,
  // exported for unit tests
  daysBetween,
  findExclusion,
  computeCopay,
};
