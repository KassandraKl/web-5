export const input = {
  left: false,
  right: false,
  jumpHeld: false,
  jumpQueued: false, // «нажатие» съедается раз за прыжок
};

const KEYS_LEFT  = new Set(["arrowleft", "a"]);
const KEYS_RIGHT = new Set(["arrowright", "d"]);
const KEYS_JUMP  = new Set(["arrowup", "w", " "]);
const KEYS_PAUSE = new Set(["escape", "p"]);

let pauseHandler = null;
export function setPauseHandler(fn) { pauseHandler = fn; }
export const gameActive = { value: false };

export function resetInput() {
  input.left = false;
  input.right = false;
  input.jumpHeld = false;
  input.jumpQueued = false;
}

export function consumeJump() {
  if (input.jumpQueued) {
    input.jumpQueued = false;
    return true;
  }
  return false;
}

function onKeyDown(e) {
  const k = e.key.toLowerCase();

  if (gameActive.value) {
    if (KEYS_LEFT.has(k) || KEYS_RIGHT.has(k) || KEYS_JUMP.has(k) ||
        KEYS_PAUSE.has(k) || k === "enter") {
      e.preventDefault();
    }
  }

  if (KEYS_LEFT.has(k))  input.left  = true;
  if (KEYS_RIGHT.has(k)) input.right = true;
  if (KEYS_JUMP.has(k)) {
    if (!input.jumpHeld) input.jumpQueued = true;
    input.jumpHeld = true;
  }
  if (KEYS_PAUSE.has(k) && pauseHandler) pauseHandler();
}

function onKeyUp(e) {
  const k = e.key.toLowerCase();
  if (KEYS_LEFT.has(k))  input.left  = false;
  if (KEYS_RIGHT.has(k)) input.right = false;
  if (KEYS_JUMP.has(k))  input.jumpHeld = false;
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

function bindHold(el, onPress, onRelease) {
  const start = (e) => { e.preventDefault(); onPress(); };
  const end   = (e) => { e.preventDefault(); onRelease(); };
  el.addEventListener("touchstart", start, { passive: false });
  el.addEventListener("touchend", end);
  el.addEventListener("touchcancel", end);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", end);
}

export function bindTouchControls({ btnLeft, btnRight, btnJump }) {
  bindHold(btnLeft,  () => input.left  = true,  () => input.left  = false);
  bindHold(btnRight, () => input.right = true,  () => input.right = false);
  bindHold(
    btnJump,
    () => {
      if (!input.jumpHeld) input.jumpQueued = true;
      input.jumpHeld = true;
    },
    () => { input.jumpHeld = false; }
  );
}