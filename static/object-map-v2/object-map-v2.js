    const normalizeWorldKey = (value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return normalized === "livonia" || normalized === "sakhal" ? normalized : "chernarus";
    };
    const worldKey = normalizeWorldKey(new URLSearchParams(window.location.search).get("world"));
    const worldConfigs = {
      chernarus: {
        key: "chernarus",
        label: "Chernarus",
        exportStem: "chernarus",
        dataRoot: "../data/object-map-v2"
      },
      livonia: {
        key: "livonia",
        label: "Livonia",
        exportStem: "livonia",
        dataRoot: "../data/object-map-v2/worlds/livonia"
      },
      sakhal: {
        key: "sakhal",
        label: "Sakhal",
        exportStem: "sakhal",
        dataRoot: "../data/object-map-v2/worlds/sakhal"
      }
    };
    const activeWorld = worldConfigs[worldKey] || worldConfigs.chernarus;
    const dataRoot = activeWorld.dataRoot.replace(/\/+$/, "");
    const tileManifestUrl = `${dataRoot}/tile-pyramid/manifest.json`;
    const rawTileManifestUrl = null;
    const tileManifestBaseUrl = new URL(tileManifestUrl, window.location.href);
    tileManifestBaseUrl.pathname = tileManifestBaseUrl.pathname.replace(/[^/]+$/, "");
    const rawTileManifestBaseUrl = null;
    const objectManifestUrl = `${dataRoot}/object_pack/manifest.json`;
    const landManifestUrl = `${dataRoot}/land_only_pack/manifest.json`;
    const objectManifestBaseUrl = new URL(objectManifestUrl, window.location.href);
    objectManifestBaseUrl.pathname = objectManifestBaseUrl.pathname.replace(/[^/]+$/, "");
    const landManifestBaseUrl = new URL(landManifestUrl, window.location.href);
    landManifestBaseUrl.pathname = landManifestBaseUrl.pathname.replace(/[^/]+$/, "");
    const locationsUrl = `${dataRoot}/locations.json`;

    function fallbackFootprintStyle(fillAlpha, strokeAlpha) {
      if (worldKey === "sakhal") {
        return {
          fill: `rgba(190,36,36,${Math.max(0.20, fillAlpha * 0.72).toFixed(3)})`,
          stroke: `rgba(214,48,48,${Math.max(0.58, strokeAlpha).toFixed(3)})`,
        };
      }
      return {
        fill: `rgba(210,194,158,${Math.max(0.18, fillAlpha * 0.78).toFixed(3)})`,
        stroke: `rgba(56,64,72,${Math.max(0.52, strokeAlpha).toFixed(3)})`,
      };
    }

    const P = {
      id: 0,
      modelId: 1,
      x: 2,
      y: 3,
      z: 4,
      yaw: 5,
      pitch: 6,
      roll: 7,
      sourceKind: 8,
    };

    const M = {
      id: 0,
      type: 1,
      model: 2,
      shapePath: 3,
      sourceKind: 4,
      bboxMinX: 5,
      bboxMinZ: 6,
      bboxMaxX: 7,
      bboxMaxZ: 8,
      bboxWidth: 9,
      bboxDepth: 10,
      bboxSource: 11,
      image: 12,
      label: 13,
      count: 14,
      footprint: 15,
      footprintSource: 16,
      roofImage: 17,
      roofBounds: 18,
      roofColor: 19,
    };

    const viewer = document.getElementById("viewer");
    const tileCanvas = document.getElementById("tile-layer");
    const overlayCanvas = document.getElementById("overlay-layer");
    const selectionCanvas = document.getElementById("selection-layer");
    const tileCtx = tileCanvas.getContext("2d");
    const overlayCtx = overlayCanvas.getContext("2d");
    const selectionCtx = selectionCanvas.getContext("2d");
    const viewerLoadingEl = document.getElementById("viewer-loading");
    const arcadeHudEl = document.getElementById("arcade-hud");
    const arcadeKillsEl = document.getElementById("arcade-kills");
    const arcadeTargetEl = document.getElementById("arcade-target");
    const planeLaunchBtnEl = document.getElementById("plane-launch-btn");

    const tileCountEl = document.getElementById("tile-count");
    const packCountEl = document.getElementById("pack-count");
    const modelCountEl = document.getElementById("model-count");
    const loadedCountEl = document.getElementById("loaded-count");
    const hoverReadout = document.getElementById("hover-readout");
    const areaReadout = document.getElementById("area-readout");
    const chunkEstimateEl = document.getElementById("chunk-estimate");
    const statusReadout = document.getElementById("status-readout");
    const exportBtn = document.getElementById("export-btn");
    const loadAreaBtn = document.getElementById("load-area-btn");
    const clearAreaBtn = document.getElementById("clear-area-btn");
    const areaMode = document.getElementById("area-mode");
    const showTiles = document.getElementById("show-tiles");
    const showCenters = document.getElementById("show-centers");
    const showFootprints = document.getElementById("show-footprints");
    const showLabels = document.getElementById("show-labels");
    const areaModeBtn = document.getElementById("area-mode-btn");
    const copyAreaBtn = document.getElementById("copy-area-btn");
    const downloadAreaBtn = document.getElementById("download-area-btn");
    const exportLocationsBtn = document.getElementById("export-locations-btn");
    const mapTopbarEl = document.querySelector(".map-topbar");
    const hoverCardEl = document.getElementById("hover-card");
    const hoverNameEl = document.getElementById("hover-name");
    const hoverMetaEl = document.getElementById("hover-meta");
    const hoverThumbEl = document.getElementById("hover-thumb");
    const hoverThumbImgEl = document.getElementById("hover-thumb-img");
    const hoverThumbActionsEl = document.getElementById("hover-thumb-actions");
    const hoverThumbLinkEl = document.getElementById("hover-thumb-link");
    const hoverThumbPinEl = document.getElementById("hover-thumb-pin");
    const hoverThumbNameEl = document.getElementById("hover-thumb-name");
    const hoverThumbEditorEl = document.getElementById("hover-thumb-editor");
    const resetViewBtn = document.getElementById("reset-view-btn");
    const toggleLabelsBtn = document.getElementById("toggle-labels-btn");

    areaMode.checked = false;

    let bounds = null;
    let satPyramid = null;
    let rawTileManifest = null;
    let locations = [];
    let objectManifest = null;
    let landManifest = null;
    let models = [];
    let landModels = [];
    let scale = 0.06;
    let offsetX = 0;
    let offsetY = 0;
    let panStart = null;
    let areaStart = null;
    let areaRect = null;
    let areaWorld = null;
    let hoverPlacement = null;
    let pinnedPlacement = null;
    let searchRows = [];
    let searchQuery = "";
    let searchPathFilter = "";
    let searchMode = "";
    let searchModelIds = new Set();
    let searchLandModelIds = new Set();
    let loadedPlacements = [];
    let loadedPlacementGrid = new Map();
    let startupLandPlacements = [];
    let startupLandGrid = new Map();
    let renderQueued = false;
    let isAreaMode = false;
    let pointerDownPoint = null;
    let pointerDownOnUi = false;
    let isAreaLoading = false;
    let hoverCheckTimer = 0;
    let pendingHoverPoint = null;
    let controlledShip = null;
    let controlledPlane = null;
    let planeRockets = [];
    let planeKills = 0;
    let arcadeTargetIndex = 0;
    let arcadeLastKills = 0;
    let arcadeKillFlashTimer = null;
    let lastRenderTime = 0;
    let lastPointerPoint = null;

    const controlledShipKeys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      ShiftLeft: false,
      ShiftRight: false,
      Space: false,
    };

    const STARTUP_GRID_SIZE = 480;
    const STARTUP_POINT_SCALE = 0.05;
    const STARTUP_POINT_FADE_OUT_SCALE = 0.24;
    const STARTUP_FOOTPRINT_SCALE = 0.16;
    const LOADED_FOOTPRINT_SCALE = 0.12;
    const AREA_LOADED_FOOTPRINT_SCALE = 0.82;
    const LOADED_TRANSITION_WIDTH = 0.08;
    const LOADED_P3D_FADE_DELAY = 0.03;
    const LOADED_P3D_FADE_WIDTH = 0.20;
    const MIN_SCALE = STARTUP_POINT_SCALE;
    const MAX_SCALE = 8;
    const WHEEL_ZOOM_SENSITIVITY = 0.0012;
    const WHEEL_ZOOM_FACTOR_MIN = 0.92;
    const WHEEL_ZOOM_FACTOR_MAX = 1.08;
    const HOVER_THROTTLE_MS = 60;
    const SHIP_THRUST = 85;
    const SHIP_TURN_ACCEL = 180;
    const SHIP_LINEAR_DRAG = 0.84;
    const SHIP_ANGULAR_DRAG = 0.72;
    const PLANE_THRUST = 150;
    const PLANE_TURN_ACCEL = 95;
    const PLANE_LINEAR_DRAG = 0.87;
    const PLANE_ANGULAR_DRAG = 0.72;
    const PLANE_ALTITUDE = 320;
    const PLANE_MIN_ALTITUDE = 18;
    const PLANE_TAKEOFF_SPEED = 26;
    const PLANE_MAX_SPEED = 130;
    const PLANE_AIR_ZOOM_OUT = 0.22;
    const PLANE_LAUNCH_ZOOM = 0.82;
    const PLANE_BOOST_THRUST_MULTIPLIER = 1.85;
    const PLANE_BOOST_SPEED_MULTIPLIER = 1.65;
    const PLANE_BOOST_DRAG = 0.90;
    const PLANE_BANK_RESPONSE_SPEED = 2.6;
    const PLANE_ROCKET_SPEED = 280;
    const PLANE_ROCKET_EXPLOSION_TIME = 0.55;
    const ARCADE_TARGET_SEQUENCE = [
      { key: "industrial", label: "Industrial" },
      { key: "residential", label: "Residential" },
      { key: "military", label: "Military" },
      { key: "medical", label: "Medical" },
      { key: "school", label: "School" },
      { key: "church", label: "Church" },
    ];

    const tileImages = new Map();
    const chunkCache = new Map();
    let resizeObserver = null;

    function worldToScreenX(x) {
      return offsetX + (x - bounds.minX) * scale;
    }

    function worldToScreenY(z) {
      return offsetY + (bounds.maxZ - z) * scale;
    }

    function screenToWorldX(px) {
      return bounds.minX + (px - offsetX) / scale;
    }

    function screenToWorldZ(py) {
      return bounds.maxZ - (py - offsetY) / scale;
    }

    function eventPoint(event) {
      const rect = viewer.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function currentAimWorldPoint() {
      const fallbackPoint = {
        x: overlayCanvas.width / devicePixelRatio / 2,
        y: overlayCanvas.height / devicePixelRatio / 2,
      };
      const point = lastPointerPoint || fallbackPoint;
      return {
        x: screenToWorldX(point.x),
        z: screenToWorldZ(point.y),
      };
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        render();
      });
    }

    function applyHoverPoint(point) {
      const nextHover = nearestPlacement(point);
      if (nextHover !== hoverPlacement) {
        hoverPlacement = nextHover;
        if (hoverPlacement) {
          const displayPlacement = effectivePlacement(hoverPlacement);
          const model = getPlacementModel(displayPlacement);
          hoverReadout.textContent = `${model?.[M.type] || model?.[M.shapePath] || 'unknown'} @ x=${displayPlacement[P.x].toFixed(1)}, z=${displayPlacement[P.z].toFixed(1)}`;
        } else {
          hoverReadout.textContent = "none";
        }
        scheduleRender();
      } else if (!hoverPlacement) {
        hoverReadout.textContent = "none";
      }
    }

    function scheduleHoverCheck(point) {
      pendingHoverPoint = point;
      if (hoverCheckTimer) return;
      hoverCheckTimer = window.setTimeout(() => {
        hoverCheckTimer = 0;
        const nextPoint = pendingHoverPoint;
        pendingHoverPoint = null;
        if (nextPoint) applyHoverPoint(nextPoint);
      }, HOVER_THROTTLE_MS);
    }

    function setAreaLoading(nextLoading) {
      isAreaLoading = !!nextLoading;
      if (viewerLoadingEl) {
        viewerLoadingEl.classList.toggle("is-visible", isAreaLoading);
        viewerLoadingEl.setAttribute("aria-hidden", isAreaLoading ? "false" : "true");
      }
    }

    function scaleToSliderValue(value) {
      const t = (Math.log(value) - Math.log(MIN_SCALE)) / (Math.log(MAX_SCALE) - Math.log(MIN_SCALE));
      return Math.round(Math.max(0, Math.min(100, t * 100)));
    }

    function sliderValueToScale(value) {
      const t = Math.max(0, Math.min(1, Number(value) / 100));
      return Math.exp(Math.log(MIN_SCALE) + t * (Math.log(MAX_SCALE) - Math.log(MIN_SCALE)));
    }

    function placementGridKey(x, z) {
      return `${Math.floor(x / STARTUP_GRID_SIZE)},${Math.floor(z / STARTUP_GRID_SIZE)}`;
    }

    function buildStartupLandGrid() {
      startupLandGrid = new Map();
      for (const placement of startupLandPlacements) {
        const key = placementGridKey(placement[P.x], placement[P.z]);
        let bucket = startupLandGrid.get(key);
        if (!bucket) {
          bucket = [];
          startupLandGrid.set(key, bucket);
        }
        bucket.push(placement);
      }
    }

    function buildPlacementGrid(placements) {
      const grid = new Map();
      for (const placement of placements) {
        const key = placementGridKey(placement[P.x], placement[P.z]);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(placement);
      }
      return grid;
    }

    function visibleLoadedPlacements(paddingPx = 0) {
      if (!loadedPlacements.length) return [];
      return placementsInBounds(loadedPlacementGrid, visibleWorldBounds(paddingPx));
    }

    function visibleWorldBounds(paddingPx = 0) {
      const viewW = overlayCanvas.width / devicePixelRatio;
      const viewH = overlayCanvas.height / devicePixelRatio;
      return {
        minX: screenToWorldX(-paddingPx),
        maxX: screenToWorldX(viewW + paddingPx),
        maxZ: screenToWorldZ(-paddingPx),
        minZ: screenToWorldZ(viewH + paddingPx),
      };
    }

    function placementsInBounds(index, boundsWorld) {
      const minGX = Math.floor(boundsWorld.minX / STARTUP_GRID_SIZE);
      const maxGX = Math.floor(boundsWorld.maxX / STARTUP_GRID_SIZE);
      const minGZ = Math.floor(boundsWorld.minZ / STARTUP_GRID_SIZE);
      const maxGZ = Math.floor(boundsWorld.maxZ / STARTUP_GRID_SIZE);
      const results = [];
      for (let gx = minGX; gx <= maxGX; gx += 1) {
        for (let gz = minGZ; gz <= maxGZ; gz += 1) {
          const bucket = index.get(`${gx},${gz}`);
          if (!bucket) continue;
          for (const placement of bucket) {
            if (
              placement[P.x] >= boundsWorld.minX &&
              placement[P.x] <= boundsWorld.maxX &&
              placement[P.z] >= boundsWorld.minZ &&
              placement[P.z] <= boundsWorld.maxZ
            ) {
              results.push(placement);
            }
          }
        }
      }
      return results;
    }

    function fitViewToBounds() {
      if (!bounds) return;
      const rect = viewer.getBoundingClientRect();
      const worldWidth = bounds.maxX - bounds.minX;
      const worldHeight = bounds.maxZ - bounds.minZ;
      scale = Math.max(
        MIN_SCALE,
        Math.min(rect.width / worldWidth, rect.height / worldHeight) * 1.02
      );
      offsetX = (rect.width - worldWidth * scale) / 2;
      offsetY = (rect.height - worldHeight * scale) / 2;
    }

    function fitViewToWorldRect(minX, minZ, maxX, maxZ) {
      if (!bounds) return;
      const rect = viewer.getBoundingClientRect();
      const width = Math.max(40, Number(maxX) - Number(minX));
      const height = Math.max(40, Number(maxZ) - Number(minZ));
      const padding = Math.max(60, Math.min(rect.width, rect.height) * 0.12);
      const fitScale = Math.min(
        (rect.width - padding * 2) / width,
        (rect.height - padding * 2) / height
      );
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale));
      const centerX = (Number(minX) + Number(maxX)) / 2;
      const centerZ = (Number(minZ) + Number(maxZ)) / 2;
      offsetX = rect.width / 2 - (centerX - bounds.minX) * scale;
      offsetY = rect.height / 2 - (bounds.maxZ - centerZ) * scale;
    }

    function fitViewToSearchMatches() {
      if (searchMode !== "exact_object") return;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      let count = 0;
      for (const placement of startupLandPlacements) {
        if (!searchLandModelIds.has(placement[P.modelId])) continue;
        minX = Math.min(minX, placement[P.x]);
        minZ = Math.min(minZ, placement[P.z]);
        maxX = Math.max(maxX, placement[P.x]);
        maxZ = Math.max(maxZ, placement[P.z]);
        count += 1;
      }
      for (const placement of loadedPlacements) {
        if (!searchModelIds.has(placement[P.modelId])) continue;
        minX = Math.min(minX, placement[P.x]);
        minZ = Math.min(minZ, placement[P.z]);
        maxX = Math.max(maxX, placement[P.x]);
        maxZ = Math.max(maxZ, placement[P.z]);
        count += 1;
      }
      if (!count) return;
      fitViewToWorldRect(minX, minZ, maxX, maxZ);
    }

    function resizeCanvas(preserveView = true) {
      const rect = viewer.getBoundingClientRect();
      let centerWorldX = null;
      let centerWorldZ = null;
      if (bounds && preserveView) {
        centerWorldX = screenToWorldX((overlayCanvas.width / devicePixelRatio) / 2);
        centerWorldZ = screenToWorldZ((overlayCanvas.height / devicePixelRatio) / 2);
      }
      for (const canvas of [tileCanvas, overlayCanvas, selectionCanvas]) {
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        canvas.style.width = rect.width + "px";
        canvas.style.height = rect.height + "px";
      }
      tileCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      overlayCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      selectionCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      if (bounds) {
        if (preserveView && centerWorldX != null && centerWorldZ != null) {
          offsetX = rect.width / 2 - (centerWorldX - bounds.minX) * scale;
          offsetY = rect.height / 2 - (bounds.maxZ - centerWorldZ) * scale;
        } else {
          fitViewToBounds();
        }
      }
      render();
    }

    async function loadJson(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${url}`);
      return response.json();
    }

    function normalizeSearchKey(value) {
      return String(value || "").trim().toLowerCase();
    }

    function basenameForSearch(value) {
      const normalized = normalizeSearchKey(value).replace(/\\/g, "/");
      if (!normalized) return "";
      const parts = normalized.split("/");
      return parts[parts.length - 1] || "";
    }

    function dirnameForSearch(value) {
      const normalized = normalizeSearchKey(value).replace(/\\/g, "/");
      if (!normalized || normalized.indexOf("/") === -1) return "";
      return normalized.replace(/\/[^/]*$/, "");
    }

    function modelSearchKeys(model) {
      const keys = new Set();
      [
        normalizeSearchKey(model?.[M.type]),
        normalizeSearchKey(model?.[M.label]),
        normalizeSearchKey(model?.[M.shapePath]),
        basenameForSearch(model?.[M.shapePath]),
        dirnameForSearch(model?.[M.shapePath]),
      ].forEach((value) => {
        if (value) keys.add(value);
      });
      return keys;
    }

    function refreshSearchMatches(rows, query, pathFilter, mode) {
      searchRows = Array.isArray(rows) ? rows : [];
      searchQuery = String(query || "").trim();
      searchPathFilter = String(pathFilter || "").trim();
      searchMode = String(mode || "").trim();
      searchModelIds = new Set();
      searchLandModelIds = new Set();
      if (!searchQuery && !searchPathFilter) {
        scheduleRender();
        return;
      }
      const names = new Set();
      const paths = new Set();
      const broadQuery = normalizeSearchKey(searchQuery);
      const useBroadFallback = searchMode !== "exact_object" && !searchRows.length;
      if (searchMode === "exact_object" && searchQuery) {
        names.add(normalizeSearchKey(searchQuery));
      } else {
        if (searchRows.length) {
          searchRows.forEach((row) => {
            const objectName = normalizeSearchKey(row?.objectName);
            const matchesBroadRow = !broadQuery
              || (!!objectName && objectName.includes(broadQuery))
              || (!!row?.path && normalizeSearchKey(row.path).includes(broadQuery));
            if (objectName && matchesBroadRow) names.add(objectName);
            if (searchPathFilter) {
              const path = normalizeSearchKey(row?.path);
              if (path && path !== "-") paths.add(path);
            }
          });
        }
      }
      landModels.forEach((model, index) => {
        const keys = modelSearchKeys(model);
        for (const key of keys) {
          if (
            names.has(key) ||
            paths.has(key) ||
            (useBroadFallback && broadQuery && key.includes(broadQuery))
          ) {
            searchLandModelIds.add(index);
            break;
          }
        }
      });
      models.forEach((model, index) => {
        const keys = modelSearchKeys(model);
        for (const key of keys) {
          if (
            names.has(key) ||
            paths.has(key) ||
            (useBroadFallback && broadQuery && key.includes(broadQuery))
          ) {
            searchModelIds.add(index);
            break;
          }
        }
      });
      if (searchMode === "exact_object" && searchQuery) {
        let nextPinnedPlacement = null;
        for (const placement of startupLandPlacements) {
          if (searchLandModelIds.has(placement[P.modelId])) {
            nextPinnedPlacement = placement;
            break;
          }
        }
        if (!nextPinnedPlacement) {
          for (const placement of loadedPlacements) {
            if (searchModelIds.has(placement[P.modelId])) {
              nextPinnedPlacement = placement;
              break;
            }
          }
        }
        if (nextPinnedPlacement) {
          pinnedPlacement = nextPinnedPlacement;
          hoverPlacement = nextPinnedPlacement;
        }
      }
      fitViewToSearchMatches();
      scheduleRender();
    }

    function getModel(modelId) {
      return models[modelId] || null;
    }

    function getLandModel(modelId) {
      return landModels[modelId] || null;
    }

    function getPlacementModel(placement) {
      return placement && placement._modelTable === "land"
        ? getLandModel(placement[P.modelId])
        : getModel(placement[P.modelId]);
    }

    function isControllableShipPlacement(placement) {
      const model = getPlacementModel(placement);
      return worldKey === "sakhal" && String(model?.[M.type] || "") === "Land_Ship_Medium2";
    }

    function isControllablePlanePlacement(placement) {
      const model = getPlacementModel(placement);
      return worldKey === "chernarus" && String(model?.[M.type] || "") === "Land_Wreck_C130J_2";
    }

    function getArcadeTarget() {
      return ARCADE_TARGET_SEQUENCE[arcadeTargetIndex % ARCADE_TARGET_SEQUENCE.length];
    }

    function inferArcadeCategory(model) {
      if (!model) return null;
      const haystack = [
        model[M.image],
        model[M.shapePath],
        model[M.type],
        model[M.label],
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      if (!haystack) return null;
      if (haystack.includes("/industrial/") || haystack.includes("industrial")) return "industrial";
      if (haystack.includes("/residential/") || haystack.includes("residential")) return "residential";
      if (haystack.includes("/wreck") || haystack.includes(" wreck") || haystack.includes("_wreck")) return "wreck";
      if (haystack.includes("/military/") || haystack.includes("military")) return "military";
      if (haystack.includes("/medical/") || haystack.includes("medical") || haystack.includes("hospital")) return "medical";
      if (haystack.includes("/school") || haystack.includes("school")) return "school";
      if (haystack.includes("/church") || haystack.includes("church") || haystack.includes("chapel")) return "church";
      return null;
    }

    function updateArcadeTargetHud() {
      if (!arcadeTargetEl) return;
      const target = getArcadeTarget();
      arcadeTargetEl.textContent = target ? `Target: ${target.label}` : "Target: -";
    }

    function registerArcadeTargetHit(categoryKey) {
      if (!categoryKey) return;
      const target = getArcadeTarget();
      if (!target || categoryKey !== target.key) return;
      arcadeTargetIndex = (arcadeTargetIndex + 1) % ARCADE_TARGET_SEQUENCE.length;
      updateArcadeTargetHud();
    }

    function controllablePlaneCandidates() {
      const candidates = [];
      for (const placement of startupLandPlacements) {
        if (isControllablePlanePlacement(placement)) {
          candidates.push(placement);
        }
      }
      for (const placement of loadedPlacements) {
        if (isControllablePlanePlacement(placement)) {
          candidates.push(placement);
        }
      }
      return candidates;
    }

    function syncPlaneLaunchButtonVisibility() {
      if (!planeLaunchBtnEl) return;
      const hasCandidates = controllablePlaneCandidates().length > 0;
      planeLaunchBtnEl.classList.toggle("is-hidden", worldKey === "livonia" || !hasCandidates);
    }

    function effectivePlacement(placement) {
      if (
        controlledShip &&
        placement &&
        placement === controlledShip.sourcePlacement
      ) {
        return controlledShip.runtimePlacement;
      }
      if (
        controlledPlane &&
        placement &&
        placement === controlledPlane.sourcePlacement
      ) {
        return controlledPlane.runtimePlacement;
      }
      return placement || null;
    }

    function controlledPlacementInBounds(controlledState, boundsWorld) {
      if (!controlledState || !boundsWorld) return null;
      const placement = controlledState.runtimePlacement;
      if (
        placement[P.x] < boundsWorld.minX ||
        placement[P.x] > boundsWorld.maxX ||
        placement[P.z] < boundsWorld.minZ ||
        placement[P.z] > boundsWorld.maxZ
      ) {
        return null;
      }
      return placement;
    }

    function placementsWithControlled(placements, boundsWorld) {
      if (!controlledShip && !controlledPlane) return placements;
      const filtered = placements.slice();
      for (const controlledState of [controlledShip, controlledPlane]) {
        const runtimePlacement = controlledPlacementInBounds(controlledState, boundsWorld);
        if (!runtimePlacement) continue;
        const sourcePlacement = controlledState.sourcePlacement;
        const sourceIndex = filtered.indexOf(sourcePlacement);
        if (sourceIndex >= 0) filtered.splice(sourceIndex, 1);
        filtered.push(runtimePlacement);
      }
      return filtered;
    }

    function isSuppressedControlledPlanePlacement(placement) {
      if (!controlledPlane || !placement) return false;
      return placement === controlledPlane.sourcePlacement || placement === controlledPlane.runtimePlacement;
    }

    function activePlacement() {
      return effectivePlacement(pinnedPlacement || hoverPlacement);
    }

    function centerViewOnWorld(x, z) {
      const rect = viewer.getBoundingClientRect();
      offsetX = rect.width / 2 - (x - bounds.minX) * scale;
      offsetY = rect.height / 2 - (bounds.maxZ - z) * scale;
    }

    function setViewScaleAroundCenter(nextScale) {
      if (!bounds) return;
      const rect = viewer.getBoundingClientRect();
      const centerWorldX = screenToWorldX(rect.width / 2);
      const centerWorldZ = screenToWorldZ(rect.height / 2);
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      offsetX = rect.width / 2 - (centerWorldX - bounds.minX) * scale;
      offsetY = rect.height / 2 - (bounds.maxZ - centerWorldZ) * scale;
    }

    function activateControlledShip(placement) {
      if (!placement || !isControllableShipPlacement(placement) || !bounds) return;
      controlledPlane = null;
      const runtimePlacement = placement.slice();
      runtimePlacement._modelTable = placement._modelTable;
      controlledShip = {
        sourcePlacement: placement,
        runtimePlacement,
        velocityX: 0,
        velocityZ: 0,
        angularVelocity: 0,
      };
      pinnedPlacement = placement;
      hoverPlacement = placement;
      centerViewOnWorld(runtimePlacement[P.x], runtimePlacement[P.z]);
      statusReadout.textContent = "Ship control active · WASD · Esc";
      scheduleRender();
    }

    function activateControlledPlane(placement) {
      if (!placement || !isControllablePlanePlacement(placement) || !bounds) return;
      controlledShip = null;
      const runtimePlacement = placement.slice();
      runtimePlacement._modelTable = placement._modelTable;
      controlledPlane = {
        sourcePlacement: placement,
        runtimePlacement,
        velocityX: 0,
        velocityZ: 0,
        angularVelocity: 0,
        bank: 0,
        altitude: PLANE_MIN_ALTITUDE,
        baseScale: scale,
      };
      planeKills = 0;
      arcadeTargetIndex = 0;
      updateArcadeTargetHud();
      planeRockets = [];
      if (pinnedPlacement === placement) pinnedPlacement = null;
      if (hoverPlacement === placement) hoverPlacement = null;
      centerViewOnWorld(runtimePlacement[P.x], runtimePlacement[P.z]);
      statusReadout.textContent = "Plane mode. WASD to fly. Shift to boost. Space for missiles on cursor. Esc to exit.";
      scheduleRender();
    }

    function releaseControlledShip() {
      if (controlledPlane && Number.isFinite(controlledPlane.baseScale)) {
        setViewScaleAroundCenter(controlledPlane.baseScale);
      }
      controlledShip = null;
      controlledPlane = null;
      planeRockets = [];
      Object.keys(controlledShipKeys).forEach((code) => {
        controlledShipKeys[code] = false;
      });
      if (!isAreaLoading) {
        statusReadout.textContent = loadedPlacements.length
          ? `Loaded ${loadedPlacements.length.toLocaleString()} objects`
          : "";
      }
      scheduleRender();
    }

    function updateControlledShip(now) {
      if (!controlledShip || !bounds) return false;
      if (!lastRenderTime) return true;
      const dt = Math.max(0, Math.min(0.05, (now - lastRenderTime) / 1000));
      const placement = controlledShip.runtimePlacement;
      const yawRad = (Number(placement[P.yaw]) || 0) * Math.PI / 180;
      const forwardX = Math.sin(yawRad);
      const forwardZ = Math.cos(yawRad);
      let thrust = 0;
      if (controlledShipKeys.KeyS) thrust += SHIP_THRUST;
      if (controlledShipKeys.KeyW) thrust -= SHIP_THRUST * 0.7;
      if (controlledShipKeys.KeyA) controlledShip.angularVelocity -= SHIP_TURN_ACCEL * dt;
      if (controlledShipKeys.KeyD) controlledShip.angularVelocity += SHIP_TURN_ACCEL * dt;
      controlledShip.velocityX += forwardX * thrust * dt;
      controlledShip.velocityZ += forwardZ * thrust * dt;
      controlledShip.angularVelocity *= Math.pow(SHIP_ANGULAR_DRAG, dt * 10);
      controlledShip.velocityX *= Math.pow(SHIP_LINEAR_DRAG, dt * 10);
      controlledShip.velocityZ *= Math.pow(SHIP_LINEAR_DRAG, dt * 10);
      placement[P.yaw] = ((Number(placement[P.yaw]) || 0) + controlledShip.angularVelocity * dt + 360) % 360;
      placement[P.x] += controlledShip.velocityX * dt;
      placement[P.z] += controlledShip.velocityZ * dt;
      const worldWidth = bounds.maxX - bounds.minX;
      const worldHeight = bounds.maxZ - bounds.minZ;
      while (placement[P.x] < bounds.minX) placement[P.x] += worldWidth;
      while (placement[P.x] > bounds.maxX) placement[P.x] -= worldWidth;
      while (placement[P.z] < bounds.minZ) placement[P.z] += worldHeight;
      while (placement[P.z] > bounds.maxZ) placement[P.z] -= worldHeight;
      centerViewOnWorld(placement[P.x], placement[P.z]);
      statusReadout.textContent = "Ship control active · WASD · Esc";
      return true;
    }

    function updateControlledPlane(now) {
      if (!controlledPlane || !bounds) return false;
      if (!lastRenderTime) return true;
      const dt = Math.max(0, Math.min(0.05, (now - lastRenderTime) / 1000));
      const placement = controlledPlane.runtimePlacement;
      const yawRad = (Number(placement[P.yaw]) || 0) * Math.PI / 180;
      const forwardX = Math.sin(yawRad);
      const forwardZ = Math.cos(yawRad);
      const boosting = !!(controlledShipKeys.ShiftLeft || controlledShipKeys.ShiftRight);
      const turnInput = (controlledShipKeys.KeyD ? 1 : 0) - (controlledShipKeys.KeyA ? 1 : 0);
      const angularTurn = Math.max(-1, Math.min(1, Number(controlledPlane.angularVelocity || 0) * 0.05));
      const bankSignal = Math.max(-1, Math.min(1, turnInput || angularTurn));
      const targetBank = boosting ? -bankSignal * 0.15 : 0;
      const bankDeltaLimit = PLANE_BANK_RESPONSE_SPEED * dt;
      const bankDelta = Math.max(-bankDeltaLimit, Math.min(bankDeltaLimit, targetBank - (controlledPlane.bank || 0)));
      controlledPlane.bank = (controlledPlane.bank || 0) + bankDelta;
      const thrustMultiplier = boosting ? PLANE_BOOST_THRUST_MULTIPLIER : 1;
      let thrust = 0;
      if (controlledShipKeys.KeyS) thrust += PLANE_THRUST * thrustMultiplier;
      if (controlledShipKeys.KeyW) thrust -= PLANE_THRUST * 0.55;
      if (controlledShipKeys.KeyA) controlledPlane.angularVelocity -= PLANE_TURN_ACCEL * dt;
      if (controlledShipKeys.KeyD) controlledPlane.angularVelocity += PLANE_TURN_ACCEL * dt;
      controlledPlane.velocityX += forwardX * thrust * dt;
      controlledPlane.velocityZ += forwardZ * thrust * dt;
      controlledPlane.angularVelocity *= Math.pow(PLANE_ANGULAR_DRAG, dt * 10);
      const drag = boosting ? PLANE_BOOST_DRAG : PLANE_LINEAR_DRAG;
      controlledPlane.velocityX *= Math.pow(drag, dt * 10);
      controlledPlane.velocityZ *= Math.pow(drag, dt * 10);
      const speedLimit = PLANE_MAX_SPEED * (boosting ? PLANE_BOOST_SPEED_MULTIPLIER : 1);
      const currentSpeed = Math.hypot(controlledPlane.velocityX, controlledPlane.velocityZ);
      if (currentSpeed > speedLimit) {
        const limitScale = speedLimit / currentSpeed;
        controlledPlane.velocityX *= limitScale;
        controlledPlane.velocityZ *= limitScale;
      }
      placement[P.yaw] = ((Number(placement[P.yaw]) || 0) + controlledPlane.angularVelocity * dt + 360) % 360;
      placement[P.x] += controlledPlane.velocityX * dt;
      placement[P.z] += controlledPlane.velocityZ * dt;
      const speed = Math.hypot(controlledPlane.velocityX, controlledPlane.velocityZ);
      const takeoffT = Math.max(0, Math.min(1, (speed - PLANE_TAKEOFF_SPEED) / Math.max(1, PLANE_MAX_SPEED - PLANE_TAKEOFF_SPEED)));
      const targetAltitude = PLANE_MIN_ALTITUDE + (PLANE_ALTITUDE - PLANE_MIN_ALTITUDE) * Math.pow(takeoffT, 0.78);
      controlledPlane.altitude += (targetAltitude - controlledPlane.altitude) * Math.min(1, dt * 2.6);
      const zoomOutT = Math.max(0, Math.min(1, (controlledPlane.altitude - PLANE_MIN_ALTITUDE) / Math.max(1, PLANE_ALTITUDE - PLANE_MIN_ALTITUDE)));
      if (Number.isFinite(controlledPlane.baseScale) && controlledPlane.baseScale > 0) {
        const targetScale = controlledPlane.baseScale * (1 - PLANE_AIR_ZOOM_OUT * zoomOutT);
        setViewScaleAroundCenter(targetScale);
      }
      if (planeRockets.length) {
        planeRockets = planeRockets.flatMap((rocket) => {
          const next = { ...rocket };
          if (next.phase === "flight") {
            const step = PLANE_ROCKET_SPEED * dt;
            const remaining = Math.max(0, (next.distance || 0) - (next.travelled || 0));
            if (step >= remaining) {
              const impact = bombLandHitScore(next.targetX, next.targetZ);
              planeKills += Number(impact?.score || 0);
              registerArcadeTargetHit(impact?.category || null);
              return [{
                x: next.targetX,
                z: next.targetZ,
                phase: "explosion",
                elapsed: 0,
              }];
            }
            next.travelled = (next.travelled || 0) + step;
            next.x += (next.dirX || 0) * step;
            next.z += (next.dirZ || 0) * step;
            return [next];
          }
          next.elapsed = (next.elapsed || 0) + dt;
          if (next.elapsed < PLANE_ROCKET_EXPLOSION_TIME) {
            return [next];
          }
          return [];
        });
      }
      const worldWidth = bounds.maxX - bounds.minX;
      const worldHeight = bounds.maxZ - bounds.minZ;
      while (placement[P.x] < bounds.minX) placement[P.x] += worldWidth;
      while (placement[P.x] > bounds.maxX) placement[P.x] -= worldWidth;
      while (placement[P.z] < bounds.minZ) placement[P.z] += worldHeight;
      while (placement[P.z] > bounds.maxZ) placement[P.z] -= worldHeight;
      centerViewOnWorld(placement[P.x], placement[P.z]);
      statusReadout.textContent = "Plane mode. WASD to fly. Shift to boost. Space for missiles on cursor. Esc to exit.";
      return true;
    }

    function activeCardModelInfo() {
      const placement = activePlacement();
      if (placement) {
        return {
          placement,
          model: getPlacementModel(placement)
        };
      }
      if (searchMode === "exact_object" && searchQuery) {
        for (const modelId of searchModelIds) {
          const model = getModel(modelId);
          if (model) {
            return { placement: null, model };
          }
        }
        for (const modelId of searchLandModelIds) {
          const model = getLandModel(modelId);
          if (model) {
            return { placement: null, model };
          }
        }
      }
      return { placement: null, model: null };
    }

    function setHoverThumb(src) {
      if (!src) {
        hoverThumbEl.classList.add("is-empty");
        hoverThumbEl.style.display = "none";
        hoverThumbEl.style.backgroundImage = "";
        hoverThumbActionsEl.classList.add("is-hidden");
        hoverThumbImgEl.hidden = true;
        hoverThumbImgEl.setAttribute("hidden", "");
        hoverThumbImgEl.removeAttribute("src");
        return;
      }
      hoverThumbEl.classList.remove("is-empty");
      hoverThumbEl.style.display = "flex";
      hoverThumbEl.style.backgroundImage = `url("${"/" + String(src).replace(/^\/+/, "")}")`;
      hoverThumbActionsEl.classList.remove("is-hidden");
      hoverThumbImgEl.hidden = false;
      hoverThumbImgEl.removeAttribute("hidden");
      hoverThumbImgEl.setAttribute("hidden", "");
      hoverThumbImgEl.hidden = true;
      hoverThumbImgEl.removeAttribute("src");
    }

    function updateHoverCard() {
      const info = activeCardModelInfo();
      const placement = info.placement;
      const model = info.model;
      hoverCardEl.classList.toggle("is-clickable", !!model);
      hoverNameEl.disabled = !model;
      hoverMetaEl.disabled = !model;
      if (!model) {
        hoverNameEl.textContent = "Hover over an object";
        hoverNameEl.classList.remove("is-active");
        hoverMetaEl.textContent = "Search 0 on map";
        hoverCardEl.classList.remove("is-clickable");
        setHoverThumb("");
        return;
      }
      const name = model?.[M.label] || model?.[M.type] || model?.[M.shapePath] || "unknown";
      const count = model?.[M.count];
      const countLabel = typeof count === "number" ? count.toLocaleString() : "0";
      hoverNameEl.textContent = name;
      hoverNameEl.classList.add("is-active");
      hoverMetaEl.textContent = isActivePlacementFiltered()
        ? `Hide ${countLabel} on map`
        : `Search ${countLabel} on map`;
      setHoverThumb(model?.[M.image] || "");
      hoverThumbPinEl.classList.toggle("is-active", false);
    }

    function syncThemeFromParent() {
      try {
        if (!window.parent || window.parent === window || !window.parent.document) return;
        const parentDoc = window.parent.document;
        const parentStyles = window.parent.getComputedStyle(parentDoc.documentElement);
        const parentCardEl = parentDoc.querySelector("#dayzObjects_wrapper, .object-focus, .folder-sidebar");
        const parentButtonEl = parentDoc.querySelector(".pill-button, .folder-sidebar__clear, .row-detail__action, button");
        const cardStyles = parentCardEl ? window.parent.getComputedStyle(parentCardEl) : null;
        const buttonStyles = parentButtonEl ? window.parent.getComputedStyle(parentButtonEl) : null;
        const card = parentStyles.getPropertyValue("--card").trim();
        const border = parentStyles.getPropertyValue("--border").trim();
        const text = parentStyles.getPropertyValue("--text").trim();
        const accent = parentStyles.getPropertyValue("--accent").trim();
        const bgSoft = parentStyles.getPropertyValue("--bg-soft").trim();
        const shadowSoft = parentStyles.getPropertyValue("--shadow-soft").trim();
        const resolvedCardBg = (cardStyles && cardStyles.backgroundColor) || card;
        const resolvedCardBorder = (cardStyles && cardStyles.borderColor) || border;
        const resolvedCardText = (cardStyles && cardStyles.color) || text;
        const rawButtonBg = (buttonStyles && buttonStyles.backgroundColor) || "";
        const resolvedButtonBg = (
          rawButtonBg &&
          rawButtonBg !== "transparent" &&
          rawButtonBg !== "rgba(0, 0, 0, 0)" &&
          rawButtonBg !== "rgba(0,0,0,0)"
        ) ? rawButtonBg : resolvedCardBg;
        const resolvedButtonBorder = (buttonStyles && buttonStyles.borderColor) || resolvedCardBorder;
        const resolvedButtonText = (buttonStyles && buttonStyles.color) || resolvedCardText;
        const resolvedButtonRadius = buttonStyles ? buttonStyles.borderRadius : "3px";
        document.documentElement.classList.toggle("dark-mode", parentDoc.documentElement.classList.contains("dark-mode"));
        if (resolvedCardBg) {
          document.documentElement.style.setProperty("--site-card", resolvedCardBg);
          document.documentElement.style.setProperty("--site-panel-bg", resolvedCardBg);
        }
        if (resolvedCardText) {
          document.documentElement.style.setProperty("--site-panel-text", resolvedCardText);
          document.body.style.color = resolvedCardText;
        }
        if (resolvedCardBorder) {
          document.documentElement.style.setProperty("--site-panel-border", resolvedCardBorder);
          document.documentElement.style.setProperty("--site-divider", resolvedCardBorder);
        }
        if (resolvedCardText) {
          document.documentElement.style.setProperty("--site-muted", resolvedCardText);
          document.documentElement.style.setProperty("--site-subtle-bg", `color-mix(in srgb, ${resolvedCardText} 8%, transparent)`);
          document.documentElement.style.setProperty("--site-subtle-bg-2", `color-mix(in srgb, ${resolvedCardText} 3%, transparent)`);
        }
        if (resolvedButtonBg) document.documentElement.style.setProperty("--site-button-bg", resolvedButtonBg);
        if (resolvedButtonBorder) document.documentElement.style.setProperty("--site-button-border", resolvedButtonBorder);
        if (resolvedButtonText) {
          document.documentElement.style.setProperty("--site-button-text", resolvedButtonText);
          document.documentElement.style.setProperty("--site-button-hover-text", resolvedButtonText);
        }
        if (resolvedButtonRadius) document.documentElement.style.setProperty("--site-button-radius", resolvedButtonRadius);
        if (accent) document.documentElement.style.setProperty("--accent", accent);
        if (bgSoft) document.body.style.background = bgSoft;
        if (shadowSoft) {
          document.querySelectorAll(".map-panel").forEach((panel) => {
            panel.style.boxShadow = shadowSoft;
          });
        }
      } catch (error) {
      }
    }

    function focusHoveredObjectInParent() {
      const info = activeCardModelInfo();
      const model = info.model;
      if (!model) return;
      const objectName = model?.[M.type] || model?.[M.label] || model?.[M.shapePath] || "";
      const shapePath = model?.[M.shapePath] || "";
      if (!objectName) return;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "object-map-focus-object",
          objectName,
          shapePath
        }, window.location.origin);
      }
    }

    function postActiveObjectAction(action) {
      const info = activeCardModelInfo();
      const model = info.model;
      if (!model) return;
      const objectName = model?.[M.type] || model?.[M.label] || model?.[M.shapePath] || "";
      const shapePath = model?.[M.shapePath] || "";
      if (!objectName) return;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "object-map-object-action",
          action,
          objectName,
          shapePath
        }, window.location.origin);
      }
    }

    function flashThumbAction(button) {
      if (!button) return;
      const originalHtml = button.innerHTML;
      button.textContent = "✔";
      button.classList.add("is-active");
      window.setTimeout(() => {
        button.innerHTML = originalHtml;
        button.classList.remove("is-active");
      }, 900);
    }

    function filterHoveredObjectInParent() {
      const info = activeCardModelInfo();
      const placement = info.placement;
      const model = info.model;
      if (!model) return;
      const objectName = model?.[M.type] || model?.[M.label] || model?.[M.shapePath] || "";
      if (objectName) {
        if (placement) {
          pinnedPlacement = placement;
        }
        refreshSearchMatches([], objectName, "", "exact_object");
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "object-map-filter-object",
          objectName
        }, window.location.origin);
      }
    }

    function isActivePlacementFiltered() {
      const info = activeCardModelInfo();
      const model = info.model;
      if (!model || !searchQuery) return false;
      const objectName = normalizeSearchKey(model?.[M.type] || model?.[M.label] || model?.[M.shapePath] || "");
      return !!objectName && objectName === normalizeSearchKey(searchQuery);
    }

    function clearParentObjectFilter() {
      refreshSearchMatches([], "", "", "");
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "object-map-filter-object",
          objectName: ""
        }, window.location.origin);
      }
    }

    async function copyTextToClipboard(text) {
      const value = String(text || "");
      if (!value) return false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (error) {
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return !!ok;
      } catch (error) {
        return false;
      }
    }

    function objectFootprint(placement, modelTable) {
      const model = modelTable[placement[P.modelId]] || null;
      if (!model) return null;
      const polygon = model[M.footprint];
      if (Array.isArray(polygon) && polygon.length >= 3) {
        const yaw = (placement[P.yaw] || 0) * Math.PI / 180;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        return polygon.map((point) => {
          const lx = Number(point[0]);
          const lz = Number(point[1]);
          const wx = placement[P.x] + lx * cos + lz * sin;
          const wz = placement[P.z] - lx * sin + lz * cos;
          return [worldToScreenX(wx), worldToScreenY(wz)];
        });
      }
      const minX = model[M.bboxMinX];
      const minZ = model[M.bboxMinZ];
      const maxX = model[M.bboxMaxX];
      const maxZ = model[M.bboxMaxZ];
      if (minX == null || minZ == null || maxX == null || maxZ == null) return null;
      const yaw = (placement[P.yaw] || 0) * Math.PI / 180;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const locals = [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ];
      return locals.map(([lx, lz]) => {
        const wx = placement[P.x] + lx * cos + lz * sin;
        const wz = placement[P.z] - lx * sin + lz * cos;
        return [worldToScreenX(wx), worldToScreenY(wz)];
      });
    }

    function placementWorldPolygon(placement, modelTable) {
      const model = modelTable[placement[P.modelId]] || null;
      if (!model) return null;
      const polygon = model[M.footprint];
      const yaw = (placement[P.yaw] || 0) * Math.PI / 180;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      if (Array.isArray(polygon) && polygon.length >= 3) {
        return polygon.map((point) => {
          const lx = Number(point[0]);
          const lz = Number(point[1]);
          return [
            placement[P.x] + lx * cos + lz * sin,
            placement[P.z] - lx * sin + lz * cos
          ];
        });
      }
      const minX = model[M.bboxMinX];
      const minZ = model[M.bboxMinZ];
      const maxX = model[M.bboxMaxX];
      const maxZ = model[M.bboxMaxZ];
      if (minX == null || minZ == null || maxX == null || maxZ == null) return null;
      return [
        [placement[P.x] + minX * cos + minZ * sin, placement[P.z] - minX * sin + minZ * cos],
        [placement[P.x] + maxX * cos + minZ * sin, placement[P.z] - maxX * sin + minZ * cos],
        [placement[P.x] + maxX * cos + maxZ * sin, placement[P.z] - maxX * sin + maxZ * cos],
        [placement[P.x] + minX * cos + maxZ * sin, placement[P.z] - minX * sin + maxZ * cos],
      ];
    }

    function pointInWorldPolygon(x, z, polygon) {
      if (!Array.isArray(polygon) || polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const xi = polygon[i][0];
        const zi = polygon[i][1];
        const xj = polygon[j][0];
        const zj = polygon[j][1];
        const intersects = ((zi > z) !== (zj > z))
          && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi);
        if (intersects) inside = !inside;
      }
      return inside;
    }

    function bombLandHitScore(x, z) {
      const impactBounds = {
        minX: x - 18,
        maxX: x + 18,
        minZ: z - 18,
        maxZ: z + 18,
      };
      for (const placement of placementsInBounds(startupLandGrid, impactBounds)) {
        const model = getPlacementModel(placement);
        if (!isLandType(model)) continue;
        const polygon = placementWorldPolygon(placement, landModels);
        if (polygon && pointInWorldPolygon(x, z, polygon)) {
          return {
            score: 8 + Math.round((model?.[M.count] ? 2 : 0) + Math.random() * 6),
            category: inferArcadeCategory(model),
          };
        }
      }
      for (const placement of placementsInBounds(loadedPlacementGrid, impactBounds)) {
        const model = getPlacementModel(placement);
        if (!isLandType(model)) continue;
        const polygon = placementWorldPolygon(placement, models);
        if (polygon && pointInWorldPolygon(x, z, polygon)) {
          return {
            score: 8 + Math.round((model?.[M.count] ? 2 : 0) + Math.random() * 6),
            category: inferArcadeCategory(model),
          };
        }
      }
      return { score: 0, category: null };
    }

    function updateArcadeHud() {
      if (!arcadeHudEl || !arcadeKillsEl) return;
      const visible = !!controlledPlane;
      arcadeHudEl.classList.toggle("is-visible", visible);
      if (!visible) {
        arcadeLastKills = 0;
        if (arcadeKillFlashTimer) {
          clearTimeout(arcadeKillFlashTimer);
          arcadeKillFlashTimer = null;
        }
        arcadeHudEl.classList.remove("is-kill-flash");
      } else if (planeKills > arcadeLastKills) {
        arcadeHudEl.classList.remove("is-kill-flash");
        void arcadeHudEl.offsetWidth;
        arcadeHudEl.classList.add("is-kill-flash");
        if (arcadeKillFlashTimer) {
          clearTimeout(arcadeKillFlashTimer);
        }
        arcadeKillFlashTimer = setTimeout(() => {
          arcadeHudEl.classList.remove("is-kill-flash");
          arcadeKillFlashTimer = null;
        }, 500);
      }
      updateArcadeTargetHud();
      arcadeLastKills = planeKills;
      arcadeKillsEl.textContent = planeKills.toLocaleString();
    }

    function controlledPlaneVisualOffsets(placement) {
      const altitude = Number(controlledPlane?.altitude || PLANE_ALTITUDE);
      const yawRad = (Number(placement?.[P.yaw]) || 0) * Math.PI / 180;
      const altitudeRatio = Math.max(0, Math.min(1, altitude / Math.max(1, PLANE_ALTITUDE)));
      // Scale lift/shadow offsets down as zoom decreases so visual position tracks world center.
      const zoomOffsetScale = Math.max(0.28, Math.min(1, scale / 0.16));
      return {
        altitude,
        altitudeRatio,
        yawRad,
        shadowOffsetX: Math.sin(yawRad + Math.PI / 2) * (12 + altitudeRatio * 14) * zoomOffsetScale,
        shadowOffsetY: (Math.cos(yawRad + Math.PI / 2) * (8 + altitudeRatio * 10) + 10 + altitudeRatio * 8) * zoomOffsetScale,
        liftOffsetX: -Math.sin(yawRad + Math.PI / 2) * (6 + altitudeRatio * 4) * zoomOffsetScale,
        liftOffsetY: (-Math.cos(yawRad + Math.PI / 2) * (4 + altitudeRatio * 3) - Math.max(10, altitude * 0.055)) * zoomOffsetScale,
      };
    }

    function renderControlledPlaneEffect() {
      if (!controlledPlane) return;
      const placement = controlledPlane.runtimePlacement;
      const modelTable = placement._modelTable === "land" ? landModels : models;
      const basePoints = objectFootprint(placement, modelTable);
      const cx = worldToScreenX(placement[P.x]);
      const cy = worldToScreenY(placement[P.z]);
      const {
        altitude,
        altitudeRatio,
        yawRad,
        shadowOffsetX,
        shadowOffsetY,
        liftOffsetX,
        liftOffsetY,
      } = controlledPlaneVisualOffsets(placement);
      const shadowVisibility = Math.max(0, Math.min(1, (scale - 0.09) / 0.25));
      const shrink = Math.max(0.62, 1 - altitude * 0.00082);
      const shadowScale = Math.max(0.34, 0.68 - altitudeRatio * 0.18);
      const shadowFill = (0.50 + altitudeRatio * 0.05) * shadowVisibility;
      const shadowStroke = (0.12 + altitudeRatio * 0.07) * shadowVisibility;
      if (basePoints && basePoints.length >= 3) {
        const shadowPoints = basePoints.map(([px, py]) => [cx + (px - cx) * shadowScale + shadowOffsetX, cy + (py - cy) * shadowScale + shadowOffsetY]);
        if (shadowVisibility > 0.02) {
          overlayCtx.beginPath();
          overlayCtx.moveTo(shadowPoints[0][0], shadowPoints[0][1]);
          for (let i = 1; i < shadowPoints.length; i += 1) overlayCtx.lineTo(shadowPoints[i][0], shadowPoints[i][1]);
          overlayCtx.closePath();
          overlayCtx.fillStyle = `rgba(17,25,32,${shadowFill.toFixed(3)})`;
          overlayCtx.strokeStyle = `rgba(17,25,32,${shadowStroke.toFixed(3)})`;
          overlayCtx.lineWidth = 1.2 + altitudeRatio * 0.6;
          overlayCtx.fill();
          overlayCtx.stroke();
        }

        const boosting = !!(controlledShipKeys.ShiftLeft || controlledShipKeys.ShiftRight);
        const bankStrength = Number(controlledPlane.bank || 0);
        const forwardX = Math.sin(yawRad);
        const forwardY = -Math.cos(yawRad);
        const rightX = -forwardY;
        const rightY = forwardX;
        const liftedPoints = basePoints.map(([px, py]) => {
          const centerX = cx + liftOffsetX;
          const centerY = cy + liftOffsetY;
          let x = centerX + (px - cx) * shrink;
          let y = centerY + (py - cy) * shrink;
          if (bankStrength !== 0) {
            const relX = x - centerX;
            const relY = y - centerY;
            const forward = relX * forwardX + relY * forwardY;
            const side = relX * rightX + relY * rightY;
            // Pseudo roll: compress wing span and offset opposite wings vertically.
            const sideScale = 1 - Math.min(0.32, Math.abs(bankStrength) * 1.35);
            const sideProjected = side * sideScale;
            const verticalLift = side * bankStrength * 0.62;
            x = centerX + forwardX * forward + rightX * sideProjected;
            y = centerY + forwardY * forward + rightY * sideProjected + verticalLift;
          }
          return [x, y];
        });
        overlayCtx.beginPath();
        overlayCtx.moveTo(liftedPoints[0][0], liftedPoints[0][1]);
        for (let i = 1; i < liftedPoints.length; i += 1) overlayCtx.lineTo(liftedPoints[i][0], liftedPoints[i][1]);
        overlayCtx.closePath();
        overlayCtx.fillStyle = "rgba(148,156,168,1)";
        overlayCtx.strokeStyle = "rgba(199,205,214,1)";
        overlayCtx.lineWidth = 1.3;
        overlayCtx.fill();
        overlayCtx.stroke();
      }
    }

    function fireControlledPlaneRocket() {
      if (!controlledPlane) return;
      const placement = controlledPlane.runtimePlacement;
      const visual = controlledPlaneVisualOffsets(placement);
      const originX = placement[P.x] + (visual.liftOffsetX / Math.max(scale, 1e-6));
      const originZ = placement[P.z] - (visual.liftOffsetY / Math.max(scale, 1e-6));
      const aim = currentAimWorldPoint();
      const dx = aim.x - originX;
      const dz = aim.z - originZ;
      const distance = Math.hypot(dx, dz);
      if (distance <= 1) return;
      planeRockets.push({
        x: originX,
        z: originZ,
        targetX: aim.x,
        targetZ: aim.z,
        dirX: dx / distance,
        dirZ: dz / distance,
        distance,
        travelled: 0,
        phase: "flight",
      });
      statusReadout.textContent = "Plane mode. WASD to fly. Shift to boost. Space for missiles on cursor. Esc to exit.";
      scheduleRender();
    }

    function renderPlaneRocketSight() {
      if (!controlledPlane) return;
      const aim = currentAimWorldPoint();
      const px = worldToScreenX(aim.x);
      const py = worldToScreenY(aim.z);
      overlayCtx.save();
      overlayCtx.strokeStyle = "rgba(255,174,48,0.92)";
      overlayCtx.lineWidth = 1.2;
      overlayCtx.beginPath();
      overlayCtx.arc(px, py, 11, 0, Math.PI * 2);
      overlayCtx.stroke();
      overlayCtx.beginPath();
      overlayCtx.moveTo(px - 16, py);
      overlayCtx.lineTo(px - 6, py);
      overlayCtx.moveTo(px + 6, py);
      overlayCtx.lineTo(px + 16, py);
      overlayCtx.moveTo(px, py - 16);
      overlayCtx.lineTo(px, py - 6);
      overlayCtx.moveTo(px, py + 6);
      overlayCtx.lineTo(px, py + 16);
      overlayCtx.stroke();
      overlayCtx.restore();
    }

    function renderPlaneRockets() {
      if (!planeRockets.length || !controlledPlane) return;
      for (const rocket of planeRockets) {
        const px = worldToScreenX(rocket.x);
        const py = worldToScreenY(rocket.z);
        if (rocket.phase === "flight") {
          overlayCtx.beginPath();
          overlayCtx.arc(px, py, 2.8, 0, Math.PI * 2);
          overlayCtx.fillStyle = "rgba(255,212,120,1)";
          overlayCtx.fill();
          overlayCtx.beginPath();
          overlayCtx.arc(px, py, 6.2, 0, Math.PI * 2);
          overlayCtx.fillStyle = "rgba(255,120,18,0.32)";
          overlayCtx.fill();
          continue;
        }
        const t = Math.max(0, Math.min(1, rocket.elapsed / PLANE_ROCKET_EXPLOSION_TIME));
        const coreRadius = 7 + t * 18;
        const flameRadius = 14 + t * 34;
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, flameRadius, 0, Math.PI * 2);
        overlayCtx.fillStyle = `rgba(255,122,24,${(0.52 * (1 - t * 0.8)).toFixed(3)})`;
        overlayCtx.fill();
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, coreRadius, 0, Math.PI * 2);
        overlayCtx.fillStyle = `rgba(255,196,84,${(0.98 * (1 - t * 0.45)).toFixed(3)})`;
        overlayCtx.fill();
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, Math.max(2.6, coreRadius * 0.46), 0, Math.PI * 2);
        overlayCtx.fillStyle = `rgba(255,246,214,${(1.0 * (1 - t * 0.6)).toFixed(3)})`;
        overlayCtx.fill();
      }
    }

    function placementRoofFill(model) {
      const roofColor = model?.[M.roofColor];
      if (Array.isArray(roofColor) && roofColor.length >= 3) {
        const r = Number(roofColor[0] || 0);
        const g = Number(roofColor[1] || 0);
        const b = Number(roofColor[2] || 0);
        const avg = (r + g + b) / 3;
        const boost = 3.9375;
        return [
          Math.max(0, Math.min(255, Math.round(avg + (r - avg) * boost))),
          Math.max(0, Math.min(255, Math.round(avg + (g - avg) * boost))),
          Math.max(0, Math.min(255, Math.round(avg + (b - avg) * boost))),
        ];
      }
      return null;
    }

    function isLandType(model) {
      const typeName = String(model?.[M.type] || "").trim();
      return typeName.startsWith("Land_");
    }

    function loadedP3dStyle(model, fillAlpha, strokeAlpha) {
      if (isLandType(model)) return null;
      if (worldKey !== "sakhal") {
        return {
          fill: `rgba(255,255,255,${Math.min(0.96, fillAlpha * 4.8).toFixed(3)})`,
          stroke: `rgba(255,255,255,${Math.min(0.98, strokeAlpha).toFixed(3)})`,
          point: `rgba(255,255,255,${Math.min(0.98, Math.max(0.02, strokeAlpha)).toFixed(3)})`
        };
      }
      return {
        fill: `rgba(214,58,58,${Math.min(0.88, fillAlpha * 2.8).toFixed(3)})`,
        stroke: `rgba(232,88,88,${Math.min(0.96, strokeAlpha).toFixed(3)})`,
        point: `rgba(232,88,88,${Math.min(0.96, Math.max(0.02, strokeAlpha)).toFixed(3)})`
      };
    }

    function p3dPointFill(alpha) {
      if (worldKey === "sakhal") {
        return `rgba(232,88,88,${alpha.toFixed(3)})`;
      }
      return `rgba(255,255,255,${alpha.toFixed(3)})`;
    }

    function zoomedOutPointFill(alpha) {
      if (worldKey === "sakhal") {
        return `rgba(220,38,38,${alpha.toFixed(3)})`;
      }
      return `rgba(255,255,255,${alpha.toFixed(3)})`;
    }

    function zoomFade(scaleValue, low, high, minAlpha, maxAlpha) {
      if (scaleValue <= low) return minAlpha;
      if (scaleValue >= high) return maxAlpha;
      const t = (scaleValue - low) / (high - low);
      return minAlpha + (maxAlpha - minAlpha) * t;
    }

    function loadedFootprintScaleThreshold() {
      return areaWorld && loadedPlacements.length ? AREA_LOADED_FOOTPRINT_SCALE : LOADED_FOOTPRINT_SCALE;
    }

    function loadedPointFadeOutScaleThreshold() {
      return loadedFootprintScaleThreshold() + LOADED_TRANSITION_WIDTH;
    }

    function allVisiblePlacements() {
      return startupLandPlacements.concat(loadedPlacements);
    }

    function renderRawTiles() {
      if (!rawTileManifest?.tiles?.length) return false;
      const visible = {
        minX: screenToWorldX(0),
        maxX: screenToWorldX(tileCanvas.width / devicePixelRatio),
        maxZ: screenToWorldZ(0),
        minZ: screenToWorldZ(tileCanvas.height / devicePixelRatio),
      };
      let drew = false;
      for (const tile of rawTileManifest.tiles) {
        if (tile.worldMaxX < visible.minX || tile.worldMinX > visible.maxX || tile.worldMaxZ < visible.minZ || tile.worldMinZ > visible.maxZ) continue;
        const src = new URL(tile.src, rawTileManifestBaseUrl).toString();
        let image = tileImages.get(src);
        if (!image) {
          image = new Image();
          image.src = src;
          image.onload = scheduleRender;
          tileImages.set(src, image);
        }
        if (!image.complete || !image.naturalWidth) continue;
        const left = worldToScreenX(tile.worldMinX);
        const top = worldToScreenY(tile.worldMaxZ);
        const width = (tile.worldMaxX - tile.worldMinX) * scale;
        const height = (tile.worldMaxZ - tile.worldMinZ) * scale;
        tileCtx.drawImage(image, left, top, width, height);
        drew = true;
      }
      return drew;
    }

    function renderPyramidTiles() {
      tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
      if (!showTiles.checked || !satPyramid) return;
      const viewW = tileCanvas.width / devicePixelRatio;
      const viewH = tileCanvas.height / devicePixelRatio;
      const worldWidth = bounds.maxX - bounds.minX;
      const pxPerMeterAtMax = (512 * Math.pow(2, satPyramid.maxZoom)) / worldWidth;
      const desiredRatio = Math.max(scale / pxPerMeterAtMax, 1 / Math.pow(2, satPyramid.maxZoom));
      const relative = Math.ceil(Math.log2(desiredRatio));
      const z = Math.max(satPyramid.minZoom, Math.min(satPyramid.maxZoom, satPyramid.maxZoom + relative));
      const grid = Math.pow(2, z);
      const tileWorldW = (bounds.maxX - bounds.minX) / grid;
      const tileWorldH = (bounds.maxZ - bounds.minZ) / grid;
      const minWX = screenToWorldX(0);
      const maxWX = screenToWorldX(viewW);
      const maxWZ = screenToWorldZ(0);
      const minWZ = screenToWorldZ(viewH);
      const minTX = Math.max(0, Math.floor((minWX - bounds.minX) / tileWorldW));
      const maxTX = Math.min(grid - 1, Math.floor((maxWX - bounds.minX) / tileWorldW));
      const minTY = Math.max(0, Math.floor((bounds.maxZ - maxWZ) / tileWorldH));
      const maxTY = Math.min(grid - 1, Math.floor((bounds.maxZ - minWZ) / tileWorldH));
      for (let tx = minTX; tx <= maxTX; tx += 1) {
        for (let ty = minTY; ty <= maxTY; ty += 1) {
          const worldMinX = bounds.minX + tx * tileWorldW;
          const worldMaxX = worldMinX + tileWorldW;
          const worldMaxZ = bounds.maxZ - ty * tileWorldH;
          const worldMinZ = worldMaxZ - tileWorldH;
          const left = worldToScreenX(worldMinX);
          const top = worldToScreenY(worldMaxZ);
          const width = (worldMaxX - worldMinX) * scale;
          const height = (worldMaxZ - worldMinZ) * scale;
          const src = new URL(
            satPyramid.template
              .replace("{z}", z)
              .replace("{x}", tx)
              .replace("{y}", ty),
            tileManifestBaseUrl
          ).toString();
          let image = tileImages.get(src);
          if (!image) {
            image = new Image();
            image.src = src;
            image.onload = scheduleRender;
            tileImages.set(src, image);
          }
          if (image.complete && image.naturalWidth) {
            tileCtx.drawImage(image, left, top, width, height);
          } else {
            for (let fallbackZ = z - 1; fallbackZ >= satPyramid.minZoom; fallbackZ -= 1) {
              const divisor = 2 ** (z - fallbackZ);
              const fallbackX = Math.floor(tx / divisor);
              const fallbackY = Math.floor(ty / divisor);
              const fallbackSrc = new URL(
                satPyramid.template
                  .replace("{z}", fallbackZ)
                  .replace("{x}", fallbackX)
                  .replace("{y}", fallbackY),
                tileManifestBaseUrl
              ).toString();
              let fallbackImage = tileImages.get(fallbackSrc);
              if (!fallbackImage) {
                fallbackImage = new Image();
                fallbackImage.src = fallbackSrc;
                fallbackImage.onload = scheduleRender;
                tileImages.set(fallbackSrc, fallbackImage);
              }
              if (!fallbackImage.complete || !fallbackImage.naturalWidth) continue;
              const tileSpan = 2 ** (z - fallbackZ);
              const subX = tx % tileSpan;
              const subY = ty % tileSpan;
              const srcTileW = fallbackImage.naturalWidth / tileSpan;
              const srcTileH = fallbackImage.naturalHeight / tileSpan;
              tileCtx.drawImage(
                fallbackImage,
                subX * srcTileW,
                subY * srcTileH,
                srcTileW,
                srcTileH,
                left,
                top,
                width,
                height
              );
              break;
            }
          }
        }
      }
    }

    function renderTiles() {
      tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
      if (!showTiles.checked) return;
      if (false && scale >= 0.22 && renderRawTiles()) return;
      renderPyramidTiles();
    }

    function renderOverlay() {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      const viewBounds = visibleWorldBounds(40);
      const visiblePlacements = placementsWithControlled(placementsInBounds(startupLandGrid, viewBounds), viewBounds);
      const visibleLoaded = placementsWithControlled(visibleLoadedPlacements(40), viewBounds);
      const loadedFootprintScale = loadedFootprintScaleThreshold();
      const loadedPointFadeOutScale = loadedPointFadeOutScaleThreshold();

      if (showFootprints.checked && scale >= STARTUP_FOOTPRINT_SCALE) {
        const startupFillAlpha = zoomFade(scale, STARTUP_FOOTPRINT_SCALE, 0.35, 0.006, 0.08);
        const startupStrokeAlpha = zoomFade(scale, STARTUP_FOOTPRINT_SCALE, 0.35, 0.10, 0.92);
        for (const placement of visiblePlacements) {
          if (isSuppressedControlledPlanePlacement(placement)) continue;
          const model = landModels[placement[P.modelId]] || null;
          const points = objectFootprint(placement, landModels);
          if (!points) continue;
          const roofColor = placementRoofFill(model);
          overlayCtx.beginPath();
          overlayCtx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i += 1) overlayCtx.lineTo(points[i][0], points[i][1]);
          overlayCtx.closePath();
          const fallbackStyle = fallbackFootprintStyle(startupFillAlpha, startupStrokeAlpha);
          overlayCtx.fillStyle = roofColor
            ? `rgba(${roofColor[0]},${roofColor[1]},${roofColor[2]},${Math.max(0.72, startupFillAlpha * 5.0).toFixed(3)})`
            : fallbackStyle.fill;
          overlayCtx.strokeStyle = roofColor && worldKey !== "sakhal"
            ? `rgba(255,255,255,${startupStrokeAlpha.toFixed(3)})`
            : fallbackStyle.stroke;
          overlayCtx.lineWidth = scale > 0.35 ? 1.1 : 1;
          overlayCtx.fill();
          overlayCtx.stroke();
        }
      }

      if (showFootprints.checked && scale >= loadedFootprintScale) {
        const loadedFillAlpha = zoomFade(scale, loadedFootprintScale, 0.35, 0.008, 0.1);
        const loadedStrokeAlpha = zoomFade(scale, loadedFootprintScale, 0.35, 0.12, 0.94);
        const p3dFadeLow = loadedFootprintScale + LOADED_P3D_FADE_DELAY;
        const p3dFadeHigh = p3dFadeLow + LOADED_P3D_FADE_WIDTH;
        const showP3dBounds = scale >= p3dFadeLow;
        const p3dFillAlpha = showP3dBounds
          ? zoomFade(scale, p3dFadeLow, p3dFadeHigh, 0.008, 0.1)
          : 0;
        const p3dStrokeAlpha = showP3dBounds
          ? zoomFade(scale, p3dFadeLow, p3dFadeHigh, 0.12, 0.94)
          : 0;
        const p3dPointAlpha = scale < p3dFadeLow
          ? 0.9
          : zoomFade(scale, p3dFadeLow, p3dFadeHigh, 0.9, 0);
        for (const placement of visibleLoaded) {
          if (isSuppressedControlledPlanePlacement(placement)) continue;
          const model = models[placement[P.modelId]] || null;
          const points = objectFootprint(placement, models);
          const p3dStyle = showP3dBounds
            ? loadedP3dStyle(model, p3dFillAlpha, p3dStrokeAlpha)
            : null;
          if (!points) {
            if (p3dPointAlpha > 0.01) {
              overlayCtx.beginPath();
              overlayCtx.arc(worldToScreenX(placement[P.x]), worldToScreenY(placement[P.z]), Math.max(2.6, Math.min(4.8, scale * 5.6)), 0, Math.PI * 2);
              overlayCtx.fillStyle = p3dPointFill(p3dPointAlpha);
              overlayCtx.fill();
            }
            continue;
          }
          const roofColor = placementRoofFill(model);
          overlayCtx.beginPath();
          overlayCtx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i += 1) overlayCtx.lineTo(points[i][0], points[i][1]);
          overlayCtx.closePath();
          const fallbackStyle = fallbackFootprintStyle(loadedFillAlpha, loadedStrokeAlpha);
          overlayCtx.fillStyle = p3dStyle
            ? p3dStyle.fill
            : roofColor
            ? `rgba(${roofColor[0]},${roofColor[1]},${roofColor[2]},${Math.max(0.76, loadedFillAlpha * 5.0).toFixed(3)})`
            : fallbackStyle.fill;
          overlayCtx.strokeStyle = p3dStyle
            ? p3dStyle.stroke
            : roofColor && worldKey !== "sakhal"
            ? `rgba(255,255,255,${loadedStrokeAlpha.toFixed(3)})`
            : fallbackStyle.stroke;
          overlayCtx.lineWidth = scale > 0.35 ? 1.2 : 1;
          overlayCtx.fill();
          overlayCtx.stroke();
          if (p3dPointAlpha > 0.01) {
            overlayCtx.beginPath();
            overlayCtx.arc(worldToScreenX(placement[P.x]), worldToScreenY(placement[P.z]), Math.max(1.8, Math.min(3.2, scale * 4.2)), 0, Math.PI * 2);
            overlayCtx.fillStyle = p3dPointFill(p3dPointAlpha);
            overlayCtx.fill();
          }
        }
      }

      if (showCenters.checked || scale < STARTUP_POINT_FADE_OUT_SCALE) {
        const startupPointAlpha = zoomFade(scale, STARTUP_POINT_SCALE, STARTUP_POINT_FADE_OUT_SCALE, 0.34, 0.96);
        overlayCtx.fillStyle = zoomedOutPointFill(startupPointAlpha);
        for (const placement of visiblePlacements) {
          if (isSuppressedControlledPlanePlacement(placement)) continue;
          if (scale < STARTUP_POINT_SCALE) continue;
          overlayCtx.beginPath();
          overlayCtx.arc(worldToScreenX(placement[P.x]), worldToScreenY(placement[P.z]), Math.max(1.2, Math.min(3.2, scale * 7)), 0, Math.PI * 2);
          overlayCtx.fill();
        }
      }

      if (showCenters.checked || scale < loadedPointFadeOutScale) {
        const loadedPointAlpha = zoomFade(scale, STARTUP_POINT_SCALE, loadedPointFadeOutScale, 0.38, 0.98);
        for (const placement of visibleLoaded) {
          if (isSuppressedControlledPlanePlacement(placement)) continue;
          const model = models[placement[P.modelId]] || null;
          const p3dStyle = loadedP3dStyle(model, loadedPointAlpha, loadedPointAlpha);
          overlayCtx.fillStyle = p3dStyle ? p3dStyle.point : zoomedOutPointFill(loadedPointAlpha);
          overlayCtx.beginPath();
          overlayCtx.arc(worldToScreenX(placement[P.x]), worldToScreenY(placement[P.z]), Math.max(1.4, Math.min(3.4, scale * 7)), 0, Math.PI * 2);
          overlayCtx.fill();
        }
      }

      if (showLabels.checked) {
        const dimLabelsForHighlights = !!(searchQuery || searchPathFilter);
        for (const location of locations) {
          const px = worldToScreenX(location.x);
          const py = worldToScreenY(location.z);
          if (px < -120 || px > overlayCanvas.width / devicePixelRatio + 120 || py < -80 || py > overlayCanvas.height / devicePixelRatio + 80) continue;
          const size = location.kind === "Capital" ? 17 : location.kind === "City" ? 14 : 12;
          const labelAlpha = dimLabelsForHighlights
            ? zoomFade(scale, STARTUP_POINT_SCALE, 0.22, 0.58, 0.88)
            : 0.95;
          if (scale * 480 < 12 && location.kind === "Village") continue;
          if (scale * 480 < 6 && location.kind === "City") continue;
          overlayCtx.beginPath();
          overlayCtx.arc(px, py, location.kind === "Capital" ? 4 : 3, 0, Math.PI * 2);
          overlayCtx.fillStyle = `rgba(255,246,188,${Math.min(0.95, labelAlpha + 0.05).toFixed(3)})`;
          overlayCtx.fill();
          overlayCtx.strokeStyle = `rgba(17,25,32,${Math.min(0.8, labelAlpha + 0.2).toFixed(3)})`;
          overlayCtx.lineWidth = 1;
          overlayCtx.stroke();
          overlayCtx.font = `600 ${size}px system-ui, sans-serif`;
          overlayCtx.textAlign = "left";
          overlayCtx.textBaseline = "middle";
          overlayCtx.lineWidth = Math.max(3, size / 5);
          overlayCtx.strokeStyle = `rgba(237,167,0,${Math.min(0.72, labelAlpha).toFixed(3)})`;
          overlayCtx.strokeText(location.name, px + 8, py - 1);
          overlayCtx.fillStyle = `rgba(23,35,43,${Math.min(0.95, labelAlpha + 0.18).toFixed(3)})`;
          overlayCtx.fillText(location.name, px + 8, py - 1);
        }
      }

      if (searchQuery || searchPathFilter) {
        const searchRingAlpha = scale >= STARTUP_FOOTPRINT_SCALE ? 0.9 : 0.72;
        overlayCtx.strokeStyle = `rgba(0,122,255,${searchRingAlpha.toFixed(2)})`;
        overlayCtx.lineWidth = scale >= STARTUP_FOOTPRINT_SCALE ? 2 : 1.6;
        for (const placement of visiblePlacements) {
          if (isSuppressedControlledPlanePlacement(placement)) continue;
          if (!searchLandModelIds.has(placement[P.modelId])) continue;
          overlayCtx.beginPath();
          overlayCtx.arc(worldToScreenX(placement[P.x]), worldToScreenY(placement[P.z]), Math.max(4.5, Math.min(8, scale * 12)), 0, Math.PI * 2);
          overlayCtx.stroke();
        }
        for (const placement of visibleLoaded) {
          if (isSuppressedControlledPlanePlacement(placement)) continue;
          if (!searchModelIds.has(placement[P.modelId])) continue;
          overlayCtx.beginPath();
          overlayCtx.arc(worldToScreenX(placement[P.x]), worldToScreenY(placement[P.z]), Math.max(4.5, Math.min(8, scale * 12)), 0, Math.PI * 2);
          overlayCtx.stroke();
        }
      }

      renderControlledPlaneEffect();
      renderPlaneRocketSight();
      renderPlaneRockets();

      const pinnedDrawPlacement = effectivePlacement(pinnedPlacement);
      const suppressPlaneSelectionRing = !!(
        controlledPlane &&
        pinnedPlacement &&
        pinnedPlacement === controlledPlane.sourcePlacement
      );
      if (pinnedDrawPlacement && !suppressPlaneSelectionRing) {
        overlayCtx.beginPath();
        overlayCtx.arc(worldToScreenX(pinnedDrawPlacement[P.x]), worldToScreenY(pinnedDrawPlacement[P.z]), 7, 0, Math.PI * 2);
        overlayCtx.strokeStyle = "rgba(220,38,38,0.95)";
        overlayCtx.lineWidth = 2;
        overlayCtx.stroke();
      }
      const hoverDrawPlacement = effectivePlacement(hoverPlacement);
      const suppressPlaneHoverRing = !!(
        controlledPlane &&
        hoverPlacement &&
        hoverPlacement === controlledPlane.sourcePlacement
      );
      if (hoverDrawPlacement && !suppressPlaneHoverRing) {
        overlayCtx.beginPath();
        overlayCtx.arc(worldToScreenX(hoverDrawPlacement[P.x]), worldToScreenY(hoverDrawPlacement[P.z]), 7, 0, Math.PI * 2);
        overlayCtx.strokeStyle = "rgba(255,244,127,0.98)";
        overlayCtx.lineWidth = 2;
        overlayCtx.stroke();
      }
    }

    function renderSelection() {
      selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
      if (!areaWorld) return;
      const selectionRect = {
        x: worldToScreenX(areaWorld.minX),
        y: worldToScreenY(areaWorld.maxZ),
        w: worldToScreenX(areaWorld.maxX) - worldToScreenX(areaWorld.minX),
        h: worldToScreenY(areaWorld.minZ) - worldToScreenY(areaWorld.maxZ),
      };
      selectionCtx.strokeStyle = "rgba(204,107,44,0.95)";
      selectionCtx.fillStyle = "rgba(204,107,44,0.15)";
      selectionCtx.lineWidth = 2;
      selectionCtx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      selectionCtx.fillRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    }

    function syncAreaModeUi() {
      areaMode.checked = isAreaMode;
      areaModeBtn.classList.toggle("is-active", isAreaMode);
      areaModeBtn.textContent = areaWorld && !isAreaMode ? "Deselect area" : "Select area";
      viewer.classList.toggle("area-mode", isAreaMode);
    }

    function updateHud() {
      loadedCountEl.textContent = (startupLandPlacements.length + loadedPlacements.length).toLocaleString();
      exportBtn.disabled = loadedPlacements.length === 0;
      clearAreaBtn.disabled = !areaWorld && loadedPlacements.length === 0;
      toggleLabelsBtn.textContent = showLabels.checked ? "Hide labels" : "Show labels";
      syncAreaModeUi();
      if (!areaWorld) {
        areaReadout.textContent = "none";
        chunkEstimateEl.textContent = "0";
        loadAreaBtn.disabled = true;
        copyAreaBtn.classList.add("is-hidden");
        downloadAreaBtn.classList.add("is-hidden");
        exportLocationsBtn.classList.add("is-hidden");
      } else {
        areaReadout.textContent = `x=${areaWorld.minX.toFixed(1)}..${areaWorld.maxX.toFixed(1)}, z=${areaWorld.minZ.toFixed(1)}..${areaWorld.maxZ.toFixed(1)}`;
        const estimate = objectManifest.chunks.filter((chunk) => !(chunk.maxX < areaWorld.minX || chunk.minX > areaWorld.maxX || chunk.maxZ < areaWorld.minZ || chunk.minZ > areaWorld.maxZ)).length;
        chunkEstimateEl.textContent = estimate.toString();
        loadAreaBtn.disabled = false;
        copyAreaBtn.classList.remove("is-hidden");
        downloadAreaBtn.classList.remove("is-hidden");
        exportLocationsBtn.classList.remove("is-hidden");
        copyAreaBtn.disabled = loadedPlacements.length === 0;
        downloadAreaBtn.disabled = loadedPlacements.length === 0;
        exportLocationsBtn.disabled = loadedPlacements.length === 0;
      }
      updateArcadeHud();
      updateHoverCard();
    }

    function pointInPolygon(point, polygon) {
      if (!Array.isArray(polygon) || polygon.length < 3) return false;
      let inside = false;
      const x = point.x;
      const y = point.y;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];
        const intersects = ((yi > y) !== (yj > y))
          && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
        if (intersects) inside = !inside;
      }
      return inside;
    }

    function render() {
      const now = performance.now();
      updateControlledShip(now);
      updateControlledPlane(now);
      lastRenderTime = now;
      renderTiles();
      renderOverlay();
      renderSelection();
      updateHud();
      if (controlledShip || controlledPlane) {
        scheduleRender();
      }
    }

    function nearestPlacement(point) {
      const wx = screenToWorldX(point.x);
      const wz = screenToWorldZ(point.y);
      const polygonCandidates = [];
      let best = null;
      let bestDist = Infinity;
      const radius = 18 / scale;
      const hoverBounds = {
        minX: wx - radius,
        maxX: wx + radius,
        minZ: wz - radius,
        maxZ: wz + radius,
      };
      for (const placement of placementsInBounds(startupLandGrid, hoverBounds)) {
        const candidatePlacement = effectivePlacement(placement);
        const polygon = objectFootprint(candidatePlacement, landModels);
        if (polygon && pointInPolygon(point, polygon)) {
          polygonCandidates.push(placement);
        }
        const dx = candidatePlacement[P.x] - wx;
        const dz = candidatePlacement[P.z] - wz;
        const dist = Math.hypot(dx, dz);
        if (dist < radius && dist < bestDist) {
          best = placement;
          bestDist = dist;
        }
      }
      for (const placement of placementsInBounds(loadedPlacementGrid, hoverBounds)) {
        const candidatePlacement = effectivePlacement(placement);
        const polygon = objectFootprint(candidatePlacement, models);
        if (polygon && pointInPolygon(point, polygon)) {
          polygonCandidates.push(placement);
        }
        const dx = candidatePlacement[P.x] - wx;
        const dz = candidatePlacement[P.z] - wz;
        const dist = Math.hypot(dx, dz);
        if (dist < radius && dist < bestDist) {
          best = placement;
          bestDist = dist;
        }
      }
      for (const controlledState of [controlledShip, controlledPlane]) {
        if (!controlledState) continue;
        const candidatePlacement = controlledPlacementInBounds(controlledState, hoverBounds);
        if (candidatePlacement) {
          const modelTable = candidatePlacement._modelTable === "land" ? landModels : models;
          const polygon = objectFootprint(candidatePlacement, modelTable);
          if (polygon && pointInPolygon(point, polygon)) {
            polygonCandidates.push(controlledState.sourcePlacement);
          }
          const dx = candidatePlacement[P.x] - wx;
          const dz = candidatePlacement[P.z] - wz;
          const dist = Math.hypot(dx, dz);
          if (dist < radius && dist < bestDist) {
            best = controlledState.sourcePlacement;
            bestDist = dist;
          }
        }
      }
      if (polygonCandidates.length) {
        let polygonBest = polygonCandidates[0];
        let polygonBestArea = Infinity;
        for (const placement of polygonCandidates) {
          const resolvedPlacement = effectivePlacement(placement);
          const modelTable = resolvedPlacement && resolvedPlacement._modelTable === "main" ? models : landModels;
          const polygon = objectFootprint(resolvedPlacement, modelTable);
          if (!polygon) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const [px, py] of polygon) {
            if (px < minX) minX = px;
            if (py < minY) minY = py;
            if (px > maxX) maxX = px;
            if (py > maxY) maxY = py;
          }
          const area = Math.max(1, (maxX - minX) * (maxY - minY));
          if (area < polygonBestArea) {
            polygonBestArea = area;
            polygonBest = placement;
          }
        }
        return polygonBest;
      }
      return best;
    }

    async function loadAreaObjects() {
      if (!areaWorld || !objectManifest) return;
      setAreaLoading(true);
      statusReadout.textContent = "loading area…";
      try {
        const chunks = objectManifest.chunks.filter((chunk) => !(chunk.maxX < areaWorld.minX || chunk.minX > areaWorld.maxX || chunk.maxZ < areaWorld.minZ || chunk.minZ > areaWorld.maxZ));
        const allPlacements = [];
        for (const chunk of chunks) {
          const chunkUrl = new URL(chunk.path, objectManifestBaseUrl).toString();
          let payload = chunkCache.get(chunkUrl);
          if (!payload) {
            payload = await loadJson(chunkUrl);
            chunkCache.set(chunkUrl, payload);
          }
          for (const placement of payload.placements || []) {
            if (placement[P.x] >= areaWorld.minX && placement[P.x] <= areaWorld.maxX && placement[P.z] >= areaWorld.minZ && placement[P.z] <= areaWorld.maxZ) {
              placement._modelTable = "main";
              allPlacements.push(placement);
            }
          }
        }
        loadedPlacements = allPlacements;
        loadedPlacementGrid = buildPlacementGrid(loadedPlacements);
        statusReadout.textContent = loadedPlacements.length ? `Loaded ${loadedPlacements.length.toLocaleString()} objects` : "";
        scheduleRender();
      } finally {
        setAreaLoading(false);
      }
    }

    function clearArea() {
      controlledShip = null;
      controlledPlane = null;
      areaRect = null;
      areaWorld = null;
      loadedPlacements = [];
      loadedPlacementGrid = new Map();
      setAreaLoading(false);
      hoverPlacement = null;
      hoverReadout.textContent = "none";
      statusReadout.textContent = "";
      scheduleRender();
    }

    function clearAreaSelection(keepLoadedPlacements = false) {
      areaRect = null;
      areaWorld = null;
      areaStart = null;
      panStart = null;
      if (!keepLoadedPlacements) {
        loadedPlacements = [];
        loadedPlacementGrid = new Map();
        setAreaLoading(false);
      }
      scheduleRender();
    }

    function resetAreaState() {
      controlledShip = null;
      controlledPlane = null;
      clearAreaSelection(false);
      isAreaMode = false;
      pinnedPlacement = null;
      hoverPlacement = null;
      hoverReadout.textContent = "none";
      setAreaLoading(false);
      statusReadout.textContent = "";
      scheduleRender();
    }

    function buildEditorSelectionPayload() {
      return loadedPlacements.map((placement) => {
        const model = getModel(placement[P.modelId]);
        const shapePath = model?.[M.shapePath] || "";
        const typeName = model?.[M.type] || "";
        const isP3D = !!shapePath && !typeName.startsWith("Land_");
        if (isP3D) {
          return {
            Type: shapePath,
            DisplayName: shapePath,
            Position: [placement[P.x], placement[P.y], placement[P.z]],
            Orientation: [placement[P.yaw], placement[P.pitch], placement[P.roll]],
            Scale: 1.0,
            AttachmentMap: {},
            Model: shapePath,
            Flags: 30
          };
        }
        const displayName = typeName || shapePath || "";
        return {
          Type: displayName,
          DisplayName: displayName,
          Position: [placement[P.x], placement[P.y], placement[P.z]],
          Orientation: [placement[P.yaw], placement[P.pitch], placement[P.roll]],
          Scale: 1.0,
          AttachmentMap: {},
          Model: shapePath || "",
          Flags: 30
        };
      });
    }

    function downloadSelection() {
      const payload = buildEditorSelectionPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${activeWorld.exportStem}_loaded_area_dayz_editor.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    function csvEscape(value) {
      const stringValue = String(value == null ? "" : value);
      if (/[",\r\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }

    function cleanExportName(model) {
      const typeName = String(model?.[M.type] || "").trim();
      if (typeName.startsWith("Land_")) return typeName;
      const shapePath = String(model?.[M.shapePath] || "").replace(/\\/g, "/");
      let basename = shapePath.split("/").pop() || "";
      basename = basename.replace(/^,+/, "").trim();
      if (!basename) return "";
      const lowered = basename.toLowerCase();
      if (lowered.startsWith("unknown") || basename.startsWith("*")) return "";
      return basename;
    }

    function buildSelectionLocationsCsv() {
      const header = [
        "name",
        "path",
        "x",
        "y",
        "z",
        "yaw",
        "pitch",
        "roll"
      ];
      const rows = loadedPlacements.map((placement) => {
        const model = getModel(placement[P.modelId]) || null;
        const cleanName = cleanExportName(model);
        if (!cleanName) return null;
        const shapePath = String(model?.[M.shapePath] || "");
        return [
          cleanName,
          shapePath,
          placement[P.x],
          placement[P.y],
          placement[P.z],
          placement[P.yaw],
          placement[P.pitch],
          placement[P.roll]
        ].map(csvEscape).join(",");
      }).filter(Boolean);
      return [header.join(","), ...rows].join("\r\n");
    }

    function downloadSelectionLocations() {
      const csvText = buildSelectionLocationsCsv();
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${activeWorld.exportStem}_loaded_area_locations.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    loadAreaBtn.addEventListener("click", loadAreaObjects);
    clearAreaBtn.addEventListener("click", clearArea);
    exportBtn.addEventListener("click", downloadSelection);
    [showTiles, showCenters, showFootprints, showLabels].forEach((input) => input.addEventListener("change", scheduleRender));

    viewer.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = eventPoint(event);
      const worldX = screenToWorldX(point.x);
      const worldZ = screenToWorldZ(point.y);
      const rawFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const factor = Math.max(WHEEL_ZOOM_FACTOR_MIN, Math.min(WHEEL_ZOOM_FACTOR_MAX, rawFactor));
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      offsetX = point.x - (worldX - bounds.minX) * scale;
      offsetY = point.y - (bounds.maxZ - worldZ) * scale;
      if (controlledPlane) {
        const altitudeRatio = Math.max(0, Math.min(1, (controlledPlane.altitude - PLANE_MIN_ALTITUDE) / Math.max(1, PLANE_ALTITUDE - PLANE_MIN_ALTITUDE)));
        controlledPlane.baseScale = scale / Math.max(0.2, 1 - PLANE_AIR_ZOOM_OUT * altitudeRatio);
      }
      scheduleRender();
    }, { passive: false });

    viewer.addEventListener("pointerdown", (event) => {
      pointerDownOnUi = !!(event.target && event.target.closest(".map-topbar"));
      if (pointerDownOnUi) {
        return;
      }
      const point = eventPoint(event);
      pointerDownPoint = point;
      if (isAreaMode) {
        areaStart = point;
        areaRect = { x: point.x, y: point.y, w: 0, h: 0 };
      } else {
        panStart = { x: point.x, y: point.y, offsetX, offsetY };
        viewer.classList.add("dragging");
      }
      viewer.setPointerCapture(event.pointerId);
    });

    viewer.addEventListener("pointermove", (event) => {
      const point = eventPoint(event);
      lastPointerPoint = point;
      if (panStart) {
        offsetX = panStart.offsetX + (point.x - panStart.x);
        offsetY = panStart.offsetY + (point.y - panStart.y);
        scheduleRender();
        return;
      }
      if (areaStart) {
        areaRect = {
          x: Math.min(areaStart.x, point.x),
          y: Math.min(areaStart.y, point.y),
          w: Math.abs(point.x - areaStart.x),
          h: Math.abs(point.y - areaStart.y),
        };
        areaWorld = {
          minX: screenToWorldX(areaRect.x),
          maxX: screenToWorldX(areaRect.x + areaRect.w),
          maxZ: screenToWorldZ(areaRect.y),
          minZ: screenToWorldZ(areaRect.y + areaRect.h),
        };
        scheduleRender();
        return;
      }
      scheduleHoverCheck(point);
    });

    viewer.addEventListener("pointerup", (event) => {
      if (pointerDownOnUi || (event.target && event.target.closest(".map-topbar"))) {
        pointerDownOnUi = false;
        panStart = null;
        pointerDownPoint = null;
        areaStart = null;
        viewer.classList.remove("dragging");
        return;
      }
      const hadAreaSelection = !!areaStart && !!areaWorld;
      const point = eventPoint(event);
      const clickDistance = pointerDownPoint ? Math.hypot(point.x - pointerDownPoint.x, point.y - pointerDownPoint.y) : Infinity;
      panStart = null;
      pointerDownPoint = null;
      pointerDownOnUi = false;
      areaStart = null;
      viewer.classList.remove("dragging");
      if (hadAreaSelection) {
        isAreaMode = false;
        loadAreaObjects();
      } else if (!isAreaMode && clickDistance <= 5) {
        pinnedPlacement = nearestPlacement(point);
        hoverPlacement = pinnedPlacement;
      }
      scheduleRender();
    });

    viewer.addEventListener("dblclick", (event) => {
      if (event.target && event.target.closest(".map-topbar")) return;
      const placement = nearestPlacement(eventPoint(event));
      event.preventDefault();
      if (isControllableShipPlacement(placement)) {
        activateControlledShip(placement);
        return;
      }
      if (isControllablePlanePlacement(placement)) {
        activateControlledPlane(placement);
      }
    });

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", (event) => {
      if (!controlledShip && !controlledPlane) return;
      if (event.code === "Escape") {
        event.preventDefault();
        releaseControlledShip();
        return;
      }
      if (controlledPlane && event.code === "Space") {
        if (!controlledShipKeys.Space) {
          controlledShipKeys.Space = true;
          fireControlledPlaneRocket();
        }
        event.preventDefault();
        return;
      }
      if (Object.prototype.hasOwnProperty.call(controlledShipKeys, event.code)) {
        controlledShipKeys[event.code] = true;
        event.preventDefault();
      }
    });
    window.addEventListener("keyup", (event) => {
      if (!controlledShip && !controlledPlane) return;
      if (Object.prototype.hasOwnProperty.call(controlledShipKeys, event.code)) {
        controlledShipKeys[event.code] = false;
        event.preventDefault();
      }
    });
    if (planeLaunchBtnEl) {
      planeLaunchBtnEl.addEventListener("click", () => {
        const candidates = controllablePlaneCandidates();
        if (!candidates.length) {
          statusReadout.textContent = "No controllable plane found on this map";
          return;
        }
        const randomPlacement = candidates[Math.floor(Math.random() * candidates.length)];
        activateControlledPlane(randomPlacement);
        if (controlledPlane && controlledPlane.runtimePlacement) {
          const runtimePlacement = controlledPlane.runtimePlacement;
          controlledPlane.baseScale = PLANE_LAUNCH_ZOOM;
          setViewScaleAroundCenter(PLANE_LAUNCH_ZOOM);
          centerViewOnWorld(runtimePlacement[P.x], runtimePlacement[P.z]);
          scheduleRender();
        }
      });
    }
    syncPlaneLaunchButtonVisibility();
    areaModeBtn.addEventListener("click", () => {
      if (areaWorld && !isAreaMode) {
        resetAreaState();
        return;
      }
      const nextEnabled = !isAreaMode;
      if (nextEnabled) {
        clearAreaSelection(false);
        isAreaMode = true;
        pinnedPlacement = null;
        statusReadout.textContent = "Area select enabled";
      } else {
        isAreaMode = false;
        areaRect = null;
        statusReadout.textContent = loadedPlacements.length
          ? `Loaded ${loadedPlacements.length.toLocaleString()} objects`
          : "";
      }
      scheduleRender();
    });
    copyAreaBtn.addEventListener("click", async () => {
      if (!loadedPlacements.length) return;
      const payload = buildEditorSelectionPayload();
      const copied = await copyTextToClipboard(JSON.stringify(payload, null, 2));
      statusReadout.textContent = copied
        ? `Copied ${payload.length.toLocaleString()} rows to clipboard`
        : "Clipboard copy failed";
    });
    hoverNameEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      focusHoveredObjectInParent();
    });
    hoverThumbLinkEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      postActiveObjectAction("link");
      flashThumbAction(hoverThumbLinkEl);
    });
    hoverThumbPinEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      postActiveObjectAction("pin");
      flashThumbAction(hoverThumbPinEl);
    });
    hoverThumbNameEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      postActiveObjectAction("name");
      flashThumbAction(hoverThumbNameEl);
    });
    hoverThumbEditorEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      postActiveObjectAction("editor");
      flashThumbAction(hoverThumbEditorEl);
    });
    hoverMetaEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isActivePlacementFiltered()) {
        clearParentObjectFilter();
      } else {
        const placement = activePlacement();
        if (placement) {
          pinnedPlacement = placement;
        }
        filterHoveredObjectInParent();
        scheduleRender();
      }
    });
    toggleLabelsBtn.addEventListener("click", () => {
      showLabels.checked = !showLabels.checked;
      scheduleRender();
    });
    downloadAreaBtn.addEventListener("click", downloadSelection);
    exportLocationsBtn.addEventListener("click", downloadSelectionLocations);
    resetViewBtn.addEventListener("click", () => {
      fitViewToBounds();
      render();
    });

    ["pointerdown", "pointerup", "pointermove", "click", "wheel"].forEach((eventName) => {
      if (!mapTopbarEl) return;
      mapTopbarEl.addEventListener(eventName, (event) => {
        event.stopPropagation();
      }, { passive: eventName === "wheel" ? false : true });
    });

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || !event.data || !event.data.type) return;
      if (event.data.type === "object-map-clear-selection") {
        pinnedPlacement = null;
        hoverPlacement = null;
        hoverReadout.textContent = "none";
        statusReadout.textContent = "";
        refreshSearchMatches([], "", "", "");
        return;
      }
      if (event.data.type !== "object-map-search-state") return;
      refreshSearchMatches(event.data.rows || [], event.data.query || "", event.data.pathFilter || "", event.data.mode || "");
    });

    Promise.all([
      loadJson(tileManifestUrl),
      loadJson(objectManifestUrl),
      Promise.resolve(null),
      loadJson(landManifestUrl),
      loadJson(locationsUrl),
    ]).then(async ([tileManifest, manifest, rawManifest, landPack, locs]) => {
      satPyramid = tileManifest;
      rawTileManifest = rawManifest || null;
      bounds = tileManifest.bounds;
      objectManifest = manifest;
      landManifest = landPack;
      locations = Array.isArray(locs)
        ? locs
        : (Array.isArray(locs?.locations) ? locs.locations : []);
      const modelPayload = await loadJson(new URL(objectManifest.modelsPath, objectManifestBaseUrl).toString());
      models = modelPayload.models || [];
      const landModelPayload = await loadJson(new URL(landManifest.modelsPath, landManifestBaseUrl).toString());
      landModels = landModelPayload.models || [];
      const landPlacementPayload = await loadJson(new URL(landManifest.allPlacementsPath, landManifestBaseUrl).toString());
      const startupPlacements = landPlacementPayload.placements || [];
      for (const placement of startupPlacements) placement._modelTable = "land";
      startupLandPlacements = startupPlacements;
      buildStartupLandGrid();
      syncPlaneLaunchButtonVisibility();
      refreshSearchMatches(searchRows, searchQuery, searchPathFilter, searchMode);
      tileCountEl.textContent = `${Math.pow(2, satPyramid.maxZoom)} x ${Math.pow(2, satPyramid.maxZoom)}`;
      packCountEl.textContent = objectManifest.counts.rows.toLocaleString();
      modelCountEl.textContent = `${objectManifest.counts.models.toLocaleString()} mixed / ${landManifest.counts.models.toLocaleString()} land`;
      statusReadout.textContent = "";
      syncThemeFromParent();
      setInterval(syncThemeFromParent, 1000);
      resizeCanvas(false);
      requestAnimationFrame(() => render());
      setTimeout(() => render(), 0);
      setTimeout(() => render(), 50);
      setTimeout(() => resizeCanvas(true), 120);
      setTimeout(() => resizeCanvas(true), 300);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          resizeCanvas(true);
        });
        resizeObserver.observe(viewer);
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => resizeCanvas(true)).catch(() => {});
      }
    }).catch((error) => {
      console.error(error);
      setAreaLoading(false);
      syncPlaneLaunchButtonVisibility();
      statusReadout.textContent = "Load failed";
    });
