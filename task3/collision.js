export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}


export function resolvePlayer(player, prev, platforms, dt) {
  player.x += player.vx * dt;
  for (const p of platforms) {
    if (!overlap(player, p)) continue;
    if (player.vx > 0)      player.x = p.x - player.w;
    else if (player.vx < 0) player.x = p.x + p.w;
  }

  const prevBottom = prev.y + player.h;
  player.y += player.vy * dt;

  let onGround = false;
  for (const p of platforms) {
    if (!overlap(player, p)) continue;

    if (player.vy > 0 && prevBottom <= p.y + 2) {
      player.y = p.y - player.h;
      player.vy = 0;
      onGround = true;
    } else if (player.vy < 0) {
      player.y = p.y + p.h;
      player.vy = 0;
    } else {
      if (player.vy > 0) {
        player.y = p.y - player.h;
        player.vy = 0;
        onGround = true;
      } else {
        player.y = p.y + p.h;
        player.vy = 0;
      }
    }
  }

  return { onGround };
}