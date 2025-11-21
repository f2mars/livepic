type SpriteMeta = {
  gridSize: number;
  spritePictureSize: number;
};

const basePath = getBasePath();
const { gridSize, spritePictureSize } = await loadSpriteMeta();
const livepic = document.querySelector<HTMLElement>(".livepic");

try {
  await initStyles();
  init();
} catch (error) {
  console.error("Failed to init preview:", error);
}

async function initStyles() {
  if (!livepic) {
    throw new Error("Preview element .livepic not found.");
  }

    const spriteWidth = gridSize * spritePictureSize;
    const spriteUrl = assetPath("output/AvatarSprite.webp");

    livepic.style.setProperty("--cell-size", `${spritePictureSize}px`);
    livepic.style.width = `${spritePictureSize}px`;
    livepic.style.height = `${spritePictureSize}px`;
    livepic.style.backgroundSize = `${spriteWidth}px ${spriteWidth}px`;
    livepic.style.backgroundImage = `url(${spriteUrl})`;
  }

async function loadSpriteMeta(): Promise<SpriteMeta> {
  const response = await fetch(assetPath("output/sprite.json"));
  if (!response.ok) {
    throw new Error(`Unable to load sprite metadata: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function init() {
  const FPS = 30;
  
  let lastFrameTime = 0;
  let pointerX = null;
  let pointerY = null;
  let rect = livepic.getBoundingClientRect();
  let isVisible = true;

  let maxDistanceX = Math.max(rect.left, innerWidth - rect.right);
  let maxDistanceY = Math.max(rect.top, innerHeight - rect.bottom);

  window.addEventListener("resize", updateRect);
  window.addEventListener("scroll", updateRect, { passive: true });
  document.addEventListener("mousemove", updateCoordinats);
  document.addEventListener("touchmove", handleTouch);

  updateFrame();

  function handleTouch(e: TouchEvent) {
    const touch = e.touches[0];
    updateCoordinats(touch);
  }

  function updateCoordinats(e: MouseEvent | Touch) {
    pointerX = e.clientX;
    pointerY = e.clientY;
  }

  function updateRect() {
    rect = livepic.getBoundingClientRect();

    const horizontallyVisible =
      rect.right >= 0 && rect.left <= window.innerWidth;
    const verticallyVisible =
      rect.bottom >= 0 && rect.top <= window.innerHeight;

    maxDistanceX = Math.max(rect.left, innerWidth - rect.right);
    maxDistanceY = Math.max(rect.top, innerHeight - rect.bottom);
    
    isVisible = horizontallyVisible && verticallyVisible;
  }

  function updateFrame() {
    requestAnimationFrame(updateFrame);

    if (!isVisible) return;
    if (pointerX === null || pointerY === null) return;
    if (document.visibilityState === "hidden") return;

    const now = performance.now();
    if (now - lastFrameTime < 1000 / FPS) return;
    lastFrameTime = now;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = pointerX - centerX;
    const deltaY = pointerY - centerY;

    const normX = Math.max(-1, Math.min(1, deltaX / maxDistanceX));
    const normY = Math.max(-1, Math.min(1, deltaY / maxDistanceY));

    const frameX = Math.round(((normX + 1) / 2) * (gridSize - 1));
    const frameY = Math.round(((normY + 1) / 2) * (gridSize - 1));

    const posX = (frameX / (gridSize - 1)) * 100;
    const posY = (frameY / (gridSize - 1)) * 100;

    livepic.style.backgroundPosition = posX + "% " + posY + "%";
  }
}

function getBasePath() {
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function assetPath(relative: string) {
  const cleaned = relative.startsWith("/") ? relative.slice(1) : relative;
  return `${basePath}${cleaned}`;
}
