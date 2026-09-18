/**
 * Things that are built but not switched on.
 *
 * A flag rather than commented-out blocks: a comment rots the moment anything
 * around it is edited, and there is no way to check that commented code still
 * compiles. These stay in the type system, keep being refactored with
 * everything else, and come back by changing `false` to `true` in one place.
 */

/**
 * Online meetings — a meeting with a video link instead of a place.
 *
 * Off for the first release, in both apps. It is the half of the product that
 * needs the least explaining and gives the least back: an app whose whole shape
 * is "what is happening near me" is not where anyone looks for a video call,
 * and a first version that does one thing is easier to describe on a store
 * listing than one that does two.
 *
 * **This hides the ways to make one and to search for one. It does not hide
 * one that already exists.** Every screen that draws a meeting still knows what
 * to do with `type: "OnlineMeeting"` — MeetingCard, MeetingDetail, Activity,
 * the reminder text — because there may be some in the database already, and a
 * meeting somebody is going to must not turn into a blank card because a flag
 * moved. The server still accepts an online meeting too; if these need to be
 * gone rather than unreachable, that is a change in mobile/backend, not here.
 */
export const ONLINE_MEETINGS = false;
