// Total Cost of Ownership math — the heart of the comparison.
// The headline number is "what does this plan ACTUALLY cost over a lease term",
// not the advertised monthly price.

/**
 * Total cost of a plan over `months`.
 *
 * Logic:
 *  - If the plan has an intro/promo rate, you pay the intro price for the intro
 *    period, then the post-intro (real) price for the remaining months.
 *  - Recurring monthly add-on fees (e.g. modem rental) apply every month.
 *  - One-time fees (activation/install) are added once.
 *
 * @param {object} plan  normalized plan (see normalize.mjs)
 * @param {number} months  horizon, e.g. 12 or 36
 * @returns {number|null}  total dollars, or null if we don't even have a price
 */
export function planTco(plan, months) {
  const base = plan.monthlyPrice;
  if (base == null) return null;

  const monthlyFee = plan.monthlyFee ?? 0;
  const oneTime = plan.oneTimeFee ?? 0;

  let serviceCost;
  if (plan.isIntroductory && plan.introMonths && plan.postIntroPrice != null) {
    const introMonths = Math.min(plan.introMonths, months);
    const afterMonths = Math.max(0, months - plan.introMonths);
    serviceCost = base * introMonths + plan.postIntroPrice * afterMonths;
  } else {
    serviceCost = base * months;
  }

  return round2(serviceCost + monthlyFee * months + oneTime);
}

/**
 * Total cost of a user-supplied ALTERNATIVE offer (e.g. a bulk/group rate).
 * Kept simple per the brief: a flat monthly price, optional term, no fees by default.
 *
 * @param {object} offer  { monthlyPrice, monthlyFee?, oneTimeFee? }
 * @param {number} months
 */
export function offerTco(offer, months) {
  if (offer?.monthlyPrice == null) return null;
  const monthlyFee = offer.monthlyFee ?? 0;
  const oneTime = offer.oneTimeFee ?? 0;
  return round2(offer.monthlyPrice * months + monthlyFee * months + oneTime);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
