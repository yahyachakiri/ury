import { useEffect, useState } from 'react';
import { call } from '@ury/core';

// Patch 85 (ticket 124): the restaurant's plan as the till needs it. On the "Comptoir" plan (the till and the
// daily closing only, erp_restaurant plans.py) the till offers takeaway only, has no Tables page, asks no
// extras, sizes or choices, and its paid order lists hold today and yesterday (filtered on the server).
// Read once per page load; a failed call counts as "not Comptoir", so the till never loses a feature
// because of a network error (the server still refuses what the plan does not have).
// Patch 86: the same call also says whether the plan has loyalty (the phone screen's scan button). An older
// erp_restaurant without the key, or a failed call, counts as "has loyalty": the button stays as before.
let pending: Promise<boolean> | null = null;
// The answer once known, so a component mounted later starts from it (no frame with the wrong value).
let resolved: boolean | undefined;
let resolvedLoyalty: boolean | undefined;

export function fetchTillOnly(): Promise<boolean> {
  if (!pending) {
    pending = call
      .get<{ message: { till_only?: boolean; loyalty?: boolean } }>('erp_restaurant.erp_restaurant.plans.till_flags')
      .then((r) => {
        resolved = Boolean(r.message?.till_only);
        resolvedLoyalty = r.message?.loyalty !== false;
        return resolved;
      })
      .catch(() => {
        pending = null;
        return false;
      });
  }
  return pending;
}

/** Patch 86: whether the plan has loyalty, or undefined while the first call runs (true after a failed call). */
export function useLoyaltyPlanState(): boolean | undefined {
  const [loyalty, setLoyalty] = useState<boolean | undefined>(() => resolvedLoyalty);
  useEffect(() => {
    let alive = true;
    fetchTillOnly().then(() => {
      if (alive) setLoyalty(resolvedLoyalty ?? true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return loyalty;
}

/** The flag, false until known (a site that is not Comptoir never changes). */
export function useTillOnly(): boolean {
  return useTillOnlyState() ?? false;
}

/** The flag, or undefined while the first call runs. */
export function useTillOnlyState(): boolean | undefined {
  const [tillOnly, setTillOnly] = useState<boolean | undefined>(() => resolved);
  useEffect(() => {
    let alive = true;
    fetchTillOnly().then((value) => {
      if (alive) setTillOnly(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return tillOnly;
}
