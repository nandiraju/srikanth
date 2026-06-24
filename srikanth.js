const canvas = document.getElementById("parallax-canvas");
const context = canvas.getContext("2d");
const progressBar = document.getElementById("progress-bar");
const loader = document.getElementById("loader");
const mainContent = document.getElementById("main-content");

const frameCount = 192;
const currentFrame = index => (
  `asset/nsri_frames/frame_${index.toString().padStart(4, '0')}.webp`
);

const images = [];
const airbnb = {
  frame: 0
};

// Preload images
let imagesLoaded = 0;

function preloadImages() {
  for (let i = 1; i <= frameCount; i++) {
    const img = new Image();
    img.src = currentFrame(i);
    img.onload = () => {
      imagesLoaded++;
      const progress = (imagesLoaded / frameCount) * 100;
      progressBar.style.width = `${progress}%`;

      if (imagesLoaded === frameCount) {
        initGSAP();
      }
    };
    img.onerror = () => {
      console.error(`Failed to load frame: ${img.src}`);
      imagesLoaded++; // Still count as loaded to avoid blocking loader
      if (imagesLoaded === frameCount) {
        initGSAP();
      }
    };
    images.push(img);
  }
}

function initGSAP() {
  // Hide loader
  loader.style.opacity = "0";
  setTimeout(() => {
    loader.style.display = "none";
    mainContent.style.opacity = "1";
  }, 800);

  gsap.registerPlugin(ScrollTrigger);

  // Initial canvas setup
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
  });

  // Main scroll timeline for frames
  gsap.to(airbnb, {
    frame: frameCount - 1,
    snap: "frame",
    ease: "none",
    scrollTrigger: {
      scrub: 0.5,
      trigger: ".scroll-container",
      start: "top top",
      end: "bottom bottom"
    },
    onUpdate: render
  });

  // Individual steps animations
  const steps = document.querySelectorAll(".content-card");
  const mm = gsap.matchMedia();

  steps.forEach((step, i) => {
    const isLast = (i === steps.length - 1);

    if (isLast) {
      // For the last card:
      // On desktop (min-width: 769px), standard fade in
      mm.add("(min-width: 769px)", () => {
        gsap.to(step, {
          opacity: 1,
          y: 0,
          duration: 1,
          scrollTrigger: {
            trigger: document.querySelectorAll(".step")[i],
            start: "top 60%",
            end: "top 20%",
            scrub: 1,
            toggleActions: "play reverse play reverse"
          }
        });
      });

      // On mobile (max-width: 768px), fade in, and then fade out 2 seconds after scrolling to the bottom
      mm.add("(max-width: 768px)", () => {
        // 1. Standard fade-in scrub
        gsap.to(step, {
          opacity: 1,
          y: 0,
          duration: 1,
          scrollTrigger: {
            trigger: document.querySelectorAll(".step")[i],
            start: "top 60%",
            end: "top 20%",
            scrub: 1,
            toggleActions: "play reverse play reverse"
          }
        });

        // 2. Fade out 2 seconds after reaching the absolute bottom
        let fadeOutTimeout = null;
        let isFadedOut = false;

        ScrollTrigger.create({
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            if (self.progress >= 0.99) {
              if (!fadeOutTimeout && !isFadedOut) {
                fadeOutTimeout = setTimeout(() => {
                  gsap.to(step, {
                    opacity: 0,
                    duration: 0.8,
                    overwrite: "auto"
                  });
                  isFadedOut = true;
                }, 2000);
              }
            } else {
              if (fadeOutTimeout) {
                clearTimeout(fadeOutTimeout);
                fadeOutTimeout = null;
              }
              if (isFadedOut) {
                gsap.to(step, {
                  opacity: 1,
                  duration: 0.5,
                  overwrite: "auto"
                });
                isFadedOut = false;
              }
            }
          }
        });
      });
    } else {
      // For all other cards, standard animation on all screen sizes
      gsap.to(step, {
        opacity: 1,
        y: 0,
        duration: 1,
        scrollTrigger: {
          trigger: document.querySelectorAll(".step")[i],
          start: "top 60%",
          end: "top 20%",
          scrub: 1,
          toggleActions: "play reverse play reverse"
        }
      });
    }
  });

  // Draw the first frame
  render();
}

function render() {
  const img = images[airbnb.frame];
  if (!img || !img.complete) return;

  const canvasRatio = canvas.width / canvas.height;
  const imgRatio = img.width / img.height;

  let drawWidth, drawHeight, offsetX, offsetY;

  if (canvasRatio > imgRatio) {
    drawWidth = canvas.width;
    drawHeight = canvas.width / imgRatio;
    offsetX = 0;
    offsetY = (canvas.height - drawHeight) / 2;
  } else {
    drawWidth = canvas.height * imgRatio;
    drawHeight = canvas.height;
    offsetX = (canvas.width - drawWidth) / 2;
    offsetY = 0;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

// Start
preloadImages();
