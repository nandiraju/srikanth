const canvas = document.getElementById("parallax-canvas");
const context = canvas.getContext("2d", { alpha: false });
const progressBar = document.getElementById("progress-bar");
const loader = document.getElementById("loader");
const mainContent = document.getElementById("main-content");

const FRAME_COUNT = 192;
const BG_HEX = "#050505";
const MAX_BACKGROUND_CONCURRENCY = 6;
const LOADER_FAILSAFE_MS = 4500;

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobileSource = window.matchMedia("(max-width: 768px)").matches;
const frameDir = isMobileSource ? "asset/nsri_frames_mobile" : "asset/nsri_frames";

const frameUrl = (oneBasedIndex) =>
  `${frameDir}/frame_${String(oneBasedIndex).padStart(4, "0")}.webp`;

const images = new Array(FRAME_COUNT);
const loadedFlags = new Uint8Array(FRAME_COUNT);
const state = { frame: 0 };

let isUnlocked = false;
let renderQueued = false;
let lastViewportWidth = 0;
let lastViewportHeight = 0;
let resizeRafId = 0;

// Build critical Phase-1 frame indices (0-based):
// First 10 frames for instant top-of-page scroll + every 12th keyframe across the timeline (26 frames total)
function buildCriticalIndices() {
  const set = new Set();
  for (let i = 0; i < 10 && i < FRAME_COUNT; i++) {
    set.add(i);
  }
  for (let frameNum = 12; frameNum <= FRAME_COUNT; frameNum += 12) {
    set.add(frameNum - 1);
  }
  set.add(FRAME_COUNT - 1);
  return Array.from(set).sort((a, b) => a - b);
}

function updateProgressUI(completed, total) {
  const pct = Math.min(100, Math.round((completed / total) * 100));
  progressBar.style.width = `${pct}%`;
  progressBar.setAttribute("aria-valuenow", String(pct));
}

function loadSingleFrame(zeroBasedIndex) {
  return new Promise((resolve) => {
    if (loadedFlags[zeroBasedIndex] && images[zeroBasedIndex]) {
      resolve(images[zeroBasedIndex]);
      return;
    }

    const img = new Image();
    img.decoding = "async";
    images[zeroBasedIndex] = img;

    img.onload = () => {
      loadedFlags[zeroBasedIndex] = 1;
      resolve(img);
    };
    img.onerror = () => {
      console.warn(`Failed to load frame: ${img.src}`);
      resolve(null);
    };

    img.src = frameUrl(zeroBasedIndex + 1);
  });
}

function getBestLoadedImage(targetIndex) {
  const clamped = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(targetIndex)));
  if (loadedFlags[clamped]) {
    return images[clamped];
  }
  for (let offset = 1; offset < FRAME_COUNT; offset++) {
    const prev = clamped - offset;
    if (prev >= 0 && loadedFlags[prev]) {
      return images[prev];
    }
    const next = clamped + offset;
    if (next < FRAME_COUNT && loadedFlags[next]) {
      return images[next];
    }
  }
  return null;
}

function updateCanvasDimensions(force = false) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Ignore small mobile URL-bar vertical shifts while scrolling
  if (
    !force &&
    vw <= 768 &&
    vw === lastViewportWidth &&
    Math.abs(vh - lastViewportHeight) < 130
  ) {
    return false;
  }

  lastViewportWidth = vw;
  lastViewportHeight = vh;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(vw * dpr));
  canvas.height = Math.max(1, Math.round(vh * dpr));
  return true;
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  const img = getBestLoadedImage(state.frame);
  if (!img || !img.naturalWidth) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const canvasRatio = cw / ch;
  const imgRatio = img.naturalWidth / img.naturalHeight;

  context.fillStyle = BG_HEX;
  context.fillRect(0, 0, cw, ch);

  if (canvasRatio < 0.85) {
    // Portrait mobile framing: keep Srikanth + campus signs visible in upper 65%
    // and smoothly vignette into #050505 behind the bottom glass card
    const drawHeight = Math.round(ch * 0.65);
    const drawWidth = Math.round(drawHeight * imgRatio);
    const offsetX = Math.round((cw - drawWidth) / 2);
    const offsetY = 0;

    context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

    const fadeHeight = Math.round(drawHeight * 0.26);
    const fadeStart = drawHeight - fadeHeight;
    const grad = context.createLinearGradient(0, fadeStart, 0, drawHeight + 2);
    grad.addColorStop(0, "rgba(5, 5, 5, 0)");
    grad.addColorStop(1, BG_HEX);
    context.fillStyle = grad;
    context.fillRect(0, fadeStart, cw, fadeHeight + 4);
  } else {
    let drawWidth, drawHeight, offsetX, offsetY;
    if (canvasRatio > imgRatio) {
      drawWidth = cw;
      drawHeight = cw / imgRatio;
      offsetX = 0;
      offsetY = (ch - drawHeight) / 2;
    } else {
      drawWidth = ch * imgRatio;
      drawHeight = ch;
      offsetX = (cw - drawWidth) / 2;
      offsetY = 0;
    }
    context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }
}

