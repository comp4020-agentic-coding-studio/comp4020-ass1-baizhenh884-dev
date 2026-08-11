export interface NetworkStateInput {
  shortcutBuilt: boolean;
  totalDrivers: number;
}

export interface RouteAllocation {
  viaNode1Only: number;
  viaNode2Only: number;
  viaShortcut: number;
}

export interface NetworkState {
  allocation: RouteAllocation;
  equilibriumTravelTimeMinutes: number;
  unilateralAlternativeTimeMinutes: number | null;
}

export function calculateNetworkState({
  shortcutBuilt,
  totalDrivers,
}: NetworkStateInput): NetworkState {
  if (!shortcutBuilt) {
    const flowPerRoute = totalDrivers / 2;
    return {
      allocation: {
        viaNode1Only: flowPerRoute,
        viaNode2Only: flowPerRoute,
        viaShortcut: 0,
      },
      equilibriumTravelTimeMinutes: flowPerRoute / 100 + 45,
      unilateralAlternativeTimeMinutes: null,
    };
  }

  return {
    allocation: {
      viaNode1Only: 0,
      viaNode2Only: 0,
      viaShortcut: totalDrivers,
    },
    equilibriumTravelTimeMinutes: totalDrivers / 100 + 0 + totalDrivers / 100,
    unilateralAlternativeTimeMinutes: totalDrivers / 100 + 45,
  };
}
