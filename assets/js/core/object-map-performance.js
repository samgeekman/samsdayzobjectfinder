export const createObjectMapPerformance = () => {
  const profile = {
    gatherRowChunkSize: 24,
    renderMarkerChunkSize: 220,
    interactionRefreshDelayMs: 100,
    v2Hints: {
      p3dBoundingBoxDelayMs: 380,
      p3dBoundingBoxFadeMs: 210,
      p3dDotToBoxTransitionMs: 210,
      footprintFadeMs: 300
    }
  };

  const stats = {
    lastGatherMs: 0,
    lastRenderMs: 0,
    lastPlacementCount: 0
  };

  return {
    profile,
    stats,
    markGather(ms) {
      stats.lastGatherMs = Number(ms) || 0;
    },
    markRender(ms, placements) {
      stats.lastRenderMs = Number(ms) || 0;
      stats.lastPlacementCount = Number(placements) || 0;
    }
  };
};
