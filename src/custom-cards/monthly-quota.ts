import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Custom cards a plan may create per calendar month.
 *
 * Reason: mirrors enforce_monthly_custom_card_limit in inoh-backend, which is
 * the authoritative gate — these numbers exist only so a tool can tell the user
 * where they stand before they hit it. Keep the two in sync.
 */
export const CUSTOM_CARD_MONTHLY_LIMITS = {
  free: 50,
  plus: 300,
  pro: 1000,
} as const;

export type SubscriptionPlan = keyof typeof CUSTOM_CARD_MONTHLY_LIMITS;

export interface CustomCardQuota {
  plan: SubscriptionPlan;
  used: number;
  limit: number;
  remaining: number;
}

const ENTITLED_STATUSES = ['active', 'trialing'];

/**
 * Start of the current UTC calendar month, matching the window the database
 * trigger counts over.
 */
const _startOfCurrentMonth = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

/**
 * Mirror of get_entitled_plan: a paid plan counts only while the subscription
 * is active or trialing, and anything else falls closed to free.
 */
const _readEntitledPlan = async (supabase: SupabaseClient): Promise<SubscriptionPlan> => {
  const { data, error } = await supabase.from('subscriptions').select('plan, status').maybeSingle();

  if (error || data === null) {
    // Reason: RLS scopes this to the caller's own row, so the only realistic
    // failures are "no subscription yet" and a transient error. Both mean we
    // should quote the free allowance rather than refuse to answer.
    return 'free';
  }

  const isEntitled =
    ENTITLED_STATUSES.includes(data.status as string) &&
    (data.plan === 'plus' || data.plan === 'pro');

  return isEntitled ? (data.plan as SubscriptionPlan) : 'free';
};

/**
 * How few cards left before the allowance is worth raising unprompted.
 *
 * Reason: at 3 of 300 the tally is noise — it carries no information and no
 * decision hangs on it. Near the end it is a genuine heads-up, because the next
 * card may be refused.
 */
const LOW_ALLOWANCE_THRESHOLD = 5;

/**
 * A sentence about the allowance, or null when it is not worth saying.
 *
 * Reason: a tool result is the prompt for whatever the AI client says next, so
 * anything returned here gets repeated to the user, and once "6 of 300" is in
 * the transcript the client keeps repeating it in later turns. So no tool
 * quotes the tally unprompted — every caller that touches the allowance goes
 * through here, and it stays quiet until the next card may actually be refused.
 *
 * @param quota - The caller's current allowance
 * @returns A line to append to a success message, or null to say nothing
 */
export const describeLowAllowance = (quota: CustomCardQuota): string | null =>
  quota.remaining > LOW_ALLOWANCE_THRESHOLD
    ? null
    : `Worth mentioning: only ${quota.remaining} custom card${quota.remaining === 1 ? '' : 's'} ` +
      `left this month on the ${quota.plan} plan. The quota resets on the 1st.`;

/**
 * How many custom cards the signed-in user has left this month.
 *
 * @param supabase - Client acting as the signed-in user
 * @returns Their plan, what they have used, and what is left
 */
export const fetchCustomCardQuota = async (supabase: SupabaseClient): Promise<CustomCardQuota> => {
  const plan = await _readEntitledPlan(supabase);

  // Reason: counts the same rows the trigger counts — custom requests made this
  // month that did not end up failed or rejected, since those free their slot.
  const { count } = await supabase
    .from('card_requests')
    .select('id', { count: 'exact', head: true })
    .eq('destination', 'custom')
    .not('status', 'in', '("failed","rejected")')
    .gte('created_at', _startOfCurrentMonth());

  const used = count ?? 0;
  const limit = CUSTOM_CARD_MONTHLY_LIMITS[plan];

  return { plan, used, limit, remaining: Math.max(limit - used, 0) };
};
