import { Game } from "./game.js";
import { bindTouchControls, setPauseHandler } from "./input.js";

const canvas = document.getElementById("game");

const ui = {
  overlay:      document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText:  document.getElementById("overlay-text"),
  startBtn:     document.getElementById("start-btn"),
  pauseBtn:     document.getElementById("pause-btn"),
  restartBtn:   document.getElementById("restart-btn"),
  scoreEl:      document.getElementById("score"),
  recordEl:     document.getElementById("record"),
  timerEl:      document.getElementById("timer"),
  soundBtn:     document.getElementById("sound-btn"),
};

const game = new Game(canvas, ui);


bindTouchControls({
  btnLeft:  document.getElementById("btn-left"),
  btnRight: document.getElementById("btn-right"),
  btnJump:  document.getElementById("btn-jump"),
});


setPauseHandler(() => game.togglePause());


game.showOverlay(
  "СПАСИ СКЕЛЕТИКА",
  `Собери <b>3 части скелетика</b> и доберись до пещеры.<br>
   ← → / A D — движение · SPACE / W — прыжок.<br>
   Осторожно: шипы, летучие мыши и пропасти!`,
  "СТАРТ"
);