function hideLoaderAndReveal() {
  updateProgressUI(1, 1);
  loader.style.opacity = "0";
  loader.style.pointerEvents = "none";
  mainContent.style.opacity = "1";
  setTimeout(() => {
    loader.style.display = "none";
  }, 650);
}

function initAnimations() {
  updateCanvasDimensions(true);
  render();

  window.addEventListener(
    "resize",
    () => {
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        if (updateCanvasDimensions(false)) {
          render();
        }
      });
    },
    { passive: true }
  );

  const cards = document.querySelectorAll(".content-card");
  const stepContainers = document.querySelectorAll(".step");

  // Reduced motion or missing CDN fallback: reveal cards cleanly without scroll-jacking
  if (prefersReducedMotion || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    cards.forEach((card) => {
      card.style.opacity = "1";
      card.style.transform = "none";
    });

    if (!prefersReducedMotion) {
      const scrollEl = document.querySelector(".scroll-container");
      window.addEventListener(
        "scroll",
        () => {
          const maxScroll = Math.max(1, scrollEl.offsetHeight - window.innerHeight);
          const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
          state.frame = Math.round(progress * (FRAME_COUNT - 1));
          scheduleRender();
        },
        { passive: true }
      );
    }
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // Main scroll timeline for canvas frames
  gsap.to(state, {
    frame: FRAME_COUNT - 1,
    snap: "frame",
    ease: "none",
    scrollTrigger: {
      scrub: 0.4,
      trigger: ".scroll-container",
      start: "top top",
      end: "bottom bottom"
    },
    onUpdate: render
  });

  // Entrance + scroll-linked animations for each step card
  const mm = gsap.matchMedia();

  cards.forEach((card, i) => {
    const isLast = (i === cards.length - 1);

    if (i === 0) {
      // First card sits in the initial viewport: smooth entrance on unlock
      gsap.fromTo(
        card,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.85, ease: "power2.out", delay: 0.15 }
      );
    } else if (!isLast) {
      gsap.fromTo(
        card,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          ease: "power2.out",
          scrollTrigger: {
            trigger: stepContainers[i],
            start: "top 75%",
            end: "top 30%",
            scrub: 0.8
          }
        }
      );
    } else {
      // Last card (#step-5 "Vibe Code or Die")
      // Desktop (min-width: 769px): standard scroll-linked animation
      mm.add("(min-width: 769px)", () => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            ease: "power2.out",
            scrollTrigger: {
              trigger: stepContainers[i],
              start: "top 75%",
              end: "top 30%",
              scrub: 0.8
            }
          }
        );
      });

      // Mobile (max-width: 768px):
      // Fade in on scroll, hide when scrolled all the way to the bottom to unblock face,
      // and show it back again whenever the user interacts/taps.
      mm.add("(max-width: 768px)", () => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            ease: "power2.out",
            scrollTrigger: {
              trigger: stepContainers[i],
              start: "top 75%",
              end: "top 30%",
              scrub: 0.8
            }
          }
        );

        let fadeOutTimeout = null;
        let isFadedOut = false;
        let isAtBottom = false;

        const hideCard = () => {
          if (isFadedOut) return;
          gsap.to(card, {
            opacity: 0,
            duration: 0.7,
            overwrite: "auto",
            onComplete: () => {
              if (isFadedOut) card.style.pointerEvents = "none";
            }
          });
          isFadedOut = true;
        };

        const showCard = () => {
          if (!isFadedOut) return;
          card.style.pointerEvents = "auto";
          gsap.to(card, {
            opacity: 1,
            duration: 0.4,
            overwrite: "auto"
          });
          isFadedOut = false;
        };

        const scheduleFadeOut = (delay = 1800) => {
          if (fadeOutTimeout) clearTimeout(fadeOutTimeout);
          fadeOutTimeout = setTimeout(() => {
            if (isAtBottom) {
              hideCard();
            }
          }, delay);
        };

        const handleInteraction = () => {
          if (isFadedOut) {
            showCard();
            if (isAtBottom) {
              scheduleFadeOut(3000);
            }
          } else if (isAtBottom) {
            scheduleFadeOut(3000);
          }
        };

        window.addEventListener("touchstart", handleInteraction, { passive: true });
        window.addEventListener("pointerdown", handleInteraction, { passive: true });
        window.addEventListener("click", handleInteraction, { passive: true });

        const bottomTrigger = ScrollTrigger.create({
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            const nearBottom =
              self.progress >= 0.98 ||
              window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60;

            if (nearBottom) {
              isAtBottom = true;
              if (!fadeOutTimeout && !isFadedOut) {
                scheduleFadeOut(1800);
              }
            } else {
              isAtBottom = false;
              if (fadeOutTimeout) {
                clearTimeout(fadeOutTimeout);
                fadeOutTimeout = null;
              }
              if (isFadedOut) {
                showCard();
              }
            }
          }
        });

        return () => {
          if (fadeOutTimeout) clearTimeout(fadeOutTimeout);
          window.removeEventListener("touchstart", handleInteraction);
          window.removeEventListener("pointerdown", handleInteraction);
          window.removeEventListener("click", handleInteraction);
          bottomTrigger.kill();
        };
      });
    }
  });
}

