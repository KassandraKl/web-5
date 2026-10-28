import { input, consumeJump } from "./input.js";

export class Player {
  constructor(x, y) {
    this.w = 32;
    this.h = 32;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = 1;
    this.MOVE_SPEED = 300;   
    this.JUMP_SPEED = 800;   
    this.GRAVITY    = 2400;  
    this.MAX_FALL   = 1300;  
    this.ACCEL      = 2600; 
    this.DECEL      = 3200; 
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.facing = 1;
  }


  step(dt) {
    const prev = { x: this.x, y: this.y };


    const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetVx = target * this.MOVE_SPEED;
    if (target !== 0) {
      this.facing = target;
      const diff = targetVx - this.vx;
      const accel = this.ACCEL * dt;
      this.vx += Math.abs(diff) < accel ? diff : Math.sign(diff) * accel;
    } else {
      const accel = this.DECEL * dt;
      if (Math.abs(this.vx) <= accel) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * accel;
    }

    if (consumeJump()) {
      if (this.onGround) {
        this.vy = -this.JUMP_SPEED;
        this.onGround = false;
        this._jumped = true;
      }
    }

    this.vy += this.GRAVITY * dt;
    if (this.vy > this.MAX_FALL) this.vy = this.MAX_FALL;

    return prev;
  }
}