// Touch Scroll Engine — Smooth touch-drag scrolling with momentum physics for all scrollable MapleStory UI containers
// Works seamlessly on mobile devices, tablets, touch laptops, iPads, and touch-screen monitors.

interface ActiveScrollState {
  container: HTMLElement;
  startX: number;
  startY: number;
  initialScrollLeft: number;
  initialScrollTop: number;
  prevX: number;
  prevY: number;
  prevTime: number;
  velocityX: number;
  velocityY: number;
  isDragging: boolean;
  canScrollX: boolean;
  canScrollY: boolean;
  identifier: number;
}

let activeScroll: ActiveScrollState | null = null;
let momentumRafId: number | null = null;

/**
 * Searches up the DOM tree from the touched element to find the nearest scrollable ancestor.
 */
export function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let curr = el;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    // Skip window dragging titlebars or drag handles
    if (curr.classList.contains("win-titlebar") || curr.classList.contains("win-drag")) {
      return null;
    }

    // Skip input fields, textareas, and select elements
    const tag = curr.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return null;
    }

    // Check if element has scrollable overflow
    const style = window.getComputedStyle(curr);
    const oy = style.overflowY;
    const ox = style.overflowX;

    const canScrollY = (oy === "auto" || oy === "scroll") && curr.scrollHeight > curr.clientHeight + 1;
    const canScrollX = (ox === "auto" || ox === "scroll") && curr.scrollWidth > curr.clientWidth + 1;

    if (canScrollY || canScrollX) {
      return curr;
    }

    curr = curr.parentElement;
  }
  return null;
}

/**
 * Stops any active momentum animation.
 */
function stopMomentum() {
  if (momentumRafId !== null) {
    cancelAnimationFrame(momentumRafId);
    momentumRafId = null;
  }
}

/**
 * Applies smooth exponential decay momentum scrolling on touch release.
 */
function applyMomentum(container: HTMLElement, vx: number, vy: number, canX: boolean, canY: boolean) {
  stopMomentum();

  // Convert px/ms to px/frame (~16ms) and clamp maximum speed
  let curVx = Math.max(-40, Math.min(40, vx * 16));
  let curVy = Math.max(-40, Math.min(40, vy * 16));

  const friction = 0.93; // MapleStory smooth damping

  function step() {
    curVx *= friction;
    curVy *= friction;

    let moved = false;

    if (canY && Math.abs(curVy) > 0.1) {
      const prevTop = container.scrollTop;
      container.scrollTop -= curVy;
      // If reached boundary, halt velocity in that direction
      if (container.scrollTop === prevTop) {
        curVy = 0;
      } else {
        moved = true;
      }
    }

    if (canX && Math.abs(curVx) > 0.1) {
      const prevLeft = container.scrollLeft;
      container.scrollLeft -= curVx;
      if (container.scrollLeft === prevLeft) {
        curVx = 0;
      } else {
        moved = true;
      }
    }

    if (moved && (Math.abs(curVy) > 0.1 || Math.abs(curVx) > 0.1)) {
      momentumRafId = requestAnimationFrame(step);
    } else {
      stopMomentum();
    }
  }

  momentumRafId = requestAnimationFrame(step);
}

/**
 * Initializes global touch scroll handling for all scrollable UIs.
 */
export function setupTouchScroll() {
  if (typeof window === "undefined") return;

  // Prevent multiple initializations (e.g. during Vite HMR)
  if ((window as any).__msTouchScrollInitialized) return;
  (window as any).__msTouchScrollInitialized = true;

  // 1. Touch Start
  window.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const target = touch.target as HTMLElement | null;
      if (!target) return;

      // Check if an item drag or skill drag is active
      if (document.querySelector(".drag-ghost") || target.classList.contains("dragging")) {
        return;
      }

      const container = findScrollableAncestor(target);
      if (!container) return;

      // Stop any ongoing inertia so user can "catch" the scroll
      stopMomentum();

      const style = window.getComputedStyle(container);
      const canY = (style.overflowY === "auto" || style.overflowY === "scroll") && container.scrollHeight > container.clientHeight + 1;
      const canX = (style.overflowX === "auto" || style.overflowX === "scroll") && container.scrollWidth > container.clientWidth + 1;

      activeScroll = {
        container,
        startX: touch.clientX,
        startY: touch.clientY,
        initialScrollLeft: container.scrollLeft,
        initialScrollTop: container.scrollTop,
        prevX: touch.clientX,
        prevY: touch.clientY,
        prevTime: performance.now(),
        velocityX: 0,
        velocityY: 0,
        isDragging: false,
        canScrollX: canX,
        canScrollY: canY,
        identifier: touch.identifier,
      };
    },
    { passive: true }
  );

  // 2. Touch Move
  window.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (!activeScroll) return;

      let touch: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeScroll.identifier) {
          touch = e.touches[i];
          break;
        }
      }
      if (!touch) return;

      const dx = touch.clientX - activeScroll.startX;
      const dy = touch.clientY - activeScroll.startY;

      // Threshold check to distinguish between a tap/click vs scroll drag
      if (!activeScroll.isDragging) {
        if (Math.hypot(dx, dy) > 5) {
          activeScroll.isDragging = true;
          activeScroll.container.classList.add("is-touch-scrolling");
        }
      }

      if (activeScroll.isDragging) {
        if (e.cancelable) {
          e.preventDefault(); // Prevent full window bounce or pull-to-refresh
        }

        const now = performance.now();
        const dt = Math.max(1, now - activeScroll.prevTime);

        // Instant velocity with smoothing
        const instVy = (touch.clientY - activeScroll.prevY) / dt;
        const instVx = (touch.clientX - activeScroll.prevX) / dt;
        activeScroll.velocityY = activeScroll.velocityY * 0.4 + instVy * 0.6;
        activeScroll.velocityX = activeScroll.velocityX * 0.4 + instVx * 0.6;

        activeScroll.prevX = touch.clientX;
        activeScroll.prevY = touch.clientY;
        activeScroll.prevTime = now;

        if (activeScroll.canScrollY) {
          activeScroll.container.scrollTop = activeScroll.initialScrollTop - dy;
        }
        if (activeScroll.canScrollX) {
          activeScroll.container.scrollLeft = activeScroll.initialScrollLeft - dx;
        }
      }
    },
    { passive: false }
  );

  // 3. Touch End / Touch Cancel
  const handleTouchEnd = (e: TouchEvent) => {
    if (!activeScroll) return;

    let touchFound = false;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeScroll.identifier) {
        touchFound = true;
        break;
      }
    }
    // Only finalize when the tracking finger is lifted
    if (touchFound) return;

    const { container, isDragging, velocityX, velocityY, canScrollX, canScrollY } = activeScroll;
    container.classList.remove("is-touch-scrolling");
    activeScroll = null;

    if (isDragging) {
      // Suppress accidental click on the tapped child element (button, slot, etc.) after dragging
      const cancelClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", cancelClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", cancelClick, { capture: true }), 100);

      // Launch inertial fling
      applyMomentum(container, velocityX, velocityY, canScrollX, canScrollY);
    }
  };

  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}
