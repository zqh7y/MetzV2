/**
 * What a meeting costs, and the one value that is not the organiser's words.
 *
 * The field is free text, because "₪20", "£5 at the door" and "bring cash for
 * pizza" are all things organisers say and a number plus a currency dropdown
 * understands none of them any better while asking two questions instead of
 * one. Whatever is typed is shown untouched.
 *
 * "Free" is the exception. Storing the word would store whichever language the
 * organiser happened to be using, and every other reader would get it in that
 * one — an English speaker opening a Hebrew organiser's link would be told
 * "חינם". So free is stored as a marker and turned back into the reader's own
 * language here, which is also why this lives in one place rather than being
 * re-checked at each screen that draws a price.
 */
export const FREE = "free";

/** "" when nothing was said, the reader's word for free, or the organiser's. */
export function costLabel(t, cost) {
  const raw = (cost || "").trim();
  if (!raw) return "";
  return raw === FREE ? t("create.costFree") : raw;
}
