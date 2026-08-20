// Whether this sign-in has already answered "which portal?".
//
// sessionStorage, not localStorage, and deliberately: the requirement is that
// signing in ASKS. Remembering the answer across sessions would turn the
// question into a one-time setup step, and someone who signs in tomorrow to do
// their coordinator work would be dropped back into the teacher portal because
// of a choice they made last week.
//
// Within a session it must NOT keep asking — switching to the coordinator
// portal and then navigating to "/" would otherwise re-open the chooser, which
// reads as the switch having failed.

const KEY = "ark.portal.chosen";

export const isPortalChosen = (): boolean => {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    // Private mode / storage disabled. Treat as chosen rather than unchosen:
    // an unreadable store must not strand someone on a chooser that cannot
    // remember their answer, re-asking on every navigation.
    return true;
  }
};

export const markPortalChosen = (): void => {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* nothing to do — see above */
  }
};

/** Cleared on sign-out, so the next sign-in in this same tab asks again. */
export const clearPortalChoice = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
};
