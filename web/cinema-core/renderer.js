/**
 * Infrix Cinema — canonical scene renderer.
 *
 * This is THE single Cinema renderer. Every Cinema surface (standalone full,
 * Nexus-mounted, embed widget, portable proof) draws through this class; no
 * surface ships its own scene renderer. It draws the SceneGraph
 * (pkg/cinema/scene) on a Canvas 2D context with pan/zoom, node selection,
 * hover, animated edge particles, and a translucent ghost overlay.
 *
 * Moved here from tools/cinema-viewer/js/renderer.js as part of Priority 05
 * (one canonical Cinema product surface). The old path is a deprecation shim.
 *
 * Loaded as a classic script; attaches CinemaRenderer to window.InfrixCinema.
 */
(function (root) {
  'use strict';

class CinemaRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.sceneGraph = null;
        this.camera = { x: 0, y: 0, zoom: 1.0 };
        this.selectedNode = null;
        this.hoveredNode = null;
        this.hoveredEdge = null;
        this.animationFrame = null;
        this.ghostGraph = null;
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.particlePhase = 0;
        this.eventHandlers = new Map();
        this.frameCount = 0;
        this.lastFPSTime = (typeof performance !== 'undefined' ? performance.now() : 0);
        this.fps = 0;
        this.nodeEntryTimes = new Map();  // nodeId -> performance.now()
        this.edgeEntryTimes = new Map();  // "from→to" -> performance.now()

        // RUNBOOK-05 — DPR backing store (Task 2), dirty-flag loop (Task 4),
        // theme chrome (Task 5), reduced-motion (Task 8).
        this.dpr = 1; this.cssWidth = 0; this.cssHeight = 0;
        this._dirty = true; this._rafScheduled = false; this._paused = false; this._offscreen = false;

        // Task 3 — FPS HUD is debug-only (opt in via ?cinemaDebug=1 / window.__CINEMA_DEBUG__).
        this._debugHud = (typeof window !== 'undefined') && (
            window.__CINEMA_DEBUG__ === true ||
            (!!window.location && /[?&]cinemaDebug=1\b/.test(window.location.search || ''))
        );

        // Task 8 — honor prefers-reduced-motion on the canvas (CSS can't reach rAF).
        this._reducedMotion = false;
        if (typeof matchMedia !== 'undefined') {
            this._mql = matchMedia('(prefers-reduced-motion: reduce)');
            this._reducedMotion = this._mql.matches;
            this._mqlHandler = (e) => { this._reducedMotion = e.matches; this.requestRender(); };
            this._mql.addEventListener ? this._mql.addEventListener('change', this._mqlHandler)
                                       : this._mql.addListener(this._mqlHandler);
        }

        // Task 5 — theme chrome colors, resolved from inherited CSS tokens.
        this.theme = { bgTop: '#0a0a1a', bgBottom: '#0e0e24', edgeLabel: '#ffffff', gasLabel: '#f0a030', nodeLabel: '#cccccc', accent: '#5cd4e4' };
        this.readThemeColors();

        this.resizeCanvas();
        this._onResize = () => this.resizeCanvas();
        window.addEventListener('resize', this._onResize);
        this.setupInteraction();
        this.startAnimationLoop();

        // Task 4 — pause the loop when the tab is hidden or the canvas is off-screen.
        this._onVisibility = () => this.setPaused((typeof document !== 'undefined' && document.hidden) || this._offscreen);
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', this._onVisibility);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this._io = new IntersectionObserver((entries) => {
                this._offscreen = !(entries[0] && entries[0].isIntersecting);
                this.setPaused((typeof document !== 'undefined' && document.hidden) || this._offscreen);
            }, { threshold: 0.01 });
            this._io.observe(this.canvas);
        }
        // Task 5 — re-read tokens whenever the app theme attribute flips (no remount).
        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
            this._themeObserver = new MutationObserver(() => this.readThemeColors());
            this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }
    }

    resizeCanvas() {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const parent = this.canvas.parentElement || {};
        const w = parent.clientWidth || this.cssWidth || 0;
        const h = parent.clientHeight || this.cssHeight || 0;
        this.dpr = dpr;
        this.cssWidth = w;            // logical (CSS) px — ALL drawing + hit-testing uses these
        this.cssHeight = h;
        this.canvas.width = Math.round(w * dpr);   // device-px backing store (sharp on retina)
        this.canvas.height = Math.round(h * dpr);
        if (this.canvas.style) {
            this.canvas.style.width = w + 'px';    // keep the CSS box at logical size
            this.canvas.style.height = h + 'px';
        }
        this.requestRender();
    }

    // RUNBOOK-05 Task 5 — resolve the theme chrome colors from the inherited
    // CSS custom props (the canvas sits under .cinema-root which inherits the
    // app theme). Falls back to the dark Cinema palette when no DOM.
    readThemeColors() {
        const cs = (typeof getComputedStyle !== 'undefined') ? getComputedStyle(this.canvas) : null;
        const get = (name, fallback) => {
            const v = cs ? (cs.getPropertyValue(name) || '').trim() : '';
            return v || fallback;
        };
        this.theme = {
            bgTop:     get('--cinema-canvas-bg-top', '#0a0a1a'),
            bgBottom:  get('--cinema-canvas-bg-bottom', '#0e0e24'),
            edgeLabel: get('--cinema-edge-label', '#ffffff'),
            gasLabel:  get('--cinema-gas-label', '#f0a030'),
            nodeLabel: get('--cinema-node-label', '#cccccc'),
            accent:    get('--cinema-accent', '#5cd4e4'),
        };
        this.requestRender();
    }

    setPaused(paused) {
        if (paused === this._paused) return;
        this._paused = paused;
        if (!paused) this.requestRender();   // resume → repaint + reschedule if animating
    }

    setSceneGraph(graph) {
        const isFirst = !this.sceneGraph;
        const now = performance.now();

        // Track node entries for animation
        let nodes = graph.nodes || graph.Nodes || {};
        if (!Array.isArray(nodes)) nodes = Object.values(nodes);
        const currentNodeIds = new Set(nodes.map(n => n.id));
        currentNodeIds.forEach(id => {
            if (!this.nodeEntryTimes.has(id)) this.nodeEntryTimes.set(id, now);
        });
        for (const id of this.nodeEntryTimes.keys()) {
            if (!currentNodeIds.has(id)) this.nodeEntryTimes.delete(id);
        }

        // Track edge entries
        let edges = graph.edges || graph.Edges || {};
        if (!Array.isArray(edges)) edges = Object.values(edges);
        const currentEdgeKeys = new Set();
        (Array.isArray(edges) ? edges : Object.values(edges)).forEach(e => {
            currentEdgeKeys.add((e.fromNodeId || '') + '→' + (e.toNodeId || ''));
        });
        currentEdgeKeys.forEach(key => {
            if (!this.edgeEntryTimes.has(key)) this.edgeEntryTimes.set(key, now);
        });
        for (const key of this.edgeEntryTimes.keys()) {
            if (!currentEdgeKeys.has(key)) this.edgeEntryTimes.delete(key);
        }

        this.sceneGraph = graph;
        if (isFirst) this.fitToView();
        this.requestRender();
    }

    fitToView() {
        if (!this.sceneGraph) return;
        let nodes = this.sceneGraph.nodes || this.sceneGraph.Nodes || [];
        if (!Array.isArray(nodes)) nodes = Object.values(nodes);
        if (nodes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            if (!n.position) return;
            const r = (n.size || 10) + 20;
            if (n.position.x - r < minX) minX = n.position.x - r;
            if (n.position.y - r < minY) minY = n.position.y - r;
            if (n.position.x + r > maxX) maxX = n.position.x + r;
            if (n.position.y + r > maxY) maxY = n.position.y + r;
        });

        const graphW = maxX - minX || 1;
        const graphH = maxY - minY || 1;
        const padded = 0.85; // leave 15% padding
        const zoomX = (this.cssWidth * padded) / graphW;
        const zoomY = (this.cssHeight * padded) / graphH;
        this.camera.zoom = Math.min(zoomX, zoomY, 2.0);
        // Center on graph midpoint
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        this.camera.x = -cx * this.camera.zoom;
        this.camera.y = -cy * this.camera.zoom;
    }

    applyUpdate(update) {
        if (!this.sceneGraph) return;

        // Handle both camelCase and Go PascalCase field names
        const added = update.nodesAdded || update.NodesAdded || update.addedNodes || [];
        const removed = update.nodesRemoved || update.NodesRemoved || update.removedNodeIds || [];
        const addedEdges = update.edgesAdded || update.EdgesAdded || update.addedEdges || [];
        const removedEdges = update.edgesRemoved || update.EdgesRemoved || update.removedEdgeIds || [];

        // Ensure nodes is an object (map) -- the Go SceneGraph uses map[string]*SceneNode
        if (!this.sceneGraph.nodes) this.sceneGraph.nodes = {};
        if (Array.isArray(this.sceneGraph.nodes)) {
            // Convert array to map if needed
            const map = {};
            this.sceneGraph.nodes.forEach(n => { map[n.id || n.ID] = n; });
            this.sceneGraph.nodes = map;
        }

        added.forEach(n => { this.sceneGraph.nodes[n.id || n.ID] = n; });
        removed.forEach(id => { delete this.sceneGraph.nodes[id]; });

        if (!this.sceneGraph.edges) this.sceneGraph.edges = {};
        if (Array.isArray(this.sceneGraph.edges)) {
            const map = {};
            this.sceneGraph.edges.forEach(e => { map[e.id || e.ID] = e; });
            this.sceneGraph.edges = map;
        }

        addedEdges.forEach(e => { this.sceneGraph.edges[e.id || e.ID] = e; });
        removedEdges.forEach(id => { delete this.sceneGraph.edges[id]; });

        this.requestRender();
    }

    setGhostGraph(ghostGraph) {
        this.ghostGraph = ghostGraph;
        this.requestRender();
    }

    clearGhostGraph() {
        this.ghostGraph = null;
        this.requestRender();
    }

    resetView() {
        this.camera = { x: 0, y: 0, zoom: 1.0 };
        this.requestRender();
    }

    // RUNBOOK-05 Task 4 — on-demand rendering. Mark dirty + schedule a frame;
    // every mutator (setSceneGraph/applyUpdate/setGhostGraph/resetView/
    // resizeCanvas + interaction) calls this.
    requestRender() {
        this._dirty = true;
        if (this._rafScheduled || this._paused) return;
        if (typeof requestAnimationFrame === 'undefined') { this.render(); return; }
        this._rafScheduled = true;
        this.animationFrame = requestAnimationFrame(this._frame);
    }

    startAnimationLoop() {
        this._frame = () => {
            this._rafScheduled = false;
            if (this._paused) return;                       // hidden tab / off-screen
            const animating = this.needsContinuousAnimation();
            if (this._dirty || animating) {
                this._dirty = false;
                if (animating) this.particlePhase += 0.02;  // only advance time when needed
                this.render();
                if (this._debugHud) this.tickFps();
            }
            // Keep scheduling ONLY while a live animation is running; otherwise idle to 0.
            if (animating && !this._paused) {
                this._rafScheduled = true;
                this.animationFrame = requestAnimationFrame(this._frame);
            }
        };
        this.requestRender();   // first paint
    }

    // True while any time-driven visual is mid-flight (so we must keep ticking).
    // Reduced-motion (Task 8) short-circuits to a single static frame.
    needsContinuousAnimation() {
        if (this._reducedMotion) return false;
        const now = (typeof performance !== 'undefined') ? performance.now() : 0;
        for (const t of this.nodeEntryTimes.values()) if (now - t < 500) return true;
        for (const t of this.edgeEntryTimes.values()) if (now - t < 300) return true;
        const g = this.sceneGraph;
        if (!g) return false;
        let nodes = g.nodes || g.Nodes || [];
        if (!Array.isArray(nodes)) nodes = Object.values(nodes);
        for (const n of nodes) {
            if (n.quarantined || n.anomalyScore > 0 || n.breakerState || (n.glow || 0) > 0) return true;
        }
        let edges = g.edges || g.Edges || [];
        if (!Array.isArray(edges)) edges = Object.values(edges);
        for (const e of edges) if (e.animated) return true;
        return false;
    }

    tickFps() {
        this.frameCount++;
        const now = (typeof performance !== 'undefined') ? performance.now() : 0;
        if (now - this.lastFPSTime > 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFPSTime));
            this.frameCount = 0; this.lastFPSTime = now;
        }
    }

    render() {
        const { ctx, camera } = this;
        const w = this.cssWidth, h = this.cssHeight, dpr = this.dpr || 1;

        // RUNBOOK-05 Task 2 — map CSS px → device px for the whole frame (one
        // transform), so every draw call works in logical px and is crisp at any DPR.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // RUNBOOK-05 Task 5 — background from theme tokens (was hardcoded dark).
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, this.theme.bgTop);
        grad.addColorStop(1, this.theme.bgBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2 + camera.x, h / 2 + camera.y);
        ctx.scale(camera.zoom, camera.zoom);

        // Ghost overlay (translucent)
        if (this.ghostGraph) {
            ctx.globalAlpha = 0.25;
            this.drawGraph(this.ghostGraph, true);
            ctx.globalAlpha = 1.0;
        }

        // Main graph
        if (this.sceneGraph) {
            this.drawGraph(this.sceneGraph, false);
        }

        ctx.restore();
        this.drawHUD();
    }

    drawGraph(graph, isGhost) {
        const { ctx } = this;
        // Nodes/edges may be arrays or objects (Go maps serialize as JSON objects)
        let nodes = graph.nodes || graph.Nodes || [];
        let edges = graph.edges || graph.Edges || [];
        if (!Array.isArray(nodes)) nodes = Object.values(nodes);
        if (!Array.isArray(edges)) edges = Object.values(edges);

        // Index nodes by ID for edge lookup
        const nodeMap = new Map();
        nodes.forEach(n => nodeMap.set(n.id, n));

        // Aggregate edges between same node pairs for traffic visualization
        const edgeTraffic = {};  // "from→to" → { count, totalGas, latestLabel, animated, color }
        edges.forEach(edge => {
            const key = (edge.fromNodeId || '') + '→' + (edge.toNodeId || '');
            if (!edgeTraffic[key]) {
                edgeTraffic[key] = { count: 0, totalGas: 0, label: '', animated: false, color: null, fromId: edge.fromNodeId, toId: edge.toNodeId };
            }
            edgeTraffic[key].count++;
            edgeTraffic[key].totalGas += (edge.gasCost || 0);
            edgeTraffic[key].label = edge.label || edge.function || edgeTraffic[key].label;
            if (edge.animated) edgeTraffic[key].animated = true;
            if (edge.color) edgeTraffic[key].color = edge.color;
        });

        // Draw aggregated edges -- one line per pair, thickness = traffic volume
        const now_e = performance.now();
        Object.values(edgeTraffic).forEach(traffic => {
            const from = nodeMap.get(traffic.fromId);
            const to = nodeMap.get(traffic.toId);
            if (!from || !to) return;
            if (!from.position || !to.position) return;

            // Edge entry animation (300ms grow from source to target)
            const edgeKey = (traffic.fromId || '') + '→' + (traffic.toId || '');
            const edgeEntry = this.edgeEntryTimes.get(edgeKey) || 0;
            const edgeAge = now_e - edgeEntry;
            const edgeT = Math.min(1, edgeAge / 300);

            const c = traffic.color || { r: 100, g: 150, b: 255, a: 200 };

            // Edge thickness grows with call count (min 2, max 12)
            const thickness = Math.min(12, 2 + traffic.count * 1.5);

            // Interpolated endpoint for entry animation
            const tx = from.position.x + (to.position.x - from.position.x) * edgeT;
            const ty = from.position.y + (to.position.y - from.position.y) * edgeT;

            // Edge glow based on traffic
            const glowSize = thickness + 6;
            ctx.beginPath();
            ctx.moveTo(from.position.x, from.position.y);
            ctx.lineTo(tx, ty);
            ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${0.15 * edgeT})`;
            ctx.lineWidth = glowSize;
            ctx.stroke();

            // Main edge line
            ctx.beginPath();
            ctx.moveTo(from.position.x, from.position.y);
            ctx.lineTo(tx, ty);
            ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${0.7 * edgeT})`;
            ctx.lineWidth = thickness;
            ctx.stroke();

            // Edge label with call count
            const midX = (from.position.x + to.position.x) / 2;
            const midY = (from.position.y + to.position.y) / 2 - thickness - 6;
            ctx.fillStyle = this.theme.edgeLabel;   // RUNBOOK-05 Task 5 (was '#fff')
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            const callLabel = traffic.count > 1
                ? `${traffic.label} (×${traffic.count})`
                : traffic.label;
            ctx.fillText(callLabel, midX, midY);

            // Gas cost label
            if (traffic.totalGas > 0) {
                ctx.fillStyle = this.theme.gasLabel;  // RUNBOOK-05 Task 5 (was '#f0a030')
                ctx.font = '9px monospace';
                ctx.fillText(`${traffic.totalGas.toLocaleString()} gas`, midX, midY + 14);
            }

            // Animated particles -- more particles for higher traffic
            if (traffic.animated && !isGhost) {
                const particleEdge = {
                    particleCount: Math.min(8, 2 + traffic.count),
                    particleSpeed: 1.5 + traffic.count * 0.3,
                    particleSize: Math.min(7, 3 + traffic.count * 0.5),
                };
                this.drawFlowParticle(from.position, to.position, particleEdge, c);
            }
        });

        // Count incoming edges per node for activity-based sizing
        const nodeActivity = {};
        Object.values(edgeTraffic).forEach(t => {
            nodeActivity[t.toId] = (nodeActivity[t.toId] || 0) + t.count;
            nodeActivity[t.fromId] = (nodeActivity[t.fromId] || 0) + t.count;
        });

        // Store computed data for hit testing and details panel
        if (!isGhost) {
            this._edgeTraffic = edgeTraffic;
            this._nodeActivity = nodeActivity;
            this._nodeMap = nodeMap;
        }

        // Draw nodes
        const now = performance.now();
        nodes.forEach(node => {
            if (!node.position) return;
            const activity = nodeActivity[node.id] || 0;

            // Entry animation (500ms scale-up + fade-in)
            const entryTime = this.nodeEntryTimes.get(node.id) || 0;
            const entryAge = now - entryTime;
            const entryT = Math.min(1, entryAge / 500);
            // Ease-out-back for overshoot bounce: t * (2.7*t - 1.7)
            const entryScale = entryT < 1 ? entryT * (2.7 * entryT * entryT - 1.7 * entryT + 1) : 1;
            const entryAlpha = Math.min(1, entryT * 2);

            // Pulse effect: size oscillates based on activity + time (frozen under reduced-motion)
            const pulseAmount = (activity > 0 && !this._reducedMotion) ? Math.sin(this.particlePhase * 3) * (2 + activity * 0.5) : 0;
            const activityBonus = Math.min(15, activity * 2);
            const baseSize = (node.size || 10) + activityBonus;
            const radius = (baseSize + pulseAmount) * entryScale * (this.selectedNode === node.id ? 1.3 : 1.0);

            const c = node.color || { r: 80, g: 200, b: 120, a: 255 };
            const alpha = (node.opacity || 1) * (c.a || 255) / 255 * entryAlpha;

            // Quarantine shake offset (frozen under reduced-motion — Task 8)
            let sx = 0, sy = 0;
            if (node.quarantined && !isGhost && !this._reducedMotion) {
                sx = 3 * Math.sin(this.particlePhase * 20) * Math.cos(this.particlePhase * 7);
                sy = 3 * Math.sin(this.particlePhase * 23) * Math.sin(this.particlePhase * 11);
            }
            const nx = node.position.x + sx;
            const ny = node.position.y + sy;

            // Anomaly glow (pulsing red radial gradient)
            if (node.anomalyScore > 0 && !isGhost) {
                const glowR = radius + 20 * node.anomalyScore;
                const ga = 0.25 + 0.15 * Math.sin(this.particlePhase * 4);
                const grad = ctx.createRadialGradient(nx, ny, radius, nx, ny, glowR);
                grad.addColorStop(0, `rgba(255,87,34,${ga})`);
                grad.addColorStop(1, 'rgba(255,87,34,0)');
                ctx.beginPath();
                ctx.arc(nx, ny, glowR, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
            }

            // Circuit breaker ring
            if (node.breakerState && !isGhost) {
                const ringR = radius + 6;
                let ringColor, ringPulse;
                if (node.breakerState === 'throttled') {
                    ringPulse = 0.4 + 0.3 * Math.sin(this.particlePhase * 2);
                    ringColor = `rgba(255,193,7,${ringPulse})`;
                } else if (node.breakerState === 'paused') {
                    ringPulse = 0.5 + 0.3 * Math.sin(this.particlePhase * 4);
                    ringColor = `rgba(255,152,0,${ringPulse})`;
                } else if (node.breakerState === 'frozen') {
                    ringPulse = 0.6 + 0.4 * Math.abs(Math.sin(this.particlePhase * 8));
                    ringColor = `rgba(244,67,54,${ringPulse})`;
                }
                if (ringColor) {
                    ctx.beginPath();
                    ctx.arc(nx, ny, ringR, 0, Math.PI * 2);
                    ctx.strokeStyle = ringColor;
                    ctx.lineWidth = 3;
                    ctx.setLineDash([4, 4]);
                    ctx.lineDashOffset = this.particlePhase * 20;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Activity glow ring
            const glow = node.glow || 0;
            if (activity > 0 || glow > 0) {
                const glowRadius = radius + 8 + activity * 2;
                const glowAlpha = Math.min(0.4, 0.1 + activity * 0.05 + glow * 0.3) * entryAlpha;
                ctx.beginPath();
                ctx.arc(nx, ny, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${glowAlpha})`;
                ctx.fill();
            }

            // Hover/select glow
            if (this.hoveredNode === node.id || this.selectedNode === node.id) {
                ctx.beginPath();
                ctx.arc(nx, ny, radius + 6, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.2)`;
                ctx.fill();
            }

            // Node shape — full 12-shape vocabulary (RUNBOOK-05 Task 6)
            ctx.beginPath();
            this.tracePath(ctx, node.shape, nx, ny, radius);
            ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
            ctx.fill();

            // Plan nodes get dashed borders
            if (node.kind === 'plan_timeline' || node.kind === 'plan_step') {
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${Math.min(alpha + 0.4, 1)})`;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${Math.min(alpha + 0.3, 1)})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Quarantine dashed border — shape-correct outline (RUNBOOK-05 Task 6)
            if (node.quarantined) {
                ctx.beginPath();
                this.tracePath(ctx, node.shape, nx, ny, radius + 3);
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Lock glyph for redacted/encrypted (disclosure-aware) nodes
            if ((node.redacted || node.zkIndicator) && !isGhost) {
                ctx.fillStyle = `rgba(230,230,240,${entryAlpha})`;
                ctx.font = `${Math.max(10, radius)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\u{1F512}', nx, ny); // 🔒
                ctx.textBaseline = 'alphabetic';
            }

            // Label — theme node-label color, entry-fade via globalAlpha (Task 5)
            if (node.label && entryAlpha > 0.5) {
                ctx.save();
                ctx.globalAlpha = entryAlpha;
                ctx.fillStyle = this.theme.nodeLabel;
                ctx.font = `${Math.max(9, 10 / this.camera.zoom)}px monospace`;
                ctx.textAlign = 'center';
                const label = node.label.length > 20 ? node.label.slice(0, 18) + '..' : node.label;
                ctx.fillText(label, nx, ny + radius + 14);
                ctx.restore();
            }
        });
    }

    drawFlowParticle(from, to, edge, color) {
        const count = edge.particleCount || 3;
        const speed = edge.particleSpeed || 2;
        const size = edge.particleSize || 5;

        for (let i = 0; i < count; i++) {
            const t = ((this.particlePhase * speed + i / count) % 1);
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;

            // Outer glow
            this.ctx.beginPath();
            this.ctx.arc(x, y, size + 4, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},0.2)`;
            this.ctx.fill();

            // Inner bright particle
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255,255,255,0.9)`;
            this.ctx.fill();

            // Core color
            this.ctx.beginPath();
            this.ctx.arc(x, y, size - 1, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},1.0)`;
            this.ctx.fill();
        }
    }

    drawHexagon(ctx, x, y, r) {
        ctx.moveTo(x + r, y);
        for (let i = 1; i <= 6; i++) {
            const angle = (Math.PI / 3) * i;
            ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
        }
        ctx.closePath();
    }

    drawDiamond(ctx, x, y, r) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
    }

    // RUNBOOK-05 Task 6 — the 8 remaining vocabulary shapes (the caller did
    // ctx.beginPath() and will fill()/stroke()).
    drawShield(ctx, x, y, r) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.85, y - r * 0.5);
        ctx.lineTo(x + r * 0.85, y + r * 0.25);
        ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.9, x, y + r);
        ctx.quadraticCurveTo(x - r * 0.85, y + r * 0.9, x - r * 0.85, y + r * 0.25);
        ctx.lineTo(x - r * 0.85, y - r * 0.5);
        ctx.closePath();
    }
    drawGate(ctx, x, y, r) {                       // archway / approval gate
        const w = r * 1.5, h = r * 1.4;
        ctx.moveTo(x - w / 2, y + h / 2);
        ctx.lineTo(x - w / 2, y - h / 4);
        ctx.quadraticCurveTo(x, y - h, x + w / 2, y - h / 4);
        ctx.lineTo(x + w / 2, y + h / 2);
        ctx.closePath();
    }
    drawDocument(ctx, x, y, r) {                    // page with a folded corner
        const w = r * 1.3, h = r * 1.6, f = r * 0.5;
        ctx.moveTo(x - w / 2, y - h / 2);
        ctx.lineTo(x + w / 2 - f, y - h / 2);
        ctx.lineTo(x + w / 2, y - h / 2 + f);
        ctx.lineTo(x + w / 2, y + h / 2);
        ctx.lineTo(x - w / 2, y + h / 2);
        ctx.closePath();
    }
    drawArrow(ctx, x, y, r) {                       // right-pointing intent arrow
        const w = r * 1.6, h = r * 1.1;
        ctx.moveTo(x - w / 2, y - h / 4);
        ctx.lineTo(x + w / 6, y - h / 4);
        ctx.lineTo(x + w / 6, y - h / 2);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 6, y + h / 2);
        ctx.lineTo(x + w / 6, y + h / 4);
        ctx.lineTo(x - w / 2, y + h / 4);
        ctx.closePath();
    }
    drawPolygon(ctx, x, y, r, sides, rot) {         // n-gon (octagon=8, pentagon=5)
        const a0 = (rot == null ? -Math.PI / 2 : rot);
        ctx.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0));
        for (let i = 1; i <= sides; i++) {
            const a = a0 + (2 * Math.PI / sides) * i;
            ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        ctx.closePath();
    }
    drawStar(ctx, x, y, r) {                         // 5-point star
        const inner = r * 0.45;
        for (let i = 0; i < 10; i++) {
            const rad = (i % 2 === 0) ? r : inner;
            const a = -Math.PI / 2 + (Math.PI / 5) * i;
            const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    drawGauge(ctx, x, y, r) {                         // 3/4 arc dial (gas meter)
        ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 0.25);
    }

    // Single dispatch used by both the node fill and the quarantine re-stroke so
    // all 12 shapes (and their outlines) agree.
    tracePath(ctx, shape, nx, ny, radius) {
        switch (shape) {
            case 'hexagon':   this.drawHexagon(ctx, nx, ny, radius); break;
            case 'diamond':   this.drawDiamond(ctx, nx, ny, radius); break;
            case 'shield':    this.drawShield(ctx, nx, ny, radius); break;
            case 'gate':      this.drawGate(ctx, nx, ny, radius); break;
            case 'document':  this.drawDocument(ctx, nx, ny, radius); break;
            case 'arrow':     this.drawArrow(ctx, nx, ny, radius); break;
            case 'octagon':   this.drawPolygon(ctx, nx, ny, radius, 8, -Math.PI / 8); break;
            case 'pentagon':  this.drawPolygon(ctx, nx, ny, radius, 5); break;
            case 'star':      this.drawStar(ctx, nx, ny, radius); break;
            case 'gauge':     this.drawGauge(ctx, nx, ny, radius); break;
            case 'rectangle': ctx.rect(nx - radius, ny - radius * 0.6, radius * 2, radius * 1.2); break;
            case 'circle':
            default:          ctx.arc(nx, ny, radius, 0, Math.PI * 2); break;
        }
    }

    drawHUD() {
        // RUNBOOK-05 Task 3 — debug-only FPS counter (opt in: ?cinemaDebug=1).
        if (!this._debugHud) return;
        this.ctx.fillStyle = '#444';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.fps} FPS`, 8, 14);
    }

    // RUNBOOK-05 Task 9 — unified Pointer Events (mouse/touch/pen) with one-finger
    // pan + two-finger pinch-zoom. Each state change calls requestRender() so the
    // dirty-flag loop (Task 4) repaints on demand.
    setupInteraction() {
        const c = this.canvas;
        if (c.style) c.style.touchAction = 'none';   // we own pan/zoom; stop page scroll
        this._pointers = new Map();                  // pointerId → {x,y}
        this._pinchDist = 0;

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this.camera.zoom = Math.max(0.05, Math.min(20, this.camera.zoom * factor));
            this.requestRender();
        }, { passive: false });

        c.addEventListener('pointerdown', (e) => {
            try { c.setPointerCapture(e.pointerId); } catch (_) {}
            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this._pointers.size === 1) {
                this.isDragging = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                const node = this.hitTestNode(e.clientX, e.clientY);
                this.selectedNode = node ? node.id : null;
                if (node) this.emit('nodeSelected', node);
                this.requestRender();
            } else if (this._pointers.size === 2) {
                this.isDragging = false;                 // second pointer → pinch, not pan
                this._pinchDist = this._twoPointerDist();
            }
        });

        c.addEventListener('pointermove', (e) => {
            if (!this._pointers.has(e.pointerId)) {       // hover (mouse only)
                const node = this.hitTestNode(e.clientX, e.clientY);
                const id = node ? node.id : null;
                if (id !== this.hoveredNode) { this.hoveredNode = id; this.requestRender(); }
                if (node) { this.hoveredEdge = null; this.emit('nodeHovered', node); }
                else { const edge = this.hitTestEdge(e.clientX, e.clientY); this.hoveredEdge = edge; if (edge) this.emit('edgeHovered', edge); }
                return;
            }
            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this._pointers.size === 2) {              // pinch-zoom
                const dist = this._twoPointerDist();
                if (this._pinchDist > 0) {
                    const factor = dist / this._pinchDist;
                    this.camera.zoom = Math.max(0.05, Math.min(20, this.camera.zoom * factor));
                }
                this._pinchDist = dist;
                this.requestRender();
            } else if (this.isDragging) {                 // single-pointer pan
                this.camera.x += e.clientX - this.lastMouse.x;
                this.camera.y += e.clientY - this.lastMouse.y;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.requestRender();
            }
        });

        const endPointer = (e) => {
            this._pointers.delete(e.pointerId);
            try { c.releasePointerCapture(e.pointerId); } catch (_) {}
            if (this._pointers.size < 2) this._pinchDist = 0;
            if (this._pointers.size === 0) this.isDragging = false;
            else if (this._pointers.size === 1) {         // lifted one finger of a pinch → resume pan
                const [p] = this._pointers.values();
                this.isDragging = true; this.lastMouse = { x: p.x, y: p.y };
            }
        };
        c.addEventListener('pointerup', endPointer);
        c.addEventListener('pointercancel', endPointer);
        c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.isDragging = false; });
    }

    _twoPointerDist() {
        const [a, b] = [...this._pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    hitTestNode(clientX, clientY) {
        if (!this.sceneGraph || !this.sceneGraph.nodes) return null;
        const rect = this.canvas.getBoundingClientRect();
        const cx = (clientX - rect.left - this.cssWidth / 2 - this.camera.x) / this.camera.zoom;
        const cy = (clientY - rect.top - this.cssHeight / 2 - this.camera.y) / this.camera.zoom;

        let nodes = this.sceneGraph.nodes;
        if (!Array.isArray(nodes)) nodes = Object.values(nodes);
        for (const node of nodes) {
            if (!node.position) continue;
            const dx = cx - node.position.x;
            const dy = cy - node.position.y;
            const r = (node.size || 10) + 5;
            if (dx * dx + dy * dy <= r * r) return node;
        }
        return null;
    }

    hitTestEdge(clientX, clientY) {
        if (!this._edgeTraffic || !this._nodeMap) return null;
        const rect = this.canvas.getBoundingClientRect();
        const mx = (clientX - rect.left - this.cssWidth / 2 - this.camera.x) / this.camera.zoom;
        const my = (clientY - rect.top - this.cssHeight / 2 - this.camera.y) / this.camera.zoom;
        const threshold = 10 / this.camera.zoom;

        let closest = null, closestDist = threshold;
        for (const traffic of Object.values(this._edgeTraffic)) {
            const from = this._nodeMap.get(traffic.fromId);
            const to = this._nodeMap.get(traffic.toId);
            if (!from || !to || !from.position || !to.position) continue;

            const d = this._distToSegment(mx, my,
                from.position.x, from.position.y,
                to.position.x, to.position.y);
            if (d < closestDist) {
                closestDist = d;
                closest = traffic;
            }
        }
        return closest;
    }

    _distToSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
    }

    getNodeStats(nodeId) {
        const activity = this._nodeActivity ? (this._nodeActivity[nodeId] || 0) : 0;
        let inbound = 0, outbound = 0, totalGas = 0;
        if (this._edgeTraffic) {
            Object.values(this._edgeTraffic).forEach(t => {
                if (t.toId === nodeId) { inbound += t.count; totalGas += t.totalGas; }
                if (t.fromId === nodeId) { outbound += t.count; totalGas += t.totalGas; }
            });
        }
        return { activity, inbound, outbound, totalGas };
    }

    on(event, callback) {
        if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
        this.eventHandlers.get(event).push(callback);
    }

    emit(event, data) {
        (this.eventHandlers.get(event) || []).forEach(cb => cb(data));
    }

    getStats() {
        let nodeCount = 0, edgeCount = 0;
        if (this.sceneGraph) {
            const n = this.sceneGraph.nodes || this.sceneGraph.Nodes;
            const e = this.sceneGraph.edges || this.sceneGraph.Edges;
            nodeCount = n ? (Array.isArray(n) ? n.length : Object.keys(n).length) : 0;
            edgeCount = e ? (Array.isArray(e) ? e.length : Object.keys(e).length) : 0;
        }
        return { nodes: nodeCount, edges: edgeCount, fps: this.fps, zoom: this.camera.zoom.toFixed(2) };
    }

    destroy() {
        // RUNBOOK-05 Task 4 — actually unwind: stop the loop and remove every
        // listener/observer (the resize handler was an un-removable anonymous
        // arrow before — F10 leak, compounded by Nexus remounting on every intent).
        if (this.animationFrame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.animationFrame);
        this._rafScheduled = false;
        this._paused = true;
        if (this._onResize && typeof window !== 'undefined') window.removeEventListener('resize', this._onResize);
        if (this._onVisibility && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
        if (this._io) { this._io.disconnect(); this._io = null; }
        if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
        if (this._mql && this._mqlHandler) {
            this._mql.removeEventListener
                ? this._mql.removeEventListener('change', this._mqlHandler)
                : this._mql.removeListener(this._mqlHandler);
        }
    }
}

  const ns = (root.InfrixCinema = root.InfrixCinema || {});
  ns.CinemaRenderer = CinemaRenderer;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CinemaRenderer };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
