import React, { createContext, useContext } from "react";

import useMyLocation from "../hooks/useMyLocation";

/**
 * One position, shared by everything that wants it.
 *
 * useMyLocation() starts its own permission request and its own
 * watchPositionAsync, so calling it from a component that appears many times —
 * a meeting card in a list, say — would start a GPS watcher per card. This runs
 * it exactly once, above the navigator, and hands the result out.
 *
 * null is the normal resting state, not an error: location may be declined,
 * switched off, or simply not fixed yet, and every reader has to cope with not
 * knowing where the phone is.
 */
const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const position = useMyLocation();
  return (
    <LocationContext.Provider value={position}>{children}</LocationContext.Provider>
  );
}

/** The device's { latitude, longitude }, or null while it is unknown. */
export function useLocation() {
  return useContext(LocationContext);
}