function streamRemainingFrames(criticalSet) {
  const queue = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    if (!criticalSet.has(i)) {
      queue.push(i);
    }
  }

  let cursor = 0;
  function nextWorker() {
    if (cursor >= queue.length) return;
    const frameIndex = queue[cursor++];
    loadSingleFrame(frameIndex).then(() => {
      if (Math.abs(frameIndex - state.frame) <= 12) {
        scheduleRender();
      }
      nextWorker();
    });
  }

  const workers = Math.min(MAX_BACKGROUND_CONCURRENCY, queue.length);
  for (let w = 0; w < workers; w++) {
    nextWorker();
  }
}

async function boot() {
  // Fast path for users who prefer reduced motion: load 1 single hero frame
  if (prefersReducedMotion) {
    state.frame = FRAME_COUNT - 1;
    await loadSingleFrame(FRAME_COUNT - 1);
    isUnlocked = true;
    initAnimations();
    hideLoaderAndReveal();
    return;
  }

  const criticalIndices = buildCriticalIndices();
  const criticalSet = new Set(criticalIndices);
  let completedCritical = 0;

  const unlockOnce = () => {
    if (isUnlocked) return;
    isUnlocked = true;
    clearTimeout(failsafeTimer);
    initAnimations();
    hideLoaderAndReveal();
    streamRemainingFrames(criticalSet);
  };

  // Failsafe timer so a stalled frame request never traps the user on #loader
  const failsafeTimer = setTimeout(() => {
    unlockOnce();
  }, LOADER_FAILSAFE_MS);

  // Ensure Frame 1 starts immediately with top priority
  await loadSingleFrame(0);
  completedCritical++;
  updateProgressUI(completedCritical, criticalIndices.length);

  const remainingCritical = criticalIndices.filter((idx) => idx !== 0);
  await Promise.all(
    remainingCritical.map((idx) =>
      loadSingleFrame(idx).then(() => {
        completedCritical++;
        if (!isUnlocked) {
          updateProgressUI(completedCritical, criticalIndices.length);
        }
      })
    )
  );

  unlockOnce();
}

boot();